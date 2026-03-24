import Link from "next/link";
import { getAllTickers } from "@/lib/data";
import MiniBar from "@/components/MiniBar";
import { formatPeriod } from "@/lib/formatters";

export default function Home() {
  const tickers = getAllTickers();

  return (
    <table className="xl-table">
      <thead>
        <tr>
          <th className="xl-corner-hdr" />
          <th className="xl-col-hdr" style={{ minWidth: 70 }}>A</th>
          <th className="xl-col-hdr" style={{ minWidth: 90 }}>B</th>
          <th className="xl-col-hdr" style={{ minWidth: 75 }}>C</th>
          <th className="xl-col-hdr" style={{ minWidth: 220 }}>D</th>
          <th className="xl-col-hdr" style={{ minWidth: 60 }}>E</th>
          <th className="xl-col-hdr" style={{ minWidth: 110 }}>F</th>
        </tr>
      </thead>
      <tbody>
        {/* Row 1: title */}
        <tr>
          <td className="xl-row-hdr">1</td>
          <td className="xl-cell xl-cell-title" colSpan={6}>
            mREIT Coupon Distribution Dashboard — Source: SEC EDGAR 10-Q Filings
          </td>
        </tr>

        {/* Row 2: empty */}
        <tr>
          <td className="xl-row-hdr">2</td>
          <td className="xl-cell" colSpan={6} />
        </tr>

        {/* Row 3: column headers */}
        <tr>
          <td className="xl-row-hdr">3</td>
          <td className="xl-cell xl-cell-gray">Ticker</td>
          <td className="xl-cell xl-cell-gray">Period</td>
          <td className="xl-cell xl-cell-gray">Mode</td>
          <td className="xl-cell xl-cell-gray">Distribution</td>
          <td className="xl-cell xl-cell-gray xl-cell-center">Periods</td>
          <td className="xl-cell xl-cell-gray">Notes</td>
        </tr>

        {/* Data rows */}
        {tickers.map((td, i) => {
          const latest = td.latestPeriod;
          return (
            <tr key={td.ticker}>
              <td className="xl-row-hdr">{4 + i}</td>
              <td className="xl-cell xl-cell-bold">
                <Link href={`/${td.ticker.toLowerCase()}`} className="xl-cell-blue">
                  {td.ticker}
                </Link>
              </td>
              <td className="xl-cell">{formatPeriod(latest.period)}</td>
              <td className="xl-cell">{td.dataMode === "pct" ? "% Weight" : "$ UPB"}</td>
              <td className="xl-cell" style={{ padding: "2px 4px", overflow: "visible" }}>
                <MiniBar slices={latest.slices} allLabels={td.allLabels} />
              </td>
              <td className="xl-cell xl-cell-center">{td.periods.length}</td>
              <td className="xl-cell" style={{ color: td.hasShorts ? "#cc6600" : undefined }}>
                {td.hasShorts ? "⚠ Shorts excl." : ""}
              </td>
            </tr>
          );
        })}

        {/* Trailing empty rows for spreadsheet feel */}
        {Array.from({ length: 10 }).map((_, i) => (
          <tr key={`empty-${i}`}>
            <td className="xl-row-hdr">{4 + tickers.length + i}</td>
            <td className="xl-cell" colSpan={6} style={{ height: "17px" }} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
