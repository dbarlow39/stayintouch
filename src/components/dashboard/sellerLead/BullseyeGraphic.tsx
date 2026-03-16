import { forwardRef } from "react";
import logoImg from "@/assets/logo.jpg";

interface BullseyeGraphicProps {
  address: string;
  bullseyePrice: string;
  lowerBracketPrice: string;
  upperBracketPrice: string;
  bullseyeBracketLabel: string;
  lowerBracketLabel: string;
  upperBracketLabel: string;
  lowerBracketDescription?: string;
  bullseyeDescription?: string;
  upperBracketDescription?: string;
}

const BullseyeGraphic = forwardRef<HTMLDivElement, BullseyeGraphicProps>(
  (
    {
      address,
      bullseyePrice,
      lowerBracketPrice,
      upperBracketPrice,
      bullseyeBracketLabel,
      lowerBracketLabel,
      upperBracketLabel,
      lowerBracketDescription,
      bullseyeDescription,
      upperBracketDescription,
    },
    ref
  ) => {
    // Strip city/state/zip from address for display
    const shortAddress = address
      .replace(/,\s*(OH|Ohio)\s*\d{5}$/i, "")
      .replace(/,\s*\w+\s*\d{5}$/, "");

    return (
      <div
        ref={ref}
        style={{
          width: 460,
          minHeight: 673,
          background: "#FFFFFF",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: "20px",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", color: "#1a1a1a" }}>
            {shortAddress}
          </div>
          <img src={logoImg} alt="Sell for 1 Percent" style={{ height: 40, objectFit: "contain" }} />
        </div>

        {/* Target Chart Area */}
        <div style={{ position: "relative", width: "100%", height: 310, marginBottom: 10 }}>
          {/* Y-axis label */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "rotate(-90deg) translateX(-50%)",
              transformOrigin: "0 0",
              fontSize: 11,
              fontWeight: "bold",
              color: "#333",
              whiteSpace: "nowrap",
            }}
          >
            Asking Price
          </div>

          {/* Y-axis line */}
          <div style={{ position: "absolute", left: 30, top: 10, bottom: 30, width: 2, background: "#333" }} />
          <div style={{ position: "absolute", left: 22, top: 8, fontSize: 9, color: "#333" }}>$1,000,000</div>
          <div style={{ position: "absolute", left: 30, bottom: 26, fontSize: 9, color: "#333" }}>$1,000</div>
          <div style={{ position: "absolute", left: 26, top: 10, width: 8, height: 2, background: "#333" }} />
          <div style={{ position: "absolute", left: 26, bottom: 28, width: 8, height: 2, background: "#333" }} />

          {/* X-axis line */}
          <div style={{ position: "absolute", left: 30, bottom: 28, right: 10, height: 2, background: "#333" }} />
          <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: "bold", color: "#333" }}>
            Days on Market
          </div>

          {/* SVG with concentric rings AND text labels inside */}
          <svg
            viewBox="0 0 300 300"
            style={{
              position: "absolute",
              left: 55,
              top: 10,
              width: 280,
              height: 280,
            }}
          >
            {/* 3-layer target: outer red, white gap, large center red */}
            <circle cx="150" cy="150" r="145" fill="#CC0000" />
            <circle cx="150" cy="150" r="115" fill="#FFFFFF" />
            <circle cx="150" cy="150" r="75" fill="#CC0000" />

            {/* Center bullseye price - 33% larger than other labels */}
            <text
              x="150"
              y="145"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#FFFFFF"
              fontSize="24"
              fontWeight="bold"
              fontFamily="Arial, Helvetica, sans-serif"
            >
              {bullseyePrice}
            </text>
            <text
              x="150"
              y="165"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#FFFFFF"
              fontSize="11"
              fontWeight="bold"
              fontFamily="Arial, Helvetica, sans-serif"
              letterSpacing="2"
            >
              BULLSEYE
            </text>

            {/* Upper bracket price - top right on outer ring */}
            <text
              x="260"
              y="55"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1a1a1a"
              fontSize="18"
              fontWeight="bold"
              fontFamily="Arial, Helvetica, sans-serif"
            >
              {upperBracketPrice}
            </text>

            {/* Lower bracket price - bottom left on outer ring */}
            <text
              x="45"
              y="240"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1a1a1a"
              fontSize="18"
              fontWeight="bold"
              fontFamily="Arial, Helvetica, sans-serif"
            >
              {lowerBracketPrice}
            </text>
          </svg>
        </div>

        {/* Buyer Bracket Strategy Table */}
        <div style={{ border: "1px solid #ddd", borderRadius: 4, overflow: "hidden" }}>
          {/* Table header */}
          <div
            style={{
              background: "#CC0000",
              color: "#FFFFFF",
              padding: "8px 12px",
              fontSize: 11,
              fontWeight: "bold",
              letterSpacing: 0.5,
            }}
          >
            BUYER BRACKET STRATEGY | How Buyers Search Online
          </div>

          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 100px 1fr",
              borderBottom: "1px solid #ddd",
              padding: "6px 12px",
              fontSize: 9,
              fontWeight: "bold",
              color: "#666",
              textTransform: "uppercase",
            }}
          >
            <div>Price</div>
            <div>Buyer Bracket</div>
            <div>Expected Outcome</div>
          </div>

          {/* Row 1 - Lower */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 100px 1fr",
              padding: "10px 12px",
              borderBottom: "1px solid #eee",
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#CC0000", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: "bold" }}>{lowerBracketPrice}</span>
            </div>
            <div style={{ fontSize: 10, color: "#555" }}>{lowerBracketLabel}</div>
            <div style={{ fontSize: 10, color: "#333", lineHeight: 1.4 }}>
              {lowerBracketDescription || "Maximum buyer pool. Likely to generate multiple offers and bidding competition quickly. Best choice if speed is the priority."}
            </div>
          </div>

          {/* Row 2 - Bullseye (highlighted) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 100px 1fr",
              padding: "10px 12px",
              borderBottom: "1px solid #eee",
              background: "#FDECEA",
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#CC0000", flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: 11, fontWeight: "bold" }}>{bullseyePrice}</span>
                <div style={{ fontSize: 8, fontWeight: "bold", color: "#CC0000" }}>★ BULLSEYE</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#555" }}>{bullseyeBracketLabel}</div>
            <div style={{ fontSize: 10, color: "#333", lineHeight: 1.4 }}>
              {bullseyeDescription || "Top of the bracket. Reaches every buyer searching up to the bracket max. Strong Day 1 showings with maximum net result. Best overall strategy."}
            </div>
          </div>

          {/* Row 3 - Upper */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 100px 1fr",
              padding: "10px 12px",
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#CC0000", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: "bold" }}>{upperBracketPrice}</span>
            </div>
            <div style={{ fontSize: 10, color: "#555" }}>{upperBracketLabel}</div>
            <div style={{ fontSize: 10, color: "#333", lineHeight: 1.4 }}>
              {upperBracketDescription || "Enters a new, smaller buyer bracket. Fewer showings, longer days on market, and likely a price reduction will be needed. Highest risk of stalling."}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

BullseyeGraphic.displayName = "BullseyeGraphic";
export default BullseyeGraphic;
