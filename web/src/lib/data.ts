import fs from "fs";
import path from "path";
import type { SiteData, TickerData } from "@/types/mreit";

let cache: SiteData | null = null;

function load(): SiteData {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), "..", "data", "mreit.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cache = JSON.parse(raw) as SiteData;
  return cache;
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
