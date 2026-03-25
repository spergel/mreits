import Link from "next/link";
import { getAllTickers } from "@/lib/data";
import MiniBar from "@/components/MiniBar";
import { formatPeriod, formatPct, formatWAC, formatBVPS } from "@/lib/formatters";

export default function Home() {
  const tickers = getAllTickers();
  const latestPeriod = tickers
    .map((t) => t.latestPeriod.period)
    .sort()
    .at(-1)!;

  return (
    <>
      <h2 className="section-hd">Portfolio Coupon Dashboard</h2>

      <div className="info-bar">
        <div className="info-bar-item">
          <span className="info-bar-label">Tickers Tracked</span>
          <span className="info-bar-val">{tickers.length}</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">Latest Period</span>
          <span className="info-bar-val">{formatPeriod(latestPeriod)}</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">Data Source</span>
          <span className="info-bar-val">SEC EDGAR</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">Filing Types</span>
          <span className="info-bar-val">10-Q / 10-K</span>
        </div>
      </div>

      <p className="page-note">Select a ticker to view historical coupon mix and filing-level details.</p>

      <table className="ticker-tbl">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Period</th>
            <th>Mode</th>
            <th>Distribution</th>
            <th className="r">WAC</th>
            <th className="r">BVPS</th>
            <th className="r">QTR</th>
            <th className="r">Top Bucket</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((td) => {
            const latest = td.latestPeriod;
            const top = [...latest.slices].sort((a, b) => b.displayPct - a.displayPct)[0];
            return (
              <tr key={td.ticker}>
                <td className="td-ticker">
                  <Link href={`/${td.ticker.toLowerCase()}`}>
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
                <td className="td-num">{formatWAC(latest.wac)}</td>
                <td className="td-num">{formatBVPS(latest.bvps)}</td>
                <td className="td-num">{td.periods.length}</td>
                <td className="td-num" style={{ fontSize: "11px" }}>
                  {top ? `${top.label}: ${formatPct(top.displayPct)}` : "—"}
                </td>
                <td className="td-warn">
                  {td.hasShorts ? "shorts excluded" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="page-footnote">Data extracted from SEC EDGAR filings. Not investment advice.</p>
    </>
  );
}
