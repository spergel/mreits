import Link from "next/link";
import { getAllTickers } from "@/lib/data";
import MiniBar from "@/components/MiniBar";
import { formatPeriod, formatPct } from "@/lib/formatters";

export default function Home() {
  const tickers = getAllTickers();
  const latestPeriod = tickers
    .map((t) => t.latestPeriod.period)
    .sort()
    .at(-1)!;

  return (
    <>
      <h2 className="section-hd">★ COUPON DISTRIBUTION TRACKER ★</h2>

      {/* Summary bar */}
      <div className="info-bar">
        <div className="info-bar-item">
          <span className="info-bar-label">TICKERS TRACKED</span>
          <span className="info-bar-val">{tickers.length}</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">LATEST PERIOD</span>
          <span className="info-bar-val">{formatPeriod(latestPeriod)}</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">DATA SOURCE</span>
          <span className="info-bar-val">SEC EDGAR</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">FILING TYPES</span>
          <span className="info-bar-val">10-Q / 10-K</span>
        </div>
      </div>

      <p style={{
        fontFamily: '"Comic Sans MS", cursive',
        fontSize: "12px",
        color: "#aaaaaa",
        textAlign: "center",
        margin: "4px 0 10px",
      }}>
        Click any ticker name below to view the full historical coupon breakdown and chart.
      </p>

      {/* Main ticker table */}
      <table className="ticker-tbl">
        <thead>
          <tr>
            <th>TICKER</th>
            <th>PERIOD</th>
            <th>MODE</th>
            <th>DISTRIBUTION</th>
            <th className="r">QTR</th>
            <th className="r">TOP BUCKET</th>
            <th>NOTES</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((td) => {
            const latest = td.latestPeriod;
            const top = [...latest.slices].sort((a, b) => b.displayPct - a.displayPct)[0];
            return (
              <tr key={td.ticker}>
                <td className="td-ticker">
                  <Link href={`/${td.ticker.toLowerCase()}`} style={{ color: "#00ffff", textDecoration: "underline" }}>
                    {td.ticker}
                  </Link>
                </td>
                <td>{formatPeriod(latest.period)}</td>
                <td style={{ color: "#aaaacc", fontSize: "11px" }}>
                  {td.dataMode === "pct" ? "% wt" : "$ UPB"}
                </td>
                <td style={{ padding: "3px 8px", minWidth: "130px" }}>
                  <div className="mini-bar-wrap">
                    <MiniBar slices={latest.slices} allLabels={td.allLabels} />
                  </div>
                </td>
                <td className="td-num">{td.periods.length}</td>
                <td className="td-num" style={{ fontSize: "11px" }}>
                  {top ? `${top.label}: ${formatPct(top.displayPct)}` : "—"}
                </td>
                <td className="td-warn">
                  {td.hasShorts ? "⚠ shorts excl." : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{
        fontFamily: '"Comic Sans MS", cursive',
        fontSize: "11px",
        color: "#557755",
        textAlign: "center",
        marginTop: "8px",
      }}>
        ★ All data extracted directly from SEC EDGAR public filings. Not investment advice. ★
      </p>
    </>
  );
}
