import Link from "next/link";
import { getAllTickers } from "@/lib/data";
import MiniBar from "@/components/MiniBar";
import { formatPeriod, formatPct } from "@/lib/formatters";

export default function Home() {
  const tickers = getAllTickers();

  // Summary stats for the info bar
  const latestPeriods = tickers.map((td) => td.latestPeriod.period).sort();
  const mostRecent = latestPeriods[latestPeriods.length - 1];

  return (
    <div className="w95-page">
      {/* Info bar */}
      <div className="w95-infobar">
        <span><strong>{tickers.length}</strong> mREITs tracked</span>
        <span className="w95-infobar-sep">|</span>
        <span>Latest data: <strong>{formatPeriod(mostRecent)}</strong></span>
        <span className="w95-infobar-sep">|</span>
        <span>Source: SEC EDGAR 10-Q / 10-K filings</span>
        <span className="w95-infobar-sep">|</span>
        <span style={{ color: "#808080" }}>Click a ticker to view historical breakdown</span>
      </div>

      {/* Card grid */}
      <div className="w95-card-grid">
        {tickers.map((td) => {
          const latest = td.latestPeriod;
          // Show up to 4 top buckets
          const topSlices = [...latest.slices]
            .sort((a, b) => b.displayPct - a.displayPct)
            .slice(0, 4);

          return (
            <Link
              key={td.ticker}
              href={`/${td.ticker.toLowerCase()}`}
              className="w95-card"
            >
              {/* Card title bar */}
              <div className="w95-card-hdr">
                <span className="w95-card-ticker">{td.ticker}</span>
                <span className="w95-card-period">{formatPeriod(latest.period)}</span>
              </div>

              {/* Card body */}
              <div className="w95-card-body">
                {/* Distribution bar */}
                <div className="w95-card-bar">
                  <MiniBar slices={latest.slices} allLabels={td.allLabels} />
                </div>

                {/* Top buckets */}
                <div className="w95-card-buckets">
                  {topSlices.map((s) => (
                    <>
                      <span key={`${s.label}-l`} className="w95-card-bucket-label" title={s.label}>
                        {s.label}
                      </span>
                      <span key={`${s.label}-v`} className="w95-card-bucket-val">
                        {formatPct(s.displayPct)}
                      </span>
                    </>
                  ))}
                </div>

                {/* Meta row */}
                <div className="w95-card-meta">
                  <span>{td.periods.length} quarters</span>
                  <span>{td.dataMode === "pct" ? "% weight" : "$ UPB"}</span>
                  {td.hasShorts && <span className="w95-card-warn">⚠ shorts</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
