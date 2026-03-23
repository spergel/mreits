import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllTickers, getTickerData } from "@/lib/data";
import { formatPeriod, formatLargeValue, formatPct } from "@/lib/formatters";
import CouponChart from "@/components/CouponChart";

export async function generateStaticParams() {
  return getAllTickers().map((td) => ({ ticker: td.ticker.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} — mREIT Coupon Tracker` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const td = getTickerData(ticker);
  if (!td) notFound();

  const latest = td.latestPeriod;
  const earliest = td.periods[0];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-sm text-slate-500 mb-6">
        <Link href="/" className="hover:text-slate-300 transition-colors">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-200">{td.ticker}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{td.ticker}</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {formatPeriod(earliest.period)} – {formatPeriod(latest.period)} · {td.periods.length} quarters
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${
            td.dataMode === "pct"
              ? "bg-blue-900/50 text-blue-300"
              : "bg-amber-900/50 text-amber-300"
          }`}>
            {td.dataMode === "pct" ? "% of Portfolio" : "$ UPB (thousands)"}
          </span>
          {td.hasShorts && (
            <span className="text-sm px-3 py-1 rounded-full bg-orange-900/40 text-orange-300">
              ⚠ Short positions excluded
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Coupon Distribution Over Time
        </h2>
        <CouponChart
          periods={td.periods}
          allLabels={td.allLabels}
          dataMode={td.dataMode}
        />
      </div>

      {/* Latest period table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Latest Period — {formatPeriod(latest.period)}
          <span className="ml-2 text-slate-600 normal-case">filed {latest.filing_date}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-2 pr-6 text-slate-400 font-medium">Coupon Bucket</th>
                <th className="text-right py-2 pr-6 text-slate-400 font-medium">% of Portfolio</th>
                {td.dataMode === "value" && (
                  <th className="text-right py-2 text-slate-400 font-medium">UPB</th>
                )}
              </tr>
            </thead>
            <tbody>
              {latest.slices.map((s) => (
                <tr key={s.label} className="border-b border-slate-800/50">
                  <td className="py-2 pr-6 text-slate-200">{s.label}</td>
                  <td className="py-2 pr-6 text-right font-mono text-slate-200">
                    {formatPct(s.displayPct)}
                  </td>
                  {td.dataMode === "value" && (
                    <td className="py-2 text-right font-mono text-slate-400">
                      {s.rawValue != null ? formatLargeValue(s.rawValue) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
