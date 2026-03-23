import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mREIT Coupon Tracker",
  description: "Coupon allocation data for mortgage REITs, sourced from SEC EDGAR filings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
        <header className="border-b border-slate-800 sticky top-0 z-10 bg-slate-950/90 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="font-semibold text-white text-lg tracking-tight">
              mREIT Coupon Tracker
            </a>
            <span className="text-xs text-slate-500">Data from SEC EDGAR 10-Q filings</span>
          </div>
        </header>
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
          Data sourced from public SEC EDGAR filings. Not financial advice.
        </footer>
      </body>
    </html>
  );
}
