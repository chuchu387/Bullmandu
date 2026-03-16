import { chukulScraper, liveNepseScraper, shareSansarScraper } from "@/lib/data/live-scrapers";
import { db } from "@/lib/db";
import { MOCK_STOCKS } from "@/lib/data/mock-market";
import { buildIntradayBuckets, getFiveMinuteBucket, getTradingDay, isWithinLiveTradingWindow } from "@/lib/data/time";
import type { LiveChartPoint, LiveQuote, StockQuote } from "@/types";

type CacheState = {
  fetchedAt: number;
  quotes: Map<string, LiveQuote>;
  quoteSeries: Map<string, LiveQuote[]>;
  sources: string[];
  errors: string[];
};

type PersistSnapshotsResult = {
  saved: number;
  tradingDay: string;
  bucketLabel: string;
};

const cache: CacheState = {
  fetchedAt: 0,
  quotes: new Map(),
  quoteSeries: new Map(),
  sources: [],
  errors: []
};

const TTL_MS = 1000 * 30; // 30 seconds cache for fresher data
const BASELINE_MAP = new Map(MOCK_STOCKS.map((stock) => [stock.symbol, stock.currentPrice]));
const persistState = {
  key: "",
  result: null as PersistSnapshotsResult | null,
  pending: null as Promise<PersistSnapshotsResult> | null
};

function isReasonableQuote(symbol: string, quote: LiveQuote) {
  if (quote.currentPrice <= 0 || quote.previousClose <= 0) {
    return false;
  }

  const baseline = BASELINE_MAP.get(symbol);
  if (!baseline) {
    // No baseline - accept if change is within 30% (more lenient for after-hours)
    return Math.abs(quote.currentPrice - quote.previousClose) / quote.previousClose <= 0.3;
  }

  const ratio = quote.currentPrice / baseline;
  const previousCloseRatio = quote.previousClose / baseline;
  const changeRatio = Math.abs(quote.currentPrice - quote.previousClose) / quote.previousClose;

  if (quote.rawChangePercent !== undefined && Math.abs(quote.rawChangePercent) > 20) {
    return false;
  }

  // More lenient thresholds to accept real market prices
  return (
    ratio >= 0.35 &&  // Was 0.55, now accepts prices down to 35% of baseline
    ratio <= 2.5 &&   // Was 1.8, now accepts prices up to 250% of baseline
    previousCloseRatio >= 0.35 &&
    previousCloseRatio <= 2.5 &&
    changeRatio <= 0.3  // Was 0.2, now accepts 30% daily moves
  );
}

function scoreQuote(quote: LiveQuote, median: number) {
  const distance = Math.abs(quote.currentPrice - median);
  const volumeBonus = quote.volume > 0 ? 0.5 : 0;
  const sourceBonus =
    quote.source === "livenepse" ? 0.5 : quote.source === "sharesansar" ? 0.25 : 0.1;
  const stabilityPenalty =
    Math.abs(quote.currentPrice - quote.previousClose) / Math.max(quote.previousClose, 1) > 0.1 ? 0.75 : 0;

  return distance - volumeBonus - sourceBonus + stabilityPenalty;
}

function chooseBestQuote(quotes: LiveQuote[]) {
  const orderedPrices = quotes.map((quote) => quote.currentPrice).sort((a, b) => a - b);
  const median = orderedPrices[Math.floor(orderedPrices.length / 2)];

  return [...quotes].sort((left, right) => scoreQuote(left, median) - scoreQuote(right, median))[0];
}

function buildLiveChart(quotes: LiveQuote[]): LiveChartPoint[] {
  return [...quotes]
    .sort((left, right) => left.asOf.localeCompare(right.asOf) || left.source.localeCompare(right.source))
    .map((quote, index) => ({
      date: `${quote.source.toUpperCase()} ${index + 1}`,
      price: Number(quote.currentPrice.toFixed(2)),
      source: quote.source
    }));
}

function mergeQuotes(target: Map<string, LiveQuote[]>, incoming: Map<string, LiveQuote>) {
  for (const [symbol, quote] of incoming.entries()) {
    if (!isReasonableQuote(symbol, quote)) {
      continue;
    }

    const existing = target.get(symbol) ?? [];
    existing.push(quote);
    target.set(symbol, existing);
  }
}

export class MarketDataBot {
  private scrapers = [shareSansarScraper, liveNepseScraper, chukulScraper]; // sharesansar first for accuracy

