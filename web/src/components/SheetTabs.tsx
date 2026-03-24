"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function SheetTabs() {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname === "";
  const tickerMatch = pathname.match(/^\/([^/]+)$/);
  const ticker = tickerMatch ? tickerMatch[1].toUpperCase() : null;

  return (
    <div className="w95-sheettabs">
      <Link href="/" className={`w95-sheettab${isHome ? " active" : ""}`}>
        Overview
      </Link>
      {ticker && (
        <span className={`w95-sheettab${!isHome ? " active" : ""}`}>
          {ticker}
        </span>
      )}
      <span className="w95-sheettab" style={{ color: "#808080" }}>Sheet2</span>
      <span className="w95-sheettab" style={{ color: "#808080" }}>Sheet3</span>
    </div>
  );
}
