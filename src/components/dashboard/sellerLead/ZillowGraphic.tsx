import { forwardRef } from "react";

interface ZillowGraphicProps {
  address: string;
  zestimate: string;
  zestimateRange: string;
  rentZestimate: string;
  pricePerSqFt: string;
  zillowBeds: string;
  zillowBaths: string;
  propertyType: string;
  yearBuilt: string;
  updatedMonth: string;
  appreciation10yr: string;
  importantContext: string;
}

const ZillowGraphic = forwardRef<HTMLDivElement, ZillowGraphicProps>(
  (
    {
      address,
      zestimate,
      zestimateRange,
      rentZestimate,
      pricePerSqFt,
      zillowBeds,
      zillowBaths,
      propertyType,
      yearBuilt,
      updatedMonth,
      appreciation10yr,
      importantContext,
    },
    ref
  ) => {
    // Parse range for slider
    const rangeMatch = zestimateRange?.match(/\$?([\d,]+)K?\s*[-–]\s*\$?([\d,]+)K?/);
    let rangeLow = "";
    let rangeHigh = "";
    if (rangeMatch) {
      const parseLowHigh = (s: string) => {
        const n = parseInt(s.replace(/,/g, ""));
        return n < 1000 ? `$${n},000` : `$${n.toLocaleString()}`;
      };
      rangeLow = parseLowHigh(rangeMatch[1]);
      rangeHigh = parseLowHigh(rangeMatch[2]);
    }

    const bedsBathsDisplay = `${zillowBeds} bd / ${zillowBaths} ba`;

    return (
      <div
        ref={ref}
        style={{
          width: 370,
          minHeight: 536,
          background: "#FFFFFF",
          fontFamily: "Arial, Helvetica, sans-serif",
          border: "1px solid #ddd",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {/* Zillow Header */}
        <div style={{ background: "#006AFF", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L1 7.5h2.5V15h9V7.5H15L8 1z" />
            </svg>
            <span style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "bold" }}>Zillow</span>
          </div>
          <div
            style={{
              display: "inline-block",
              background: "#0050CC",
              color: "#FFFFFF",
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: "bold",
            }}
          >
            Zestimate®
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px" }}>
          {/* Address */}
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>{address}</div>

          {/* Big Zestimate */}
          <div style={{ fontSize: 36, fontWeight: "bold", color: "#1a1a1a", lineHeight: 1.1, marginBottom: 4 }}>
            {zestimate}
          </div>

          {/* Updated / Appreciation */}
          <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>
            Updated {updatedMonth} · {appreciation10yr}
          </div>

          {/* Three info boxes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 16,
              borderTop: "1px solid #eee",
              borderBottom: "1px solid #eee",
              padding: "12px 0",
            }}
          >
            <div>
              <div style={{ fontSize: 9, color: "#888", marginBottom: 2 }}>Zestimate®</div>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#1a1a1a" }}>{zestimate}</div>
            </div>
            <div style={{ borderLeft: "1px dashed #ddd", paddingLeft: 8 }}>
              <div style={{ fontSize: 9, color: "#888", marginBottom: 2 }}>Est. sales range</div>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#1a1a1a" }}>{zestimateRange}</div>
            </div>
            <div style={{ borderLeft: "1px dashed #ddd", paddingLeft: 8 }}>
              <div style={{ fontSize: 9, color: "#888", marginBottom: 2 }}>Rent Zestimate®</div>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#1a1a1a" }}>{rentZestimate}</div>
            </div>
          </div>

          {/* Range slider */}
          {rangeLow && rangeHigh && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 4 }}>
                <span>{rangeLow}</span>
                <span style={{ fontSize: 9, color: "#aaa" }}>estimated sales range</span>
                <span>{rangeHigh}</span>
              </div>
              <div style={{ position: "relative", height: 8, background: "#006AFF", borderRadius: 4 }}>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -3,
                    transform: "translateX(-50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    border: "2px solid #006AFF",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Stats rows */}
          <div style={{ borderTop: "1px solid #eee" }}>
            {[
              { label: "Price per sq ft", value: pricePerSqFt },
              { label: "Beds / Baths (Zillow count)", value: bedsBathsDisplay },
              { label: "Property type", value: propertyType },
              { label: "Year built", value: yearBuilt },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#555" }}>{row.label}</span>
                <span style={{ fontWeight: "bold", color: "#1a1a1a" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{ fontSize: 9, color: "#999", marginTop: 12, lineHeight: 1.4 }}>
            The Zestimate is Zillow's estimated market value computed using a proprietary formula including public and user-submitted data. It is not an appraisal and cannot be used in place of one. The Zestimate may not reflect recent upgrades, above-grade vs. below-grade square footage distinctions, or property-specific features.
          </div>

          {/* Important Context */}
          {importantContext && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderLeft: "4px solid #D4A017",
                background: "#FFFDE7",
                fontSize: 11,
                color: "#333",
                lineHeight: 1.5,
              }}
            >
              <strong>Important context:</strong> {importantContext}
            </div>
          )}
        </div>
      </div>
    );
  }
);

ZillowGraphic.displayName = "ZillowGraphic";
export default ZillowGraphic;