  async scrapeAll(force = false) {
    const now = Date.now();
    if (!force && cache.quotes.size && now - cache.fetchedAt < TTL_MS) {
      return cache;
    }

    const merged = new Map<string, LiveQuote>();
    const quoteSeries = new Map<string, LiveQuote[]>();
    const sources: string[] = [];
    const errors: string[] = [];

    const results = await Promise.allSettled(
      this.scrapers.map(async (scraper) => {
        const quotes = await scraper.scrape();
        return {
          name: scraper.name,
          quotes
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        sources.push(result.value.name);
        mergeQuotes(quoteSeries, result.value.quotes);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : "Unknown scraper error");
      }
    }

    for (const [symbol, quotes] of quoteSeries.entries()) {
      merged.set(symbol, chooseBestQuote(quotes));
    }

    cache.fetchedAt = now;
    cache.quotes = merged;
    cache.quoteSeries = quoteSeries;
    cache.sources = sources;
    cache.errors = errors;

    return cache;
  }

  async getQuote(symbol: string) {
    const state = await this.scrapeAll();
    return state.quotes.get(symbol.toUpperCase()) ?? null;
  }

  async getQuoteSeries(symbol: string) {
    const state = await this.scrapeAll();
    return state.quoteSeries.get(symbol.toUpperCase()) ?? [];
  }

  async getLiveChart(symbol: string) {
    const tradingDay = getTradingDay();
    const stored = await db.livePriceSnapshot.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        tradingDay
      },
      orderBy: {
        capturedAt: "asc"
      }
    });

    if (stored.length) {
      const latestByBucket = new Map<string, (typeof stored)[number]>();
      for (const snapshot of stored) {
        latestByBucket.set(snapshot.bucketLabel, snapshot);
      }

      return buildIntradayBuckets()
        .map((bucket) => latestByBucket.get(bucket))
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
        .map((snapshot) => ({
          date: snapshot.bucketLabel,
          price: Number(snapshot.price.toFixed(2)),
          source: snapshot.source
        }));
    }

    const series = await this.getQuoteSeries(symbol);
    return buildLiveChart(series);
  }

  async persistCurrentSnapshots() {
    const tradingDay = getTradingDay();
    const bucketLabel = getFiveMinuteBucket();
    const persistKey = `${tradingDay}:${bucketLabel}`;

    if (!isWithinLiveTradingWindow()) {
      return { saved: 0, tradingDay, bucketLabel };
    }

    if (persistState.key === persistKey && persistState.result) {
      return persistState.result;
    }

    if (persistState.key === persistKey && persistState.pending) {
      return persistState.pending;
    }

    persistState.key = persistKey;

    const task = (async () => {
      const state = await this.scrapeAll(true);
      let saved = 0;

      for (const [symbol, quotes] of state.quoteSeries.entries()) {
        const best = chooseBestQuote(quotes);
        await db.livePriceSnapshot.upsert({
          where: {
            symbol_tradingDay_bucketLabel_source: {
              symbol,
              tradingDay,
              bucketLabel,
              source: best.source
            }
          },
          update: {
            price: best.currentPrice,
            previousClose: best.previousClose,
            volume: best.volume,
            capturedAt: new Date()
          },
          create: {
            symbol,
            tradingDay,
            bucketLabel,
            source: best.source,
            price: best.currentPrice,
            previousClose: best.previousClose,
            volume: best.volume,
            capturedAt: new Date()
          }
        });
        saved += 1;
      }

      const result = { saved, tradingDay, bucketLabel };
      persistState.result = result;
      persistState.pending = null;
      return result;
    })().catch((error) => {
      persistState.pending = null;
      persistState.result = null;
      persistState.key = "";
      throw error;
    });

    persistState.pending = task;
    return task;
  }

  async enrichStocks(stocks: StockQuote[]) {
    let state: CacheState;
    try {
      state = await this.scrapeAll();
    } catch {
      return stocks;
    }
    return stocks.map((stock) => {
      const live = state.quotes.get(stock.symbol);
      if (!live) {
        return stock;
      }

      return {
        ...stock,
        currentPrice: live.currentPrice || stock.currentPrice,
        previousClose: live.previousClose || stock.previousClose,
        volume: live.volume || stock.volume
      };
    });
  }

  async snapshot(force = false) {
    const state = await this.scrapeAll(force);
    return {
      fetchedAt: new Date(state.fetchedAt).toISOString(),
      quoteCount: state.quotes.size,
      sources: state.sources,
      errors: state.errors,
      quotes: Array.from(state.quotes.values()).slice(0, 50)
    };
  }
}

export const marketDataBot = new MarketDataBot();
