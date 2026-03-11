import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type CacheEntry<T> = {
  fetchedAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getTtlMs(args: string[]) {
  if (args[0] === "securities") {
    return 1000 * 60 * 60 * 12;
  }

  if (args[0] === "today") {
    return 1000 * 60 * 2;
  }

  return 1000 * 60 * 5;
}

async function runPython<T>(args: string[]) {
  const key = args.join(":");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < getTtlMs(args)) {
    return cached.value as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as T;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "nepse_market.py");
  const task = execFileAsync("python", [scriptPath, ...args], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  }).then(({ stdout }) => {
    const parsed = JSON.parse(stdout) as T;
    cache.set(key, {
      fetchedAt: Date.now(),
      value: parsed
    });
    inflight.delete(key);
    return parsed;
  });

  inflight.set(key, task);

  try {
    return await task;
  } catch (error) {
    inflight.delete(key);
    throw error;
  }
}

export type OfficialSecurity = {
  id: number;
  companyName: string;
  symbol: string;
  securityName: string;
  status: string;
  sectorName: string;
  instrumentType: string;
};

export type OfficialTodayPrice = {
  businessDate: string;
  securityId: number;
  symbol: string;
  securityName: string;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  closePrice: number | null;
  totalTradedQuantity: number | null;
  previousDayClosePrice: number | null;
  lastUpdatedPrice: number | null;
  totalTrades: number | null;
  averageTradedPrice: number | null;
};

export async function getOfficialSecurities() {
  const data = await runPython<OfficialSecurity[]>(["securities"]);
  return data.filter((item) => item.symbol && item.status === "A");
}

export async function getOfficialTodayPrices() {
  return runPython<OfficialTodayPrice[]>(["today"]);
}
