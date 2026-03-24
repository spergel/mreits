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
  return { title: `${ticker.toUpperCase()} - mREIT Coupon Data.xls - Microsoft Excel` };
}

// A=0, B=1 … Z=25, AA=26 …
function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const td = getTickerData(ticker);
  if (!td) notFound();

  const latest = td.latestPeriod;
  const earliest = td.periods[0];
  // Coupon columns start at D (index 3)
  const totalCols = 3 + td.allLabels.length;

  return (
    <table className="xl-table">
      <thead>
        <tr>
          <th className="xl-corner-hdr" />
          {/* A, B, C fixed cols */}
          <th className="xl-col-hdr" style={{ minWidth: 90 }}>A</th>
          <th className="xl-col-hdr" style={{ minWidth: 90 }}>B</th>
          <th className="xl-col-hdr" style={{ minWidth: 75 }}>C</th>
          {/* D+ for each coupon bucket */}
          {td.allLabels.map((_, i) => (
            <th key={i} className="xl-col-hdr" style={{ minWidth: 80 }}>
              {colLetter(3 + i)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>

        {/* Row 1: ticker title */}
        <tr>
          <td className="xl-row-hdr">1</td>
          <td className="xl-cell xl-cell-title" colSpan={totalCols}>
            {td.ticker} &mdash; Coupon Rate Distribution by Quarter &nbsp;|&nbsp;
            {td.dataMode === "pct" ? "% Portfolio Weight" : "$ UPB (thousands)"} &nbsp;|&nbsp;
            {formatPeriod(earliest.period)} &ndash; {formatPeriod(latest.period)} &nbsp;({td.periods.length} quarters)
            {td.hasShorts && " | ⚠ Short positions excluded"}
          </td>
        </tr>

        {/* Row 2: nav */}
        <tr>
          <td className="xl-row-hdr">2</td>
          <td className="xl-cell" colSpan={totalCols}>
            <Link href="/" className="xl-cell-blue">← Back to Overview</Link>
            <span style={{ color: "#808080", marginLeft: "12px" }}>
              Latest filing: {latest.filing_type ?? "—"} dated {latest.filing_date ?? "—"}
            </span>
          </td>
        </tr>

        {/* Row 3: empty */}
        <tr>
          <td className="xl-row-hdr">3</td>
          <td className="xl-cell" colSpan={totalCols} style={{ height: "17px" }} />
        </tr>

        {/* Row 4: embedded chart */}
        <tr>
          <td className="xl-row-hdr" style={{ verticalAlign: "top", paddingTop: "4px" }}>4</td>
          <td colSpan={totalCols} style={{ padding: 0, background: "#c0c0c0" }}>
            <div className="xl-chart-wrap">
              <div className="xl-chart-obj">
                <div className="xl-chart-obj-title">
                  <span>Chart 1 — Coupon Distribution Over Time</span>
                  <span style={{ fontSize: "9px", color: "#808080", fontWeight: "normal" }}>
                    Double-click chart object to edit
                  </span>
                </div>
                <CouponChart periods={td.periods} allLabels={td.allLabels} dataMode={td.dataMode} />
              </div>
            </div>
          </td>
        </tr>

        {/* Row 5: empty spacer */}
        <tr>
          <td className="xl-row-hdr">5</td>
          <td className="xl-cell" colSpan={totalCols} style={{ height: "17px" }} />
        </tr>

        {/* Row 6: data table header */}
        <tr>
          <td className="xl-row-hdr">6</td>
          <td className="xl-cell xl-cell-gray">Period</td>
          <td className="xl-cell xl-cell-gray">Filed</td>
          <td className="xl-cell xl-cell-gray">Type</td>
          {td.allLabels.map((label) => (
            <td key={label} className="xl-cell xl-cell-gray xl-cell-right">{label}</td>
          ))}
        </tr>

        {/* Data rows — most recent first */}
        {[...td.periods].reverse().map((period, i) => (
          <tr key={period.period}>
            <td className="xl-row-hdr">{7 + i}</td>
            <td className="xl-cell xl-cell-bold">{formatPeriod(period.period)}</td>
            <td className="xl-cell">{period.filing_date ?? "—"}</td>
            <td className="xl-cell">{period.filing_type ?? "—"}</td>
            {td.allLabels.map((label) => {
              const slice = period.slices.find((s) => s.label === label);
              return (
                <td key={label} className="xl-cell xl-cell-right">
                  {slice ? formatPct(slice.displayPct) : "—"}
                  {td.dataMode === "value" && slice?.rawValue != null && (
                    <span style={{ color: "#808080", marginLeft: "4px" }}>
                      ({formatLargeValue(slice.rawValue)})
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}

        {/* Trailing empty rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={`empty-${i}`}>
            <td className="xl-row-hdr">{7 + td.periods.length + i}</td>
            <td className="xl-cell" colSpan={totalCols} style={{ height: "17px" }} />
          </tr>
        ))}

      </tbody>
    </table>
  );
}
