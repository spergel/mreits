import fs from "fs";
import path from "path";
import type { SiteData, TickerData, RatePoint } from "@/types/mreit";

let cache: SiteData | null = null;

function assertValidSiteData(data: SiteData): void {
  if (!data || !Array.isArray(data.tickers)) {
    throw new Error("Invalid mREIT dataset: missing tickers array");
  }

  for (const ticker of data.tickers) {
    if (!ticker.ticker || !Array.isArray(ticker.periods) || ticker.periods.length === 0) {
      throw new Error(`Invalid mREIT dataset: ticker "${ticker.ticker ?? "unknown"}" has no periods`);
    }
    if (!ticker.latestPeriod || ticker.latestPeriod.period !== ticker.periods[ticker.periods.length - 1]?.period) {
      throw new Error(`Invalid mREIT dataset: ticker "${ticker.ticker}" latestPeriod mismatch`);
    }
  }
}

function load(): SiteData {
  if (cache) return cache;

  const candidatePaths = [
    // Preferred: repo-root generated dataset
    path.join(process.cwd(), "data", "mreit.json"),
    // Fallback: committed dataset under web/data (contains wac/bvps/... keys)
    path.join(process.cwd(), "web", "data", "mreit.json"),
  ];

  let lastErr: unknown;
  for (const filePath of candidatePaths) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as SiteData;
      assertValidSiteData(parsed);

      // Some local builds create a dataset without metrics fields (wac/bvps/...). Prefer the one that has them.
      const hasAnyMetrics = parsed.tickers.some((t) =>
        t.periods.some((p) => p.wac !== undefined || p.bvps !== undefined),
      );
      if (hasAnyMetrics) {
        cache = parsed;
        return cache;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  // If both datasets are present but metrics are missing, still throw the last error for visibility.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  throw lastErr ?? new Error("Unable to load a valid mREIT dataset");
}

export function getSiteData(): SiteData {
  return load();
}

export function getAllTickers(): TickerData[] {
  return load().tickers;
}

export function getTickerData(ticker: string): TickerData | undefined {
  return load().tickers.find((t) => t.ticker === ticker.toUpperCase());
}

export function getRates(): RatePoint[] {
  return load().rates ?? [];
}
