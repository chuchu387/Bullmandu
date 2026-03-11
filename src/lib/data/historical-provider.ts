import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { PricePoint } from "@/types";

const execFileAsync = promisify(execFile);

type CacheEntry = {
  fetchedAt: number;
  history: PricePoint[];
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PricePoint[]>>();
const TTL_MS = 1000 * 60 * 15;

type PythonHistoryPoint = {
  date: string;
  close: number;
  volume: number;
  previousClose?: number;
};

export async function getRealHistory(symbol: string, days = 365) {
  const key = `${symbol}:${days}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.history;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "nepse_history.py");
  const task = execFileAsync("python", [scriptPath, symbol, String(days)], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  }).then(({ stdout }) => {
    const parsed = JSON.parse(stdout) as PythonHistoryPoint[];
    const history = parsed
      .filter((point) => point.date && Number(point.close) > 0)
      .map((point) => ({
        date: point.date,
        close: Number(point.close),
        volume: Number(point.volume ?? 0)
      }));

    cache.set(key, {
      fetchedAt: Date.now(),
      history
    });
    inflight.delete(key);
    return history;
  });

  inflight.set(key, task);

  try {
    return await task;
  } catch (error) {
    inflight.delete(key);
    throw error;
  }
}
