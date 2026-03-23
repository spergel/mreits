import Link from "next/link";
import { getAllTickers } from "@/lib/data";
import MiniBar from "@/components/MiniBar";
import { formatPeriod } from "@/lib/formatters";

export default function Home() {
  const tickers = getAllTickers();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Coupon Allocation by mREIT</h1>
        <p className="text-slate-400 text-sm">
          Portfolio coupon rate distribution for {tickers.length} mortgage REITs, extracted from SEC EDGAR 10-Q filings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tickers.map((td) => {
          const latest = td.latestPeriod;
          return (
            <Link
              key={td.ticker}
              href={`/${td.ticker.toLowerCase()}`}
              className="block bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xl font-bold text-white">{td.ticker}</span>
                  <div className="text-xs text-slate-500 mt-0.5">{formatPeriod(latest.period)}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  td.dataMode === "pct"
                    ? "bg-blue-900/50 text-blue-300"
                    : "bg-amber-900/50 text-amber-300"
                }`}>
                  {td.dataMode === "pct" ? "% weight" : "$ UPB"}
                </span>
              </div>

              <MiniBar slices={latest.slices} allLabels={td.allLabels} />

              <div className="mt-3 flex flex-wrap gap-1">
                {latest.slices.slice(0, 4).map((s) => (
                  <span key={s.label} className="text-xs text-slate-400">
                    {s.label}: <span className="text-slate-200">{s.displayPct.toFixed(1)}%</span>
                  </span>
                ))}
                {latest.slices.length > 4 && (
                  <span className="text-xs text-slate-600">+{latest.slices.length - 4} more</span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{td.periods.length} periods</span>
                {td.hasShorts && (
                  <span className="text-orange-400">⚠ shorts excl.</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
