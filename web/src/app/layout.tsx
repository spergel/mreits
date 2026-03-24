import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "mREIT Coupon Data Center",
  description: "Your #1 source for mortgage REIT coupon distribution data from SEC EDGAR filings.",
};

const TICKER_SCROLL =
  "AGNC · RITM · NLY · TWO · EARN · PMT · MFA · RWT · IVR · CHMI · BXMT · ADAM " +
  "— CLICK ANY TICKER BELOW TO VIEW FULL COUPON HISTORY — " +
  "DATA SOURCED FROM SEC EDGAR 10-Q FILINGS";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-wrap">

          {/* ── Header ── */}
          <header className="site-header">
            <p className="welcome-txt">★ ★ ★ WELCOME TO ★ ★ ★</p>
            <h1 className="site-title rainbow">mREIT COUPON DATA CENTER</h1>
            <p className="site-tagline">
              Your #1 Source for Mortgage REIT Coupon Distribution Data Since 1999
            </p>
          </header>

          {/* ── Scrolling ticker ── */}
          <div className="ticker-wrap">
            <span className="ticker-inner">
              ★ NEW: Q3 2025 DATA NOW AVAILABLE! ★ &nbsp;&nbsp;
              {TICKER_SCROLL} &nbsp;&nbsp;
              ★ NEW: Q3 2025 DATA NOW AVAILABLE! ★ &nbsp;&nbsp;
              {TICKER_SCROLL}
            </span>
          </div>

          {/* ── Navigation ── */}
          <nav className="site-nav">
            <Link href="/">★ HOME ★</Link>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="#">ABOUT THIS SITE</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="#">GUESTBOOK</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="#">LINKS</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="mailto:webmaster@mreitdata.geocities.com">CONTACT WEBMASTER</a>
          </nav>

          <hr className="ruled" />

          {/* ── Main content ── */}
          <main>{children}</main>

          <hr className="ruled" />

          {/* ── Footer ── */}
          <footer className="site-footer">
            <p>
              You are visitor #&nbsp;<span className="counter">001,337</span>&nbsp;to this page!
              &nbsp;<span className="blink">★</span>
            </p>
            <p>★ Best viewed in Netscape Navigator 4.0 at 800×600 resolution ★</p>
            <p>© 1999–2025 mREIT Coupon Data Center &nbsp;·&nbsp; All Rights Reserved</p>
            <p className="footer-dim">
              Data sourced from public SEC EDGAR filings. Not financial advice.
              &nbsp;|&nbsp; This page has been <em>under construction</em> since 1999.
            </p>
          </footer>

        </div>
      </body>
    </html>
  );
}
