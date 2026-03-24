import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllTickers, getTickerData } from "@/lib/data";
import { formatPeriod, formatLargeValue, formatPct } from "@/lib/formatters";
import CouponChart from "@/components/CouponChart";

export function generateStaticParams() {
  return getAllTickers().map((td) => ({ ticker: td.ticker.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} - mREIT Coupon Data` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const td = getTickerData(ticker);
  if (!td) notFound();

  const latest = td.latestPeriod;
  const earliest = td.periods[0];

  return (
    <div className="w95-detail-page">

      {/* Back nav */}
      <div>
        <Link href="/" className="w95-back">← Back to Overview</Link>
      </div>

      {/* Header panel */}
      <div className="w95-panel">
        <div className="w95-panel-hdr">
          <span>{td.ticker} — Coupon Rate Distribution</span>
          {td.hasShorts && (
            <span className="w95-panel-hdr-sub">⚠ Short positions excluded from data</span>
          )}
        </div>
        <div className="w95-panel-body">
          <div className="w95-info-grid">
            <span className="w95-info-label">Period range:</span>
            <span className="w95-info-val">{formatPeriod(earliest.period)} – {formatPeriod(latest.period)}</span>

            <span className="w95-info-label">Quarters tracked:</span>
            <span className="w95-info-val">{td.periods.length}</span>

            <span className="w95-info-label">Data mode:</span>
            <span className="w95-info-val">
              {td.dataMode === "pct" ? "% of Portfolio Weight" : "$ Unpaid Principal Balance (UPB)"}
            </span>

            <span className="w95-info-label">Latest filing:</span>
            <span className="w95-info-val">
              {latest.filing_type ?? "—"} &nbsp;
              <span style={{ fontWeight: "normal", color: "#444" }}>
                filed {latest.filing_date ?? "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Chart panel */}
      <div className="w95-panel">
        <div className="w95-panel-hdr">
          <span>Chart 1 — Distribution Over Time</span>
          <span className="w95-panel-hdr-sub">{td.allLabels.length} coupon buckets</span>
        </div>
        <div className="w95-panel-body-flush">
          <CouponChart periods={td.periods} allLabels={td.allLabels} dataMode={td.dataMode} />
        </div>
      </div>

      {/* Data table panel */}
      <div className="w95-panel">
        <div className="w95-panel-hdr">
          <span>Historical Data — All Periods</span>
          <span className="w95-panel-hdr-sub">most recent first</span>
        </div>
        <div className="w95-panel-body" style={{ padding: 0 }}>
          <div className="w95-list-scroll">
            <table className="w95-list">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Filed</th>
                  <th>Type</th>
                  {td.allLabels.map((label) => (
                    <th key={label} className="right">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...td.periods].reverse().map((period) => (
                  <tr key={period.period}>
                    <td className="bold">{formatPeriod(period.period)}</td>
                    <td className="muted">{period.filing_date ?? "—"}</td>
                    <td className="muted">{period.filing_type ?? "—"}</td>
                    {td.allLabels.map((label) => {
                      const slice = period.slices.find((s) => s.label === label);
                      return (
                        <td key={label} className="right">
                          {slice ? (
                            <>
                              {formatPct(slice.displayPct)}
                              {td.dataMode === "value" && slice.rawValue != null && (
                                <span className="muted" style={{ marginLeft: "4px" }}>
                                  ({formatLargeValue(slice.rawValue)})
                                </span>
                              )}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ fontSize: "10px", color: "#808080", padding: "2px 0 4px" }}>
        Data sourced from public SEC EDGAR filings. Not financial advice.
      </div>

    </div>
  );
}
