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
  return { title: `${ticker.toUpperCase()} — mREIT Coupon Data Center` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const td = getTickerData(ticker);
  if (!td) notFound();

  const latest = td.latestPeriod;
  const earliest = td.periods[0];

  return (
    <>
      <Link href="/" className="back-lnk">← Back to Main Page</Link>

      {/* Ticker header */}
      <div className="detail-header">
        <h1 className="detail-ticker rainbow">{td.ticker}</h1>
        <p className="detail-sub">
          Coupon Rate Distribution &nbsp;·&nbsp;
          {td.dataMode === "pct" ? "% Portfolio Weight" : "$ Unpaid Principal Balance"} &nbsp;·&nbsp;
          {td.periods.length} quarters
          {td.hasShorts && " · ⚠ short positions excluded"}
        </p>
      </div>

      <hr className="ruled" />

      {/* Info box */}
      <div className="detail-infobox">
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">PERIOD RANGE</span>
          <span className="detail-infobox-val">
            {formatPeriod(earliest.period)} – {formatPeriod(latest.period)}
          </span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">QUARTERS TRACKED</span>
          <span className="detail-infobox-val">{td.periods.length}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">COUPON BUCKETS</span>
          <span className="detail-infobox-val">{td.allLabels.length}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">LATEST FILING</span>
          <span className="detail-infobox-val">{latest.filing_type ?? "—"}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">FILED ON</span>
          <span className="detail-infobox-val">{latest.filing_date ?? "—"}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-frame">
        <div className="chart-frame-title">
          ★ COUPON DISTRIBUTION CHART — {td.ticker} ★
        </div>
        <CouponChart periods={td.periods} allLabels={td.allLabels} dataMode={td.dataMode} />
      </div>

      {/* Data table */}
      <h2 className="section-hd" style={{ fontSize: "16px", marginTop: "16px" }}>
        HISTORICAL DATA — ALL PERIODS (most recent first)
      </h2>

      <div className="data-tbl-wrap">
        <table className="data-tbl">
          <thead>
            <tr>
              <th>PERIOD</th>
              <th>FILED</th>
              <th>TYPE</th>
              {td.allLabels.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...td.periods].reverse().map((period) => (
              <tr key={period.period}>
                <td>{formatPeriod(period.period)}</td>
                <td className="muted">{period.filing_date ?? "—"}</td>
                <td className="muted">{period.filing_type ?? "—"}</td>
                {td.allLabels.map((label) => {
                  const slice = period.slices.find((s) => s.label === label);
                  return (
                    <td key={label}>
                      {slice ? (
                        <>
                          {formatPct(slice.displayPct)}
                          {td.dataMode === "value" && slice.rawValue != null && (
                            <span className="muted" style={{ marginLeft: "4px" }}>
                              ({formatLargeValue(slice.rawValue)})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{
        fontFamily: '"Comic Sans MS", cursive',
        fontSize: "11px",
        color: "#557755",
        textAlign: "center",
        marginTop: "8px",
      }}>
        ★ Data sourced from SEC EDGAR public 10-Q/10-K filings. Not investment advice. ★
      </p>
    </>
  );
}
