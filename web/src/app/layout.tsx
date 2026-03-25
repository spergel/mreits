import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "mREIT Data Terminal",
  description: "Simple mortgage REIT coupon distribution tracker sourced from SEC EDGAR filings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-wrap">
          <header className="site-header">
            <h1 className="site-title">mREIT Data Terminal</h1>
            <p className="site-tagline">Coupon distribution data from SEC EDGAR filings</p>
          </header>

          <div className="status-strip">
            <span>Environment: Production</span>
            <span>Source: SEC EDGAR (10-Q / 10-K)</span>
          </div>

          <nav className="site-nav">
            <Link href="/">Dashboard</Link>
            <span className="nav-sep">|</span>
            <a href="mailto:webmaster@mreitdata.local">Contact</a>
          </nav>

          <hr className="ruled" />

          <main>{children}</main>

          <hr className="ruled" />

          <footer className="site-footer">
            <p>mREIT Data Terminal</p>
            <p>© 2026 Internal Research View</p>
            <p className="footer-dim">
              Data sourced from public SEC EDGAR filings. Not investment advice.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
