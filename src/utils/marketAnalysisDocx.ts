import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  ShadingType,
  TableLayoutType,
  VerticalAlign,
} from "docx";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/logo.jpg";

const DARK_SCARLET = "8B0000";
const SCARLET = "CC0000";
const LIGHT_SCARLET = "FDECEA";
const GRAY_BG = "F2F2F2";

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function clean(text: string | undefined | null): string {
  return (text || "-").replace(/—/g, "-");
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: SCARLET } },
    children: [
      new TextRun({ text, bold: true, color: DARK_SCARLET, font: "Arial", size: 24 }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: clean(text), font: "Arial", size: 24 })],
  });
}

function overviewRow(label: string, value: string, altRow: boolean): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3200, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: GRAY_BG },
        children: [
          new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 22 })] }),
        ],
      }),
      new TableCell({
        width: { size: 6160, type: WidthType.DXA },
        shading: altRow ? { type: ShadingType.CLEAR, fill: LIGHT_SCARLET } : undefined,
        children: [
          new Paragraph({ children: [new TextRun({ text: clean(value), font: "Arial", size: 22 })] }),
        ],
      }),
    ],
  });
}

function tableHeaderRow(columns: string[], columnCount?: number): TableRow {
  // Single spanning header row with dark scarlet fill
  return new TableRow({
    children: columns.map((col) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: SCARLET },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: col, bold: true, color: "FFFFFF", font: "Arial", size: 20 })],
          }),
        ],
      })
    ),
  });
}

function spanningHeaderRow(text: string, colSpan: number): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: colSpan,
        shading: { type: ShadingType.CLEAR, fill: SCARLET },
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 22 })],
          }),
        ],
      }),
    ],
  });
}

function dataRow(values: string[], altRow: boolean): TableRow {
  return new TableRow({
    children: values.map((val) =>
      new TableCell({
        shading: altRow ? { type: ShadingType.CLEAR, fill: LIGHT_SCARLET } : undefined,
        children: [
          new Paragraph({ children: [new TextRun({ text: clean(val), font: "Arial", size: 20 })] }),
        ],
      })
    ),
  });
}

async function base64ToUint8Array(dataUrl: string): Promise<Uint8Array> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 460, height: 673 });
    img.src = dataUrl;
  });
}

