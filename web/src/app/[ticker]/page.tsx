import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllTickers, getTickerData, getRates } from "@/lib/data";
import {
  formatPeriod,
  formatLargeValue,
  formatUsdDollars,
  formatPct,
  formatWAC,
  formatBVPS,
  formatMultiple,
} from "@/lib/formatters";
import CouponChart from "@/components/CouponChart";
import WacRateChart from "@/components/WacRateChart";
import MetricLineChart from "@/components/MetricLineChart";
import CapitalStackChart from "@/components/CapitalStackChart";

export function generateStaticParams() {
  return getAllTickers().map((td) => ({ ticker: td.ticker.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} — mREIT Data Terminal` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const td = getTickerData(ticker);
  if (!td) notFound();

  const rates = getRates();
  const latest = td.latestPeriod;
  const earliest = td.periods[0];
  const hasWAC = td.periods.some((p) => p.wac !== null);
  const hasBVPS = td.periods.some((p) => p.bvps !== null);
  const hasLeverage = td.periods.some((p) => p.leverage !== null);
  const hasFunding = td.periods.some((p) => p.financingRate !== null || p.netInterestMargin !== null);
  const hasHedges = td.periods.some((p) => p.swapNotional !== null);
  const hasLiquidity = td.periods.some((p) => p.unrestrictedCash !== null);
  const hasCommonPref = td.periods.some((p) => p.commonPrefEquityRatio !== null);
  const hasPriceToBook = td.periods.some((p) => p.priceToBook !== null);
  const hasBuybacksIssuance = td.periods.some(
    (p) => p.buybacks !== null || p.issuance !== null || p.preferredIssuance !== null
  );
  const hasCapitalStack = td.periods.some(
    (p) => p.commonEquity !== null || p.preferredEquity !== null || p.totalLiabilities !== null
  );

  const chartData = td.periods.map((p) => ({
    period: formatPeriod(p.period),
    leverage: p.leverage,
    commonPrefEquityRatio: p.commonPrefEquityRatio,
    priceToBook: p.priceToBook,
    buybacks: p.buybacks,
    issuance: p.issuance,
    preferredIssuance: p.preferredIssuance,
    commonEquity: p.commonEquity,
    preferredEquity: p.preferredEquity,
    totalLiabilities: p.totalLiabilities,
  }));

  return (
    <>
      <Link href="/" className="back-lnk">Back to dashboard</Link>

      <div className="detail-header">
        <h1 className="detail-ticker">{td.ticker}</h1>
        <p className="detail-sub">
          Coupon distribution history &nbsp;·&nbsp;
          {td.dataMode === "pct" ? "% Portfolio Weight" : "$ Unpaid Principal Balance"} &nbsp;·&nbsp;
          {td.periods.length} quarters tracked
          {td.hasShorts && " · short positions excluded"}
        </p>
      </div>

      <hr className="ruled" />

      <div className="detail-infobox">
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Period Range</span>
          <span className="detail-infobox-val">
            {formatPeriod(earliest.period)} – {formatPeriod(latest.period)}
          </span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Quarters Tracked</span>
          <span className="detail-infobox-val">{td.periods.length}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Coupon Buckets</span>
          <span className="detail-infobox-val">{td.allLabels.length}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest WAC</span>
          <span className="detail-infobox-val">{formatWAC(latest.wac)}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest BVPS</span>
          <span className="detail-infobox-val">{formatBVPS(latest.bvps)}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest Leverage</span>
          <span className="detail-infobox-val">{formatMultiple(latest.leverage)}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest Financing Rate</span>
          <span className="detail-infobox-val">{latest.financingRate != null ? formatWAC(latest.financingRate) : "—"}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest NIM / Spread</span>
          <span className="detail-infobox-val">{latest.netInterestMargin != null ? formatWAC(latest.netInterestMargin) : "—"}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest Swap Notional</span>
          <span className="detail-infobox-val">
            {latest.swapNotional != null ? formatLargeValue(latest.swapNotional) : "—"}
          </span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest Unrestricted Cash</span>
          <span className="detail-infobox-val">
            {latest.unrestrictedCash != null ? formatUsdDollars(latest.unrestrictedCash) : "—"}
          </span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Latest Filing</span>
          <span className="detail-infobox-val">{latest.filing_type ?? "—"}</span>
        </div>
        <div className="detail-infobox-item">
          <span className="detail-infobox-label">Filed On</span>
          <span className="detail-infobox-val">{latest.filing_date ?? "—"}</span>
        </div>
      </div>

      <div className="chart-frame">
        <div className="chart-frame-title">Coupon Distribution Chart - {td.ticker}</div>
        <CouponChart periods={td.periods} allLabels={td.allLabels} dataMode={td.dataMode} />
      </div>

      {hasWAC && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">
            WAC vs 10Y Treasury — {td.ticker}
            <span style={{ color: "#aaaacc", fontSize: "10px", marginLeft: "8px" }}>
              (10Y rate: end-of-quarter, source: FRED DGS10)
            </span>
          </div>
          <WacRateChart periods={td.periods} rates={rates} />
        </div>
      )}

      {hasLeverage && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">Leverage Over Time</div>
          <MetricLineChart
            data={chartData}
            series={[{ key: "leverage", label: "Leverage", color: "#355f9a" }]}
            ySuffix="x"
          />
        </div>
      )}

      {hasCommonPref && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">Common Equity / Preferred Equity Ratio</div>
          <MetricLineChart
            data={chartData}
            series={[{ key: "commonPrefEquityRatio", label: "Common/Pref", color: "#7b4cc2" }]}
            ySuffix="x"
          />
        </div>
      )}

      {hasPriceToBook && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">Price to Book Over Time</div>
          <MetricLineChart
            data={chartData}
            series={[{ key: "priceToBook", label: "P/B", color: "#c2751e" }]}
            ySuffix="x"
          />
        </div>
      )}

      {hasBuybacksIssuance && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">Buybacks vs Issuance</div>
          <MetricLineChart
            data={chartData}
            series={[
              { key: "buybacks", label: "Buybacks", color: "#b23d3d" },
              { key: "issuance", label: "Issuance", color: "#2f9a62" },
              { key: "preferredIssuance", label: "Pref Issuance", color: "#7b4cc2" },
            ]}
          />
        </div>
      )}

      {hasCapitalStack && (
        <div className="chart-frame" style={{ marginTop: "12px" }}>
          <div className="chart-frame-title">Capital Stack Over Time</div>
          <CapitalStackChart data={chartData} />
        </div>
      )}

      <h2 className="section-hd" style={{ fontSize: "16px", marginTop: "16px" }}>
        Historical Data (most recent first)
      </h2>

      <div className="data-tbl-wrap">
        <table className="data-tbl">
          <thead>
            <tr>
              <th>PERIOD</th>
              <th>Filed</th>
              <th>Type</th>
              <th>WAC</th>
              {hasBVPS && <th>BVPS</th>}
              {hasLeverage && <th>Leverage</th>}
              {hasFunding && <th>Funding</th>}
              {hasFunding && <th>NIM</th>}
              {hasHedges && <th>Swap Notional</th>}
              {hasLiquidity && <th>Cash</th>}
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
                <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                  {formatWAC(period.wac)}
                </td>
                {hasBVPS && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {formatBVPS(period.bvps)}
                  </td>
                )}
                {hasLeverage && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {formatMultiple(period.leverage)}
                  </td>
                )}
                {hasFunding && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {period.financingRate != null ? formatWAC(period.financingRate) : "—"}
                  </td>
                )}
                {hasFunding && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {period.netInterestMargin != null ? formatWAC(period.netInterestMargin) : "—"}
                  </td>
                )}
                {hasHedges && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {period.swapNotional != null ? formatLargeValue(period.swapNotional) : "—"}
                  </td>
                )}
                {hasLiquidity && (
                  <td style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
                    {period.unrestrictedCash != null ? formatUsdDollars(period.unrestrictedCash) : "—"}
                  </td>
                )}
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

      <p className="page-footnote">Data sourced from SEC EDGAR public filings. Not investment advice.</p>
    </>
  );
}
