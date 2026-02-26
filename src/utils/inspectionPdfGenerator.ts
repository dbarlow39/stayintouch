import { jsPDF } from "jspdf";
import { inspectionSections } from "@/data/inspectionData";
import logoImage from "@/assets/logo.jpg";

export const generateInspectionPDF = (data: Record<string, any>, photos: Record<string, string[]>) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 20;
  const lineHeight = 4.5;
  const margin = 10;
  const maxWidth = pageWidth - 2 * margin;

  const checkNewPage = (requiredSpace: number = 8) => {
    if (yPosition + requiredSpace > pageHeight - margin) { doc.addPage(); yPosition = 15; }
  };

  const drawBox = (x: number, y: number, width: number, height: number, fill = false) => {
    if (fill) { doc.setFillColor(240, 240, 240); doc.rect(x, y - 5, width, height, 'F'); }
    doc.setDrawColor(200, 200, 200); doc.rect(x, y - 5, width, height, 'S');
  };

  doc.setFillColor(194, 26, 41);
  doc.rect(0, 0, pageWidth, 35, 'F');
  try { doc.addImage(logoImage, 'JPEG', margin, 8, 38, 12); } catch (error) { console.error("Error adding logo:", error); }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Residential Inspection Work Sheet", pageWidth - margin, 12, { align: "right" });

  const propertyAddress = data["property-info"]?.address || "N/A";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Property: ${propertyAddress}`, pageWidth - margin, 22, { align: "right" });
  doc.setFontSize(7);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, 28, { align: "right" });

  yPosition = 42;
  doc.setTextColor(0, 0, 0);

  inspectionSections.forEach((section) => {
    let hasContent = false;
    section.fields.forEach((field) => {
      const value = data[section.id]?.[field.id];
      if (value !== undefined && value !== null && value !== "") hasContent = true;
    });
    const sectionPhotos = photos[section.id];
    const hasPhotos = sectionPhotos && sectionPhotos.length > 0;
    if (!hasContent && !hasPhotos) return;

    checkNewPage(18);
    doc.setFillColor(194, 26, 41);
    doc.rect(margin - 2, yPosition - 5, maxWidth + 4, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(section.title, margin + 2, yPosition);
    yPosition += 9;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);

    section.fields.forEach((field) => {
      const value = data[section.id]?.[field.id];

      if (section.id === 'property-info') {
        if (field.id === 'city') {
          const cityValue = data[section.id]?.city;
          const zipValue = data[section.id]?.zip;
          if (cityValue || zipValue) {
            checkNewPage(8); drawBox(margin, yPosition, maxWidth, 7, true);
            doc.setFont("helvetica", "bold"); doc.text("City:", margin + 2, yPosition);
            doc.setFont("helvetica", "normal"); doc.text(String(cityValue || ""), margin + 2 + doc.getTextWidth("City:") + 2, yPosition);
            const midPoint = maxWidth * 0.67;
            doc.setFont("helvetica", "bold"); doc.text("ZIP Code:", margin + midPoint, yPosition);
            doc.setFont("helvetica", "normal"); doc.text(String(zipValue || ""), margin + midPoint + doc.getTextWidth("ZIP Code:") + 2, yPosition);
            yPosition += 8;
          }
          return;
        }
        if (field.id === 'phone') {
          const phoneValue = data[section.id]?.phone;
          const emailValue = data[section.id]?.email;
          if (phoneValue || emailValue) {
            checkNewPage(8); drawBox(margin, yPosition, maxWidth, 7, true);
            doc.setFont("helvetica", "bold"); doc.text("Phone:", margin + 2, yPosition);
            doc.setFont("helvetica", "normal"); doc.text(String(phoneValue || ""), margin + 2 + doc.getTextWidth("Phone:") + 2, yPosition);
            const midPoint = maxWidth / 2;
            doc.setFont("helvetica", "bold"); doc.text("Email:", margin + midPoint, yPosition);
            doc.setFont("helvetica", "normal"); doc.text(String(emailValue || ""), margin + midPoint + doc.getTextWidth("Email:") + 2, yPosition);
            yPosition += 8;
          }
          return;
        }
        if (field.id === 'bedrooms') {
          const vals = { bedrooms: data[section.id]?.bedrooms, bathrooms: data[section.id]?.bathrooms, sqft: data[section.id]?.sqft, yearBuilt: data[section.id]?.yearBuilt };
          if (Object.values(vals).some(v => v)) {
            checkNewPage(8); drawBox(margin, yPosition, maxWidth, 7, true);
            const colWidth = maxWidth / 4;
            const labels = [["Bedrooms:", vals.bedrooms], ["Bathrooms:", vals.bathrooms], ["Sq Ft:", vals.sqft], ["Year:", vals.yearBuilt]];
            labels.forEach(([label, val], i) => {
              doc.setFont("helvetica", "bold"); doc.text(label as string, margin + colWidth * i + (i === 0 ? 2 : 0), yPosition);
              doc.setFont("helvetica", "normal"); doc.text(String(val || ""), margin + colWidth * i + (i === 0 ? 2 : 0) + doc.getTextWidth(label as string) + 2, yPosition);
            });
            yPosition += 8;
          }
          return;
        }
        if (['zip', 'email', 'bathrooms', 'sqft', 'yearBuilt'].includes(field.id)) return;
      }

      if (value !== undefined && value !== null && value !== "") {
        if (field.type === "radio" && field.options) {
          checkNewPage(Math.ceil(field.options.length / 5) * 5 + 6);
          doc.setFont("helvetica", "bold"); doc.text(field.label + ":", margin + 2, yPosition); yPosition += 5;
          const optionsPerRow = 5; const optionWidth = maxWidth / optionsPerRow;
          field.options.forEach((option, index) => {
            const col = index % optionsPerRow; const row = Math.floor(index / optionsPerRow);
            const xPos = margin + 2 + col * optionWidth; const yPos = yPosition + row * 5;
            doc.circle(xPos + 1.5, yPos - 1, 1.5, value === option ? 'FD' : 'D');
            doc.setFont("helvetica", "normal"); doc.text(option, xPos + 4, yPos);
          });
          yPosition += Math.ceil(field.options.length / optionsPerRow) * 5 + 3;
        } else if (field.type === "checkbox" && field.options) {
          checkNewPage(Math.ceil(field.options.length / 5) * 5 + 6);
          doc.setFont("helvetica", "bold"); doc.text(field.label + ":", margin + 2, yPosition); yPosition += 5;
          const optionsPerRow = 5; const optionWidth = maxWidth / optionsPerRow;
          const selectedValues = Array.isArray(value) ? value : [value];
          field.options.forEach((option, index) => {
            const col = index % optionsPerRow; const row = Math.floor(index / optionsPerRow);
            const xPos = margin + 2 + col * optionWidth; const yPos = yPosition + row * 5;
            const isSelected = selectedValues.includes(option);
            doc.rect(xPos, yPos - 2.5, 3, 3, isSelected ? 'FD' : 'D');
            if (isSelected) { doc.setFont("helvetica", "bold"); doc.text("✓", xPos + 0.5, yPos); }
            doc.setFont("helvetica", "normal"); doc.text(option, xPos + 4.5, yPos);
          });
          yPosition += Math.ceil(field.options.length / optionsPerRow) * 5 + 3;
        } else if (field.type === "textarea") {
          const displayValue = String(value);
          const lines = doc.splitTextToSize(displayValue, maxWidth - 4);
          const boxHeight = Math.max(10, lines.length * lineHeight + 6);
          checkNewPage(boxHeight + 2); drawBox(margin, yPosition, maxWidth, boxHeight, true);
          doc.setFont("helvetica", "bold"); doc.text(field.label + ":", margin + 2, yPosition); yPosition += lineHeight + 1;
          doc.setFont("helvetica", "normal");
          lines.forEach((line: string) => { doc.text(line, margin + 2, yPosition); yPosition += lineHeight; });
          yPosition += 2;
        } else {
          checkNewPage(8);
          const displayValue = String(value); drawBox(margin, yPosition, maxWidth, 7, true);
          doc.setFont("helvetica", "bold"); const labelText = field.label + ":"; doc.text(labelText, margin + 2, yPosition);
          const labelTextWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal"); doc.text(displayValue, margin + 2 + labelTextWidth + 2, yPosition); yPosition += 8;
        }
      }
    });

    if (hasPhotos) {
      checkNewPage(12);
      doc.setFont("helvetica", "bold"); doc.setFillColor(245, 245, 245);
      doc.rect(margin - 2, yPosition - 5, maxWidth + 4, 7, 'F');
      doc.text(`Photos (${sectionPhotos.length}):`, margin + 2, yPosition); yPosition += 8;
      const photosPerRow = 3; const photoWidth = (maxWidth - 8) / photosPerRow; const photoHeight = photoWidth * 0.75;
      for (let i = 0; i < sectionPhotos.length; i++) {
        const col = i % photosPerRow;
        if (col === 0) checkNewPage(photoHeight + 8);
        const xPos = margin + col * (photoWidth + 4);
        try {
          doc.addImage(sectionPhotos[i], 'JPEG', xPos, yPosition, photoWidth, photoHeight);
          doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.text(`Photo ${i + 1}`, xPos + 1, yPosition + photoHeight + 2.5); doc.setFontSize(8);
        } catch (error) {
          doc.setDrawColor(200, 0, 0); doc.rect(xPos, yPosition, photoWidth, photoHeight);
          doc.setFont("helvetica", "italic"); doc.setFontSize(7);
          doc.text(`[Photo ${i + 1}`, xPos + 2, yPosition + photoHeight / 2);
          doc.text(`unavailable]`, xPos + 2, yPosition + photoHeight / 2 + 3); doc.setFontSize(8);
        }
        if (col === photosPerRow - 1 || i === sectionPhotos.length - 1) yPosition += photoHeight + 6;
      }
    }
    yPosition += 5;
  });

  const filename = `WorkSheet_${propertyAddress.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
};
