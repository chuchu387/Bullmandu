import { load } from "cheerio";
import { NEPSE_UNIVERSE } from "@/lib/data/nepse-universe";
import type { LiveQuote } from "@/types";

type QuoteMap = Map<string, LiveQuote>;
const KNOWN_SYMBOLS: Set<string> = new Set(NEPSE_UNIVERSE.map((item) => item.symbol));

export type LiveScraper = {
  name: string;
  url: string;
  scrape: () => Promise<QuoteMap>;
};

function normalizeNumber(raw: string | undefined) {
  if (!raw) {
    return 0;
  }

  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSymbol(raw: string) {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (KNOWN_SYMBOLS.has(cleaned)) {
    return cleaned;
  }

  const suffixMatch = Array.from(KNOWN_SYMBOLS).find((symbol) => cleaned.endsWith(symbol));
  return suffixMatch ?? cleaned;
}

function normalizeHeader(raw: string) {
  return raw.toLowerCase().replace(/%/g, "percent").replace(/[^a-z]/g, "");
}

function toQuote(symbol: string, values: Partial<LiveQuote> & Pick<LiveQuote, "currentPrice">, source: string): LiveQuote {
  const normalizedSymbol = normalizeSymbol(symbol);
  return {
    symbol: normalizedSymbol,
    currentPrice: values.currentPrice,
    previousClose: values.previousClose ?? Math.max(values.currentPrice - (values.rawChange ?? 0), 0),
    volume: values.volume ?? 0,
    rawChange: values.rawChange,
    rawChangePercent: values.rawChangePercent,
    asOf: new Date().toISOString(),
    source
  };
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function parseTableByHeaders(html: string, source: string, headerAliases: Record<string, string[]>) {
  const $ = load(html);
  const quotes: QuoteMap = new Map();

  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (!rows.length) {
      return;
    }

    const headers = $(rows[0])
      .find("th,td")
      .map((__, cell) => normalizeHeader($(cell).text()))
      .get();

    const indexMap = Object.fromEntries(
      Object.entries(headerAliases).map(([key, aliases]) => [
        key,
        headers.findIndex((header) => aliases.includes(header))
      ])
    ) as Record<string, number>;

    if (indexMap.symbol === -1 || indexMap.currentPrice === -1) {
      return;
    }

    rows.slice(1).each((__, row) => {
      const cells = $(row)
        .find("th,td")
        .map((___, cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean);

      if (!cells.length) {
        return;
      }

      const rawSymbol = cells[indexMap.symbol];
      const symbol = normalizeSymbol(rawSymbol ?? "");
      if (!KNOWN_SYMBOLS.has(symbol)) {
        return;
      }

      const currentPrice = normalizeNumber(cells[indexMap.currentPrice]);
      const previousClose =
        indexMap.previousClose >= 0
          ? normalizeNumber(cells[indexMap.previousClose])
          : Math.max(currentPrice - normalizeNumber(cells[indexMap.rawChange]), 0);
      const volume = indexMap.volume >= 0 ? normalizeNumber(cells[indexMap.volume]) : 0;
      const rawChange = indexMap.rawChange >= 0 ? normalizeNumber(cells[indexMap.rawChange]) : currentPrice - previousClose;
      const rawChangePercent =
        indexMap.rawChangePercent >= 0 ? normalizeNumber(cells[indexMap.rawChangePercent]) : undefined;

      if (!currentPrice) {
        return;
      }

      quotes.set(
        symbol,
        toQuote(
          symbol,
          {
            currentPrice,
            previousClose,
            volume,
            rawChange,
            rawChangePercent
          },
          source
        )
      );
    });
  });

  return quotes;
}

function parseLivenepseTable(html: string, source: string) {
  return parseTableByHeaders(html, source, {
    symbol: ["symbol"],
    currentPrice: ["ltp"],
    rawChange: ["ch"],
    rawChangePercent: ["chpercent"],
    volume: ["vol"],
    previousClose: ["prclose", "prevclose"]
  });
}

function parseShareSansarTable(html: string, source: string) {
  return parseTableByHeaders(html, source, {
    symbol: ["symbol", "security"],
    currentPrice: ["ltp", "lastprice", "lasttradedprice", "close"],
    rawChange: ["pointchange", "change", "ch", "+/-"],
    rawChangePercent: ["percentagechange", "changepercent", "%change", "+/-%"],
    volume: ["volume", "vol", "tradedvolume"],
    previousClose: ["prevclose", "previousclose", "pclose"]
  });
}

function parseEmbeddedJson(html: string, source: string) {
  const quotes: QuoteMap = new Map();
  const scriptMatches = html.match(/\{[\s\S]{0,400}"symbol"[\s\S]{0,800}\}/g) ?? [];

  for (const match of scriptMatches) {
    try {
      const normalized = match
        .replace(/&quot;/g, '"')
        .replace(/\\u0022/g, '"');
      const parsed = JSON.parse(normalized);
      const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];

      for (const entry of entries) {
        const symbol = normalizeSymbol(String(entry.symbol ?? entry.stockSymbol ?? "").toUpperCase());
        const currentPrice = Number(entry.ltp ?? entry.lastTradedPrice ?? entry.close ?? 0);
        if (!symbol || !currentPrice || !KNOWN_SYMBOLS.has(symbol)) {
          continue;
        }

        quotes.set(
          symbol,
          toQuote(
            symbol,
            {
              currentPrice,
              previousClose: Number(entry.previousClose ?? entry.prevClose ?? currentPrice),
              volume: Number(entry.volume ?? entry.totalTradedQuantity ?? 0),
              rawChange: Number(entry.pointChange ?? entry.change ?? 0),
              rawChangePercent: Number(entry.percentageChange ?? entry.percentChange ?? 0)
            },
            source
          )
        );
      }
    } catch {
      continue;
    }
  }

  return quotes;
}

export const liveNepseScraper: LiveScraper = {
  name: "livenepse",
  url: "https://livenepse.com/",
  async scrape() {
    const html = await fetchHtml(this.url);
    const fromTable = parseLivenepseTable(html, this.name);
    if (fromTable.size) {
      return fromTable;
    }

    return parseEmbeddedJson(html, this.name);
  }
};

export const shareSansarScraper: LiveScraper = {
  name: "sharesansar",
  url: "https://www.sharesansar.com/live-trading",
  async scrape() {
    const html = await fetchHtml(this.url);
    const fromTable = parseShareSansarTable(html, this.name);
    if (fromTable.size) {
      return fromTable;
    }

    return parseEmbeddedJson(html, this.name);
  }
};

export const chukulScraper: LiveScraper = {
  name: "chukul",
  url: "https://chukul.com/",
  async scrape() {
    const html = await fetchHtml(this.url);
    const embedded = parseEmbeddedJson(html, this.name);
    if (embedded.size) {
      return embedded;
    }

    return new Map();
  }
};
