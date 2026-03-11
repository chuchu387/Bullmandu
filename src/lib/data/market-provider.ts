import { analyzeStock } from "@/lib/analysis/engine";
import { getRealHistory } from "@/lib/data/historical-provider";
import { marketDataBot } from "@/lib/data/market-bot";
import { getOfficialSecurities, getOfficialTodayPrices } from "@/lib/data/official-market-provider";
import { MOCK_STOCKS } from "@/lib/data/mock-market";
import type { AnalysisResult, MarketSummary, StockQuote } from "@/types";

type StockListCache = {
  fetchedAt: number;
  stocks: StockQuote[];
};

type AnalysisCache = {
  fetchedAt: number;
  analysis: AnalysisResult | null;
};

type SummaryCache = {
  fetchedAt: number;
  summary: MarketSummary;
};

let stockListCache: StockListCache | null = null;
const analysisCache = new Map<string, AnalysisCache>();
let summaryCache: SummaryCache | null = null;
const listInflight = new Map<string, Promise<StockQuote[]>>();
const analysisInflight = new Map<string, Promise<AnalysisResult | null>>();
let summaryInflight: Promise<MarketSummary> | null = null;

export class MarketDataProvider {
  async listStocks() {
    if (stockListCache && Date.now() - stockListCache.fetchedAt < 1000 * 60 * 2) {
      return stockListCache.stocks;
    }

    const pending = listInflight.get("stocks");
    if (pending) {
      return pending;
    }

    const task = this.fetchStocks();
    listInflight.set("stocks", task);
    try {
      const stocks = await task;
      stockListCache = {
        fetchedAt: Date.now(),
        stocks
      };
      listInflight.delete("stocks");
      return stocks;
    } catch (error) {
      listInflight.delete("stocks");
      throw error;
    }
  }

  private async fetchStocks() {
    try {
      const [securities, todayPrices] = await Promise.all([
        getOfficialSecurities(),
        getOfficialTodayPrices()
      ]);
      const todayMap = new Map(todayPrices.map((item) => [item.symbol, item]));
      const fallbackMap = new Map(MOCK_STOCKS.map((item) => [item.symbol, item]));

      return securities.map<StockQuote>((security) => {
        const today = todayMap.get(security.symbol);
        const fallback = fallbackMap.get(security.symbol);
        const currentPrice = today?.lastUpdatedPrice ?? today?.closePrice ?? fallback?.currentPrice ?? 0;
        const previousClose = today?.previousDayClosePrice ?? fallback?.previousClose ?? currentPrice;
        const volume = today?.totalTradedQuantity ?? fallback?.volume ?? 0;

        return {
          symbol: security.symbol,
          companyName: security.companyName || security.securityName,
          sector: security.sectorName || "Other",
          currentPrice,
          previousClose,
          volume,
          history: fallback?.history ?? []
        };
      });
    } catch {
      return marketDataBot.enrichStocks(MOCK_STOCKS);
    }
  }

