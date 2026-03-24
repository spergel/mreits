import type { Metadata } from "next";
import SheetTabs from "@/components/SheetTabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "mREIT Coupon Data.xls - Microsoft Excel",
  description: "mREIT Coupon Distribution Data sourced from SEC EDGAR filings.",
};

const MENU_ITEMS = ["File", "Edit", "View", "Insert", "Format", "Tools", "Data", "Window", "Help"];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="excel-app">

          {/* ── Title bar ── */}
          <div className="w95-titlebar">
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>📊</span>
              <span>Microsoft Excel - mREIT Coupon Data.xls</span>
            </span>
            <span className="w95-titlebar-btns">
              <span className="w95-titlebar-btn">_</span>
              <span className="w95-titlebar-btn">□</span>
              <span className="w95-titlebar-btn">✕</span>
            </span>
          </div>

          {/* ── Menu bar ── */}
          <div className="w95-menubar">
            {MENU_ITEMS.map((item) => (
              <span key={item} className="w95-menu-item">{item}</span>
            ))}
          </div>

          {/* ── Toolbar ── */}
          <div className="w95-toolbar">
            <span className="w95-toolbtn" title="New">📄</span>
            <span className="w95-toolbtn" title="Open">📂</span>
            <span className="w95-toolbtn" title="Save">💾</span>
            <span className="w95-toolbtn" title="Print">🖨</span>
            <div className="w95-toolsep" />
            <span className="w95-toolbtn" title="Cut">✂</span>
            <span className="w95-toolbtn" title="Copy">📋</span>
            <span className="w95-toolbtn" title="Paste">📌</span>
            <div className="w95-toolsep" />
            <span className="w95-toolbtn" title="Undo" style={{ fontSize: "14px" }}>↩</span>
            <span className="w95-toolbtn" title="Redo" style={{ fontSize: "14px" }}>↪</span>
            <div className="w95-toolsep" />
            <span className="w95-toolbtn" title="AutoSum" style={{ fontWeight: "bold", fontSize: "13px" }}>Σ</span>
            <span className="w95-toolbtn" title="Sort Ascending" style={{ fontSize: "10px" }}>A↑</span>
            <span className="w95-toolbtn" title="Chart Wizard">📊</span>
            <div className="w95-toolsep" />
            {/* Fake font / size selectors */}
            <div className="w95-tool-fake-select" style={{ width: "100px" }}>
              <span>Arial</span>
              <span style={{ fontSize: "8px" }}>▼</span>
            </div>
            <div className="w95-tool-fake-select" style={{ width: "44px", marginLeft: "2px" }}>
              <span>10</span>
              <span style={{ fontSize: "8px" }}>▼</span>
            </div>
            <div className="w95-toolsep" />
            <span className="w95-toolbtn" title="Bold" style={{ fontWeight: "bold" }}>B</span>
            <span className="w95-toolbtn" title="Italic" style={{ fontStyle: "italic" }}>I</span>
            <span className="w95-toolbtn" title="Underline" style={{ textDecoration: "underline" }}>U</span>
          </div>

          {/* ── Formula bar ── */}
          <div className="w95-formulabar">
            <div className="w95-namebox">A1</div>
            <div className="w95-formula-sep" />
            <span style={{ fontSize: "11px", padding: "0 4px", flexShrink: 0 }}>f(x)</span>
            <div className="w95-formula-sep" />
            <div className="w95-formulainput">mREIT Coupon Distribution Dashboard</div>
          </div>

          {/* ── Main content ── */}
          <div className="excel-content">
            {children}
          </div>

          {/* ── Sheet tabs (client component — reads pathname) ── */}
          <SheetTabs />

          {/* ── Status bar ── */}
          <div className="w95-statusbar">
            <span>Ready</span>
            <span style={{ flex: 1 }} />
            <span className="w95-status-item">NUM</span>
            <span className="w95-status-item">CAPS</span>
            <span className="w95-status-item">SCRL</span>
          </div>

        </div>
      </body>
    </html>
  );
}
