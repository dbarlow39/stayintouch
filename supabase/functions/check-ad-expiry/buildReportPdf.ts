import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

export interface ReportInput {
  listingAddress: string;
  clientFirstNames?: string | null;
  agentFirstName?: string | null;
  agentFullName?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  runDates?: string | null;
  totalSpend?: string | null;
  engagements: number;
  impressions: number;
  reach: number;
  activity: { label: string; value: number }[];
  adImageUrl?: string | null;
  logoUrl?: string | null;
}

const RUBY = rgb(0.608, 0.067, 0.118);
const DARK = rgb(0.12, 0.16, 0.22);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.9, 0.91, 0.92);

const fmt = (n: number) => (n || 0).toLocaleString("en-US");

async function fetchImage(pdf: PDFDocument, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type.includes("png")) return await pdf.embedPng(bytes);
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return await pdf.embedPng(bytes);
  }
}

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612;
  const H = 792;
  const M = 54;
  const CW = W - M * 2;

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };

  const wrap = (text: string, size: number, f = font, width = CW) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > width && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const para = (text: string, size = 10.5, f = font, color = DARK, gap = 12) => {
    for (const line of wrap(text, size, f)) {
      need(size + 4);
      page.drawText(line, { x: M, y: y - size, size, font: f, color });
      y -= size + 4;
    }
    y -= gap;
  };

  // Header
  if (input.logoUrl) {
    try {
      const logo = await fetchImage(pdf, input.logoUrl);
      const lw = 130;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
      y -= lh + 14;
    } catch (_e) {
      // logo optional
    }
  }

  page.drawText("Facebook Ad Results", { x: M, y: y - 20, size: 20, font: bold, color: DARK });
  y -= 26;
  page.drawText(input.listingAddress, { x: M, y: y - 12, size: 11.5, font, color: GRAY });
  y -= 20;
  const sub = [input.runDates, input.totalSpend].filter(Boolean).join("  ·  ");
  if (sub) {
    page.drawText(sub, { x: M, y: y - 11, size: 10, font, color: GRAY });
    y -= 18;
  }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 22;

  // Letter body
  para(`Hi ${input.clientFirstNames || "there"},`);
  para(
    "We know our #1 job is to get your home sold for the most money in the shortest period of time, we are not just Real Estate Agents, we are master marketers who know the more eyeballs we can get to see your home the better our chances of finding you a buyer."
  );
  para(
    "Not only do we post your home on 1000's of websites across the country including the major sites like Zillow, Realtor.com or Redfin, we also place paid ads on social media sites like Facebook and Instagram the better our chances of finding you a buyer."
  );
  para(
    "We recently posted a paid advertising campaign for your property on Facebook and Instagram and wanted to share the results of that ad with you."
  );

  // Metrics cards
  need(74);
  const cards = [
    { v: fmt(input.engagements), l: "Engagements" },
    { v: fmt(input.impressions), l: "Views" },
    { v: fmt(input.reach), l: "People Reached" },
  ];
  const gap = 12;
  const cw = (CW - gap * 2) / 3;
  const ch = 58;
  cards.forEach((c, i) => {
    const x = M + i * (cw + gap);
    page.drawRectangle({
      x,
      y: y - ch,
      width: cw,
      height: ch,
      borderColor: LINE,
      borderWidth: 1,
      color: rgb(0.976, 0.98, 0.984),
    });
    const vw = bold.widthOfTextAtSize(c.v, 20);
    page.drawText(c.v, { x: x + (cw - vw) / 2, y: y - 30, size: 20, font: bold, color: DARK });
    const lw2 = font.widthOfTextAtSize(c.l, 9.5);
    page.drawText(c.l, { x: x + (cw - lw2) / 2, y: y - 46, size: 9.5, font, color: GRAY });
  });
  y -= ch + 24;

  // Activity
  if (input.activity.length) {
    need(30);
    page.drawText("Activity", { x: M, y: y - 13, size: 13, font: bold, color: DARK });
    y -= 24;
    const max = input.activity[0]?.value || 1;
    for (const item of input.activity) {
      need(22);
      page.drawText(item.label, { x: M, y: y - 11, size: 9.5, font, color: GRAY });
      const barX = M + 130;
      const barW = CW - 130 - 46;
      page.drawRectangle({ x: barX, y: y - 15, width: barW, height: 13, color: rgb(0.93, 0.94, 0.95) });
      page.drawRectangle({
        x: barX,
        y: y - 15,
        width: Math.max((item.value / max) * barW, 3),
        height: 13,
        color: RUBY,
      });
      const val = fmt(item.value);
      const vw = bold.widthOfTextAtSize(val, 9.5);
      page.drawText(val, { x: W - M - vw, y: y - 11, size: 9.5, font: bold, color: DARK });
      y -= 20;
    }
    y -= 14;
  }

  // Ad image
  if (input.adImageUrl) {
    try {
      const img = await fetchImage(pdf, input.adImageUrl);
      const iw = Math.min(CW * 0.82, 380);
      const ih = (img.height / img.width) * iw;
      need(ih + 30);
      page.drawText("Your Ad", { x: M, y: y - 13, size: 13, font: bold, color: DARK });
      y -= 22;
      need(ih + 8);
      page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih });
      y -= ih + 22;
    } catch (_e) {
      // image optional
    }
  }

  // Sign off
  need(70);
  para("Let me know if you have any questions.");
  para("Thanks", 10.5, font, DARK, 4);
  para(input.agentFirstName || "", 10.5, font, DARK, 8);
  if (input.agentFullName) para(input.agentFullName, 10.5, bold, DARK, 2);
  if (input.agentPhone) para(`cell: ${input.agentPhone}`, 10, font, GRAY, 2);
  if (input.agentEmail) para(`email: ${input.agentEmail}`, 10, font, GRAY, 2);

  return await pdf.save();
}
