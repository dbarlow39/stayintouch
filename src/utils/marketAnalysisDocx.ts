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
  HeadingLevel,
  ShadingType,
  TableLayoutType,
  TabStopPosition,
  TabStopType,
} from "docx";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/logo.jpg";

const DARK_SCARLET = "8B0000";
const SCARLET = "CC0000";
const LIGHT_SCARLET = "FDECEA";
const DARK_NAVY = "1F3864";
const GRAY_BG = "F2F2F2";

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: SCARLET } },
    children: [
      new TextRun({
        text,
        bold: true,
        color: DARK_SCARLET,
        font: "Arial",
        size: 24,
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: text.replace(/—/g, "-"),
        font: "Arial",
        size: 24,
      }),
    ],
  });
}

function overviewRow(label: string, value: string, altRow: boolean): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3500, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: GRAY_BG },
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, font: "Arial", size: 22 })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 6000, type: WidthType.DXA },
        shading: altRow ? { type: ShadingType.CLEAR, fill: LIGHT_SCARLET } : undefined,
        children: [
          new Paragraph({
            children: [new TextRun({ text: value || "-", font: "Arial", size: 22 })],
          }),
        ],
      }),
    ],
  });
}

function compTableHeaderRow(columns: string[]): TableRow {
  return new TableRow({
    children: columns.map(
      (col) =>
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

function compDataRow(values: string[], altRow: boolean): TableRow {
  return new TableRow({
    children: values.map(
      (val) =>
        new TableCell({
          shading: altRow ? { type: ShadingType.CLEAR, fill: LIGHT_SCARLET } : undefined,
          children: [
            new Paragraph({
              children: [new TextRun({ text: val || "-", font: "Arial", size: 20 })],
            }),
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

function getImageDimensions(dataUrl: string): Promise<{width: number, height: number}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 460, height: 800 });
    img.src = dataUrl;
  });
}

export async function generateMarketAnalysisDocx(
  analysis: any,
  bullseyeImage: string | null,
  zillowImage: string | null
) {
  const overview = analysis.propertyOverview || {};
  const comps = analysis.comparableSales || {};
  const community = analysis.communityInsights || {};
  const market = analysis.marketConditions || {};
  const zillow = analysis.zillowAnalysis || {};
  const pricing = analysis.pricingStrategy || {};
  const salutation = analysis.salutation || {};

  const sections: any[] = [];

  // Fetch logo image
  let logoBytes: Uint8Array | null = null;
  try {
    const response = await fetch(logoUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    logoBytes = new Uint8Array(buffer);
  } catch (e) {
    console.error("Failed to load logo:", e);
  }

  // HEADER with logo
  if (logoBytes) {
    sections.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 100 },
        children: [
          new ImageRun({
            data: logoBytes,
            transformation: { width: 180, height: 60 },
            type: "jpg",
          }),
        ],
      })
    );
  }

  sections.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "MARKET ANALYSIS SUMMARY", bold: true, color: DARK_SCARLET, font: "Arial", size: 32 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: overview.address || "", bold: true, color: SCARLET, font: "Arial", size: 24 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `Prepared by ${analysis.agentName || "Dave Barlow"} | ${analysis.preparedDate || new Date().toLocaleDateString()}`, color: "808080", font: "Arial", size: 18 }),
      ],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: DARK_NAVY } },
      spacing: { after: 300 },
      children: [],
    })
  );

  // SALUTATION
  if (salutation.firstNames) {
    sections.push(
      bodyParagraph(`Dear ${salutation.firstNames},`),
      bodyParagraph(salutation.introductionParagraph || "")
    );
  }

  // SECTION 1: PROPERTY OVERVIEW
  sections.push(sectionHeading("PROPERTY OVERVIEW"));

  const overviewLabels: Record<string, string> = {
    address: "Address",
    owners: "Owners",
    style: "Style",
    bedroomsBaths: "Bedrooms / Baths",
    aboveGradeSqFt: "Above-Grade Sq Ft",
    finishedBasement: "Finished Basement",
    lotSize: "Lot Size",
    yearBuilt: "Year Built",
    garage: "Garage",
    subdivision: "Subdivision",
    hoa: "HOA",
    countyMarketValue: "County Market Value",
    annualPropertyTax: "Annual Property Tax",
    lastPurchasePriceDate: "Last Purchase Price & Date",
    twoYearAppreciation: "2-Year Appreciation",
    q1PriceForecast: "Q1 Price Forecast",
    zillowZestimate: "Zillow Zestimate",
  };

  const overviewRows = Object.entries(overviewLabels).map(([key, label], i) =>
    overviewRow(label, String(overview[key] || "-"), i % 2 === 1)
  );

  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: overviewRows,
    })
  );

  if (overview.countyMarketValue) {
    sections.push(
      bodyParagraph(
        `A note on the county's assessed market value of ${overview.countyMarketValue}: tax assessments in Ohio typically lag actual market conditions by two to three years and should not be used as a pricing benchmark. The comparable sales data below is a far more accurate reflection of current buyer demand.`
      )
    );
  }

  // SECTION 2: NOTABLE FEATURES
  if (analysis.notableFeatures?.length > 0) {
    sections.push(sectionHeading("NOTABLE PROPERTY FEATURES"));
    for (const feature of analysis.notableFeatures) {
      sections.push(
        new Paragraph({
          spacing: { after: 80 },
          bullet: { level: 0 },
          children: [new TextRun({ text: feature.replace(/—/g, "-"), font: "Arial", size: 22 })],
        })
      );
    }
  }

  // SECTION 3: COMPARABLE SALES
  if (comps.closedSales?.length > 0) {
    sections.push(sectionHeading("RECENT COMPARABLE SALES"));
    sections.push(bodyParagraph("Closed Sales"));

    const closedHeaders = ["Address", "Closed Date", "List Price", "Sold Price", "Beds/Baths", "Sq Ft", "Year Built", "DOM"];
    const closedRows = comps.closedSales.map((c: any, i: number) =>
      compDataRow([c.address, c.closedDate, c.listPrice, c.soldPrice, c.bedsBaths, c.sqFt, c.yearBuilt, c.dom], i % 2 === 1)
    );

    sections.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [compTableHeaderRow(closedHeaders), ...closedRows],
      })
    );
  }

  if (comps.activeListings?.length > 0) {
    sections.push(bodyParagraph("Active Listings"));
    const activeHeaders = ["Address", "Listed Date", "List Price", "Status", "Beds/Baths", "Sq Ft", "Year Built", "DOM"];
    const activeRows = comps.activeListings.map((c: any, i: number) =>
      compDataRow([c.address, c.listedDate, c.listPrice, c.status, c.bedsBaths, c.sqFt, c.yearBuilt, c.dom], i % 2 === 1)
    );
    sections.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [compTableHeaderRow(activeHeaders), ...activeRows],
      })
    );
  }

  if (comps.howYourHomeCompares) {
    sections.push(bodyParagraph(comps.howYourHomeCompares));
  }

  // SECTION 4: COMMUNITY INSIGHTS
  sections.push(sectionHeading("COMMUNITY AND NEIGHBORHOOD INSIGHTS"));
  const communityLabels: Record<string, string> = {
    schoolDistrict: "School District",
    familyFriendlyScore: "Family Friendly Score",
    crimeRiskScore: "Total Crime Risk Score",
    walkabilityScore: "Walkability Score",
    floodZone: "Flood Zone",
    subdivision: "Subdivision",
    hoa: "HOA",
    lotNotes: "Lot Notes",
  };
  const communityRows = Object.entries(communityLabels).map(([key, label], i) =>
    overviewRow(label, String(community[key] || "-"), i % 2 === 1)
  );
  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: communityRows,
    })
  );
  if (community.narrative) sections.push(bodyParagraph(community.narrative));

  // SECTION 5: MARKET CONDITIONS
  sections.push(sectionHeading("CURRENT MARKET CONDITIONS"));
  if (market.marketNarrative) sections.push(bodyParagraph(market.marketNarrative));
  if (market.onlineValuationCaution) sections.push(bodyParagraph(market.onlineValuationCaution));

  // SECTION 6: ZILLOW
  sections.push(sectionHeading("ZILLOW ZESTIMATE - WHAT IT SAYS AND WHAT IT MISSES"));

  if (zillowImage) {
    try {
      const imgBytes = await base64ToUint8Array(zillowImage);
      sections.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new ImageRun({
              data: imgBytes,
              transformation: { width: 370, height: 536 },
              type: "png",
            }),
          ],
        })
      );
    } catch (e) {
      console.error("Failed to embed Zillow image:", e);
    }
  }

  if (zillow.wordOnZestimate) sections.push(bodyParagraph(zillow.wordOnZestimate));
  if (zillow.onlineValuationNote) sections.push(bodyParagraph(zillow.onlineValuationNote));

  // SECTION 7: PRICING STRATEGY
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
          children: [
            new ImageRun({
              data: imgBytes,
              transformation: { width: docWidth, height: docHeight },
              type: "png",
            }),
          ],
        })
      );
    } catch (e) {
      console.error("Failed to embed Bullseye image:", e);
    }
  }

  if (pricing.bullseyeExplanation) sections.push(bodyParagraph(pricing.bullseyeExplanation));
  if (pricing.bracketAnalysis) sections.push(bodyParagraph(pricing.bracketAnalysis));
  if (pricing.priceJustification) sections.push(bodyParagraph(pricing.priceJustification));

  // SECTION 8: NEXT STEPS
  sections.push(sectionHeading("NEXT STEPS"));
  if (analysis.nextSteps) sections.push(bodyParagraph(analysis.nextSteps));

  // SIGNATURE
  sections.push(
    new Paragraph({ spacing: { before: 400 }, children: [] }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: LIGHT_SCARLET },
      spacing: { after: 40 },
      children: [
        new TextRun({ text: analysis.agentName || "Dave Barlow", bold: true, color: DARK_SCARLET, font: "Arial", size: 28 }),
      ],
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

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Market_Analysis_${(overview.address || "Property").replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
  saveAs(blob, fileName);
}