export async function generateMarketAnalysisDocx(
  analysis: any,
  bullseyeImage: string | null,
  zillowImage: string | null
) {
  const prop = analysis.property || {};
  const comps = analysis.closedComps || [];
  const activeComps = analysis.activeComps || [];
  const stats = analysis.compStats || {};
  const community = analysis.community || {};
  const pricing = analysis.pricing || {};
  const narrative = analysis.narrative || {};
  const features = analysis.features || [];

  const sections: any[] = [];

  // ── LOGO ──
  let logoBytes: Uint8Array | null = null;
  try {
    const response = await fetch(logoUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    logoBytes = new Uint8Array(buffer);
  } catch (e) {
    console.error("Failed to load logo:", e);
  }

  // ── 1. HEADER TABLE: logo left, title/address/date right ──
  const headerCells: TableCell[] = [];
  headerCells.push(
    new TableCell({
      width: { size: 3000, type: WidthType.DXA },
      borders: noBorder,
      verticalAlign: VerticalAlign.CENTER,
      children: logoBytes
        ? [new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 252, height: 117 }, type: "jpg" })] })]
        : [new Paragraph({ children: [] })],
    })
  );
  headerCells.push(
    new TableCell({
      width: { size: 6500, type: WidthType.DXA },
      borders: noBorder,
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "MARKET ANALYSIS SUMMARY", bold: true, color: DARK_SCARLET, font: "Arial", size: 32 })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 60 },
          children: [new TextRun({ text: clean(prop.address ? `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}` : ""), bold: true, color: SCARLET, font: "Arial", size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 60 },
          children: [new TextRun({ text: `Prepared by Dave Barlow | ${new Date().toLocaleDateString()}`, color: "808080", font: "Arial", size: 18 })],
        }),
      ],
    })
  );
  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: headerCells })],
    })
  );
  sections.push(new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: SCARLET } }, children: [] }));

  // ── 2. SALUTATION ──
  if (prop.owner1) {
    const names = [prop.owner1, prop.owner2].filter(Boolean).join(" and ");
    sections.push(bodyParagraph(`Dear ${names},`));
  }
  if (narrative.intro) sections.push(bodyParagraph(narrative.intro));

  // ── 3. PROPERTY OVERVIEW ──
  sections.push(sectionHeading("PROPERTY OVERVIEW"));
  const overviewFields: [string, string][] = [
    ["Address", prop.address ? `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}` : "-"],
    ["Owner(s)", [prop.owner1, prop.owner2].filter(Boolean).join(" and ") || "-"],
    ["Style", prop.style],
    ["Bedrooms / Baths", `${prop.bedrooms || "-"} / ${prop.baths || "-"}`],
    ["Above-Grade Sq Ft", prop.aboveGradeSqFt],
    ["Finished Basement Sq Ft", prop.basementSqFt],
    ["Total Finished Sq Ft", prop.totalFinishedSqFt],
    ["Lot Size", prop.lotAcres ? `${prop.lotAcres} acres` : prop.lotDimensions || "-"],
    ["Year Built", prop.yearBuilt],
    ["Builder", prop.builder],
    ["Garage", prop.garage],
    ["Subdivision", prop.subdivision],
    ["HOA", prop.hoa],
    ["HOA Amenities", prop.hoaAmenities],
    ["County Market Value", prop.countyMarketValue],
    ["Annual Property Tax", prop.annualTax ? `${prop.annualTax} (${prop.taxYear || ""})` : "-"],
    ["Last Sale Price & Date", prop.lastSalePrice ? `${prop.lastSalePrice} (${prop.lastSaleDate || ""})` : "-"],
    ["2-Year Appreciation", prop.appreciation2yr],
    ["Q1 Price Forecast", prop.q1Forecast],
    ["Zillow Zestimate", prop.zestimate],
  ];
  sections.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3200, 6160],
      rows: overviewFields.map(([label, value], i) => overviewRow(label, value || "-", i % 2 === 1)),
    })
  );
  if (narrative.taxNote) sections.push(bodyParagraph(narrative.taxNote));

  // ── 4. NOTABLE FEATURES ──
  if (features.length > 0) {
    sections.push(sectionHeading("NOTABLE PROPERTY FEATURES"));
    for (const feature of features) {
      sections.push(
        new Paragraph({
          spacing: { after: 80 },
          bullet: { level: 0 },
          children: [new TextRun({ text: clean(feature), font: "Arial", size: 22 })],
        })
      );
    }
  }

  // ── 5. COMPARABLE SALES ──
  sections.push(sectionHeading("RECENT COMPARABLE SALES"));

  if (comps.length > 0) {
    const closedCols = ["Address", "Closed", "List Price", "Sold Price", "Beds", "Baths", "Sq Ft", "Year", "DOM"];
    sections.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2200, 900, 900, 900, 600, 600, 700, 700, 760],
        rows: [
          spanningHeaderRow("Closed Sales", closedCols.length),
          tableHeaderRow(closedCols),
          ...comps.map((c: any, i: number) =>
            dataRow([c.address, c.closedDate, c.listPrice, c.soldPrice, c.beds, c.baths, c.sqFt, c.yearBuilt, c.dom], i % 2 === 1)
          ),
        ],
      })
    );
  }

  if (activeComps.length > 0) {
    sections.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
    const activeCols = ["Address", "Listed", "List Price", "Beds", "Baths", "Sq Ft", "Year", "DOM"];
    sections.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2400, 1000, 1000, 700, 700, 800, 800, 960],
        rows: [
          spanningHeaderRow("Active Listings", activeCols.length),
          tableHeaderRow(activeCols),
          ...activeComps.map((c: any, i: number) =>
            dataRow([c.address, c.listedDate, c.listPrice, c.beds, c.baths, c.sqFt, c.yearBuilt, c.dom], i % 2 === 1)
          ),
        ],
      })
    );
  }

  // Summary stats table
  if (stats.soldAvg) {
    sections.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
    const statsCols = ["Metric", "Low", "Average", "Median", "High"];
    sections.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 1840, 1840, 1840, 1840],
        rows: [
          spanningHeaderRow("Summary Statistics", statsCols.length),
          tableHeaderRow(statsCols),
          dataRow(["Sold Price", stats.soldLow, stats.soldAvg, stats.soldMedian, stats.soldHigh], false),
          dataRow(["List Price", stats.listLow, stats.listAvg, "-", stats.listHigh], true),
          dataRow(["Avg Sq Ft", "-", stats.sqFtAvg, "-", "-"], false),
          dataRow(["Avg DOM", "-", stats.domAvg, "-", "-"], true),
          dataRow(["Sold/List Ratio", "-", stats.soldToListRatio, "-", "-"], false),
        ],
      })
    );
  }

  // Comp comparison bullets
  if (narrative.compComparison?.length > 0) {
    sections.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
    for (const bullet of narrative.compComparison) {
      sections.push(
        new Paragraph({
          spacing: { after: 80 },
          bullet: { level: 0 },
          children: [new TextRun({ text: clean(bullet), font: "Arial", size: 22 })],
        })
      );
    }
  }

  // ── 6. COMMUNITY INSIGHTS ──
  sections.push(sectionHeading("COMMUNITY AND NEIGHBORHOOD INSIGHTS"));
  const communityFields: [string, string][] = [
    ["School District", community.schoolDistrict],
    ["Test Ranking", community.testRank],
    ["Family Friendly Score", community.familyScore],
    ["Crime Risk Score", community.crimeScore],
    ["Walkability Score", community.walkScore],
    ["Flood Zone", community.floodZone],
    ["Subdivision", community.subdivision],
    ["Township", community.township],
  ];
  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: communityFields.map(([label, value], i) => overviewRow(label, value || "-", i % 2 === 1)),
    })
  );
  if (narrative.communityParagraph) sections.push(bodyParagraph(narrative.communityParagraph));

  // ── 7. MARKET CONDITIONS ──
  sections.push(sectionHeading("CURRENT MARKET CONDITIONS"));
  if (narrative.marketConditions) sections.push(bodyParagraph(narrative.marketConditions));

  // ── 8. ZILLOW ZESTIMATE ──
  sections.push(sectionHeading("ZILLOW ZESTIMATE - WHAT IT SAYS AND WHAT IT MISSES"));
  if (zillowImage) {
    try {
      const imgBytes = await base64ToUint8Array(zillowImage);
      const dims = await getImageDimensions(zillowImage);
      const docWidth = 370;
      const docHeight = Math.round(docWidth * (dims.height / dims.width));
      sections.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new ImageRun({ data: imgBytes, transformation: { width: docWidth, height: docHeight }, type: "png" })],
        })
      );
    } catch (e) {
      console.error("Failed to embed Zillow image:", e);
    }
  }
  if (narrative.zillowWordOn) sections.push(bodyParagraph(narrative.zillowWordOn));
  if (narrative.zillowNoteOn) sections.push(bodyParagraph(narrative.zillowNoteOn));

  // ── 9. PRICING STRATEGY ──
  sections.push(sectionHeading("OUR PRICING STRATEGY - THE BULLSEYE PRICING MODEL"));
  if (bullseyeImage) {
    try {
      const imgBytes = await base64ToUint8Array(bullseyeImage);
      const dims = await getImageDimensions(bullseyeImage);
      const docWidth = 460;
      const docHeight = Math.round(docWidth * (dims.height / dims.width));
      sections.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new ImageRun({ data: imgBytes, transformation: { width: docWidth, height: docHeight }, type: "png" })],
        })
      );
    } catch (e) {
      console.error("Failed to embed Bullseye image:", e);
    }
  }
  if (narrative.bullseyeExplain) sections.push(bodyParagraph(narrative.bullseyeExplain));
  if (narrative.bracketAnalysis) sections.push(bodyParagraph(narrative.bracketAnalysis));
  if (narrative.priceJustification) sections.push(bodyParagraph(narrative.priceJustification));

  // ── 10. NEXT STEPS ──
  sections.push(sectionHeading("NEXT STEPS"));
  if (narrative.nextSteps) sections.push(bodyParagraph(narrative.nextSteps));

  // ── 11. SIGNATURE BOX ──
  sections.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
  sections.push(
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: LIGHT_SCARLET },
      spacing: { after: 40 },
      children: [new TextRun({ text: "Dave Barlow", bold: true, color: DARK_SCARLET, font: "Arial", size: 28 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: LIGHT_SCARLET },
      spacing: { after: 40 },
      children: [new TextRun({ text: "The Barlow Group | SellFor1Percent.com", font: "Arial", size: 22 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: LIGHT_SCARLET },
      spacing: { after: 40 },
      children: [new TextRun({ text: "All You Need to Know About Real Estate!", italics: true, font: "Arial", size: 22 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: LIGHT_SCARLET },
      children: [new TextRun({ text: "614-778-6616 | dave@sellfor1percent.com", font: "Arial", size: 22 })],
    })
  );

  // ── BUILD DOCUMENT ──
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Market_Analysis_${clean(prop.address || "Property").replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
  saveAs(blob, fileName);
}