  async search(query: string) {
    const term = query.trim().toLowerCase();
    const stocks = await this.listStocks();
    return stocks
      .filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(term) ||
          stock.companyName.toLowerCase().includes(term)
      )
      .sort((left, right) => rankMatch(left, term) - rankMatch(right, term));
  }

  async getStock(symbol: string) {
    const stocks = await this.listStocks();
    return stocks.find((stock) => stock.symbol === symbol.toUpperCase()) ?? null;
  }

  async resolveStock(query: string) {
    const term = query.trim().toLowerCase();
    if (!term) {
      return null;
    }

    const stocks = await this.listStocks();

    return (
      stocks.find((stock) => stock.symbol.toLowerCase() === term) ??
      stocks.find((stock) => stock.companyName.toLowerCase() === term) ??
      stocks.find(
        (stock) =>
          stock.symbol.toLowerCase().includes(term) || stock.companyName.toLowerCase().includes(term)
      ) ??
      null
    );
  }

  async getAnalysis(symbol: string): Promise<AnalysisResult | null> {
    const normalizedSymbol = symbol.toUpperCase();
    const cached = analysisCache.get(normalizedSymbol);
    if (cached && Date.now() - cached.fetchedAt < 1000 * 60) {
      return cached.analysis;
    }

    const pending = analysisInflight.get(normalizedSymbol);
    if (pending) {
      return pending;
    }

    const task = this.buildAnalysis(normalizedSymbol);
    analysisInflight.set(normalizedSymbol, task);

    try {
      const analysis = await task;
      analysisCache.set(normalizedSymbol, {
        fetchedAt: Date.now(),
        analysis
      });
      analysisInflight.delete(normalizedSymbol);
      return analysis;
    } catch (error) {
      analysisInflight.delete(normalizedSymbol);
      throw error;
    }
  }

  private async buildAnalysis(symbol: string): Promise<AnalysisResult | null> {
    await marketDataBot.persistCurrentSnapshots();
    const stock = await this.resolveStock(symbol);
    if (!stock) {
      return null;
    }

    let effectiveStock = stock;
    try {
      const realHistory = await getRealHistory(stock.symbol, 365);
      if (realHistory.length >= 30) {
        const latestClose = realHistory.at(-1)?.close ?? stock.currentPrice;
        const previousClose =
          realHistory.length > 1 ? realHistory.at(-2)?.close ?? stock.previousClose : stock.previousClose;
        const currentPrice = stock.currentPrice > 0 ? stock.currentPrice : latestClose;
        const mergedHistory =
          realHistory.at(-1)?.date === new Date().toISOString().slice(0, 10)
            ? realHistory.map((point, index, list) =>
                index === list.length - 1
                  ? { ...point, close: currentPrice, volume: stock.volume || point.volume }
                  : point
              )
            : [
                ...realHistory,
                {
                  date: new Date().toISOString().slice(0, 10),
                  close: currentPrice,
                  volume: stock.volume
                }
              ];

        effectiveStock = {
          ...stock,
          currentPrice,
          previousClose,
          history: mergedHistory.slice(-365)
        };
      }
    } catch {
      effectiveStock = stock;
    }

    const analysis = analyzeStock(effectiveStock);
    const liveChart = await marketDataBot.getLiveChart(effectiveStock.symbol);
    const liveQuoteSeries = await marketDataBot.getQuoteSeries(effectiveStock.symbol);

    return {
      ...analysis,
      liveChart,
      liveSources: liveQuoteSeries.map((quote) => quote.source)
    };
  }

  async getMarketSummary(): Promise<MarketSummary> {
    if (summaryCache && Date.now() - summaryCache.fetchedAt < 1000 * 60) {
      return summaryCache.summary;
    }

    if (summaryInflight) {
      return summaryInflight;
    }

    summaryInflight = this.buildMarketSummary();
    try {
      const summary = await summaryInflight;
      summaryCache = {
        fetchedAt: Date.now(),
        summary
      };
      summaryInflight = null;
      return summary;
    } catch (error) {
      summaryInflight = null;
      throw error;
    }
  }

  private async buildMarketSummary(): Promise<MarketSummary> {
    const liveStocks = (await this.listStocks()).filter(
      (stock) => stock.currentPrice > 0 && stock.previousClose > 0
    );
    const ranked = [...liveStocks].sort(
      (a, b) =>
        (b.currentPrice - b.previousClose) / b.previousClose -
        (a.currentPrice - a.previousClose) / a.previousClose
    );
    const analyses = liveStocks.map((stock) => analyzeStock(stock));
    const recommendationDistribution = analyses.reduce<MarketSummary["recommendationDistribution"]>(
      (accumulator, analysis) => {
        accumulator[analysis.recommendation] += 1;
        return accumulator;
      },
      {
        "Strong Buy": 0,
        Buy: 0,
        Hold: 0,
        Sell: 0,
        "Strong Sell": 0
      }
    );

    return {
      topGainers: ranked.slice(0, 3),
      topLosers: ranked.slice(-3).reverse(),
      trending: [...liveStocks].sort((a, b) => b.volume - a.volume).slice(0, 4),
      recentSearches: liveStocks.slice(0, 4),
      recommendationDistribution,
      marketBreadth: {
        advancers: ranked.filter((stock) => stock.currentPrice > stock.previousClose).length,
        decliners: ranked.filter((stock) => stock.currentPrice < stock.previousClose).length,
        unchanged: ranked.filter((stock) => stock.currentPrice === stock.previousClose).length
      }
    };
  }
}

export const marketDataProvider = new MarketDataProvider();

export function dailyChange(stock: StockQuote) {
  const delta = stock.currentPrice - stock.previousClose;
  const deltaPercent = stock.previousClose === 0 ? 0 : (delta / stock.previousClose) * 100;
  return {
    delta,
    deltaPercent
  };
}

function rankMatch(stock: StockQuote, term: string) {
  const symbol = stock.symbol.toLowerCase();
  const companyName = stock.companyName.toLowerCase();

  if (symbol === term) return 0;
  if (companyName === term) return 1;
  if (symbol.startsWith(term)) return 2;
  if (companyName.startsWith(term)) return 3;
  if (symbol.includes(term)) return 4;
  return 5;
}
