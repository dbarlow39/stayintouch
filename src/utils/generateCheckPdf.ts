import jsPDF from "jspdf";

interface CheckLineItem {
  amount: number;
  label: string;
}

interface CheckData {
  date: string;
  totalAmount: number;
  agentName: string;
  agentAddress: string;
  agentAttention?: string;
  agentCityStateZip: string;
  propertyNames: string;
  lineItems: CheckLineItem[];
  ytdTotal: number;
  memo?: string;
}

const numberToWords = (num: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 1000000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    return convert(Math.floor(n / 1000000)) + " Million" + (n % 1000000 ? " " + convert(n % 1000000) : "");
  };

  const dollars = Math.floor(num);
  const cents = Math.round((num - dollars) * 100);
  const centsStr = cents.toString().padStart(2, "0");

  return `${convert(dollars)} and ${centsStr}/100`;
};

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

export const generateCheckPdf = (data: CheckData) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftMargin = 50;
  const rightMargin = pageWidth - 50;
  let y = 69;

  // Date - right aligned
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(data.date, rightMargin, y, { align: "right" });

  y += 37;

  // Total amount - right aligned with asterisks
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`**${formatCurrency(data.totalAmount)}`, rightMargin, y, { align: "right" });

  y += 14;

  // Written amount with dashes
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const writtenAmount = `${numberToWords(data.totalAmount)} --------------`;
  doc.text(writtenAmount, (pageWidth / 2) + 40, y, { align: "center" });

  y += 32;

  // Agent name and address - indented
  const addressX = 128;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(data.agentName, addressX, y);
  y += 16;
  doc.text(data.agentAddress, addressX, y);
  y += 16;
  doc.text(data.agentCityStateZip, addressX, y);
  if (data.agentAttention) {
    y += 16;
    doc.text(data.agentAttention, addressX, y);
  }

  y += 19;

  // Memo (printed one line below address block, no label)
  if (data.memo) {
    doc.setFontSize(8);
    doc.text(data.memo, addressX - 70, y);
    y += 16;
  }

  // Property names summary line
  doc.setFontSize(8);
  doc.text(data.propertyNames, leftMargin, y);

  y += 72;

  // Line items table
  doc.setFontSize(11);
  for (const item of data.lineItems) {
    doc.text(formatCurrency(item.amount), leftMargin + 60, y, { align: "right" });
    doc.text(item.label, leftMargin + 80, y);
    y += 18;
  }

  y += 14;

  // YTD Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(formatCurrency(data.ytdTotal), leftMargin + 60, y, { align: "right" });
  doc.text("YTD", leftMargin + 80, y);

  // Save
  const fileName = `Commission_Check_${data.agentName.replace(/\s+/g, "_")}_${data.date.replace(/[\s,]+/g, "_")}.pdf`;
  doc.save(fileName);
};

export type { CheckData, CheckLineItem };
