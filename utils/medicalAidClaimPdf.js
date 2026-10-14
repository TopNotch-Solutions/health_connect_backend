const PDFDocument = require("pdfkit");

function formatMoney(amount) {
  const value = Number(amount || 0);
  return `$${value.toLocaleString("en-NA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatTime(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function lineAddress(parts) {
  return parts.filter(Boolean).join(" ").trim();
}

/**
 * Build a medical-aid statement PDF similar to a Namibian provider claim statement.
 * Streams PDF bytes into the Express response.
 */
function streamMedicalAidClaimPdf(res, { request, provider, patient, ailment }) {
  const medicalAid = request.medicalAidDetails || {};
  const consultationDate =
    request.timeline?.consultationCompleted ||
    request.timeline?.consultationStarted ||
    request.updatedAt ||
    request.createdAt;

  const timeIn =
    request.timeline?.consultationStarted ||
    request.timeline?.providerArrived ||
    request.timeline?.callStarted ||
    consultationDate;
  const timeOut = request.timeline?.consultationCompleted || consultationDate;

  const providerName = String(provider?.fullname || "PROVIDER").toUpperCase();
  const patientName = String(
    patient?.fullname || medicalAid.mainMemberName || "PATIENT",
  ).toUpperCase();
  const mainMember = String(
    medicalAid.mainMemberName || patient?.fullname || "—",
  ).toUpperCase();
  const practiceNumber =
    provider?.practiceNumber || provider?.hpcnaNumber || "—";
  const medicalAidTitle = String(medicalAid.medicalAidTitle || "MEDICAL AID");
  const maf = medicalAid.membershipNumber || "—";
  const mainMemberId = patient?.nationalId || maf;
  const icd10 = medicalAid.icd10Code || "—";
  const ailmentTitle = ailment?.title || "Consultation";
  const amount = Number(request.consultationCost || 0);
  const providerAddress = lineAddress([
    provider?.address,
    provider?.cityTown || provider?.town,
    provider?.region,
    "NAMIBIA",
  ]);
  const patientAddress =
    medicalAid.residentialAddress ||
    lineAddress([
      request.address?.route,
      request.address?.locality,
      request.address?.administrative_area_level_1,
      "NAMIBIA",
    ]);

  const safeFileName = `${patientName.replace(/[^a-z0-9]+/gi, "_")}_claim.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFileName}"`,
  );

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `${providerName} - Statement`,
      Author: providerName,
      Subject: "Medical Aid Consultation Statement",
    },
  });

  doc.pipe(res);

  const leftX = 40;
  const rightX = 320;
  let y = 40;

  // Header – practice name
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#111827")
    .text(`${providerName} - STATEMENT`, leftX, y, { width: 520 });
  y += 28;

  // Two-column address block
  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  const leftBlock = [patientName, patientAddress || "NAMIBIA"];
  const rightBlock = [providerAddress || "NAMIBIA"];
  leftBlock.forEach((line, i) => {
    doc.text(line, leftX, y + i * 12, { width: 250 });
  });
  rightBlock.forEach((line, i) => {
    doc.text(line, rightX, y + i * 12, { width: 230 });
  });
  y += Math.max(leftBlock.length, rightBlock.length) * 12 + 18;

  // Practice number
  doc.font("Helvetica-Bold").fontSize(9).text("PRACTICE NUMBER:", leftX, y);
  y += 12;
  doc.font("Helvetica").text(String(practiceNumber), leftX, y);
  y += 20;

  // Medical fund reference block
  doc.font("Helvetica-Bold").text("MEDICAL FUND REFERENCE", leftX, y);
  y += 14;

  const refRows = [
    ["MEDICAL AID", medicalAidTitle.toUpperCase(), "TIME IN", formatTime(timeIn)],
    ["MAF", String(maf), "TIME OUT", formatTime(timeOut)],
    ["MAIN MEMBER ID", String(mainMemberId), "", ""],
  ];

  refRows.forEach((row) => {
    doc.font("Helvetica-Bold").fontSize(8).text(row[0], leftX, y, { width: 90 });
    doc.font("Helvetica").text(row[1], leftX + 95, y, { width: 150 });
    if (row[2]) {
      doc.font("Helvetica-Bold").text(row[2], rightX, y, { width: 70 });
      doc.font("Helvetica").text(row[3], rightX + 75, y, { width: 80 });
    }
    y += 13;
  });

  y += 10;
  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#9CA3AF")
    .lineWidth(0.8)
    .stroke();
  y += 10;

  // Table header
  const cols = [
    { label: "DATE", x: leftX, w: 58 },
    { label: "PROVIDER", x: leftX + 58, w: 88 },
    { label: "DEPENDANT", x: leftX + 146, w: 78 },
    { label: "BHF/NAMAF", x: leftX + 224, w: 78 },
    { label: "DETAILS", x: leftX + 302, w: 120 },
    { label: "AMOUNT", x: leftX + 422, w: 50 },
    { label: "DUE", x: leftX + 472, w: 45 },
  ];

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#374151");
  cols.forEach((col) => {
    doc.text(col.label, col.x, y, { width: col.w });
  });
  y += 12;
  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#D1D5DB")
    .lineWidth(0.5)
    .stroke();
  y += 8;

  // Line item
  const details = `${ailmentTitle}\nICD10 ${icd10}`;
  const shortProvider = providerName.length > 14
    ? `${providerName.slice(0, 14)}…`
    : providerName;
  const shortPatient =
    patientName.length > 12 ? `${patientName.slice(0, 12)}…` : patientName;

  doc.font("Helvetica").fontSize(8).fillColor("#111827");
  doc.text(formatDate(consultationDate), cols[0].x, y, { width: cols[0].w });
  doc.text(shortProvider, cols[1].x, y, { width: cols[1].w });
  doc.text(shortPatient, cols[2].x, y, { width: cols[2].w });
  doc.text(String(practiceNumber), cols[3].x, y, { width: cols[3].w });
  doc.text(details, cols[4].x, y, { width: cols[4].w });
  doc.text(formatMoney(amount), cols[5].x, y, { width: cols[5].w, align: "right" });
  doc.text(formatMoney(amount), cols[6].x, y, { width: cols[6].w, align: "right" });
  y += 36;

  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#9CA3AF")
    .lineWidth(0.8)
    .stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("TOTAL", leftX + 360, y, { width: 60 });
  doc.text(formatMoney(amount), leftX + 422, y, { width: 95, align: "right" });
  y += 22;

  // Ageing summary
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#374151");
  const ageing = [
    ["DUE PATIENT", formatMoney(0)],
    ["DUE MEDICAL AID", formatMoney(amount)],
    ["CURRENT", formatMoney(amount)],
    ["30 DAYS", formatMoney(0)],
    ["60 DAYS", formatMoney(0)],
    ["90 DAYS", formatMoney(0)],
  ];
  let ax = leftX;
  ageing.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").text(label, ax, y, { width: 78 });
    doc.font("Helvetica").fillColor("#111827").text(value, ax, y + 11, { width: 78 });
    ax += 82;
  });
  y += 40;

  // Contact / practice footer
  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#D1D5DB")
    .lineWidth(0.5)
    .stroke();
  y += 14;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
  doc.text("***PRACTICE DETAILS***", leftX, y);
  y += 14;
  doc.font("Helvetica").fontSize(8);
  doc.text(providerName, leftX, y);
  y += 12;
  if (provider?.email) {
    doc.text(String(provider.email), leftX, y);
    y += 12;
  }
  if (provider?.cellphoneNumber) {
    doc.text(String(provider.cellphoneNumber), leftX, y);
    y += 12;
  }
  if (provider?.settlementCellNumber) {
    doc.text(`Settlement: ${provider.settlementCellNumber}`, leftX, y);
    y += 12;
  }
  doc.text(`REFERENCE: ${patientName}`, leftX, y);
  y += 12;
  doc.text(`Main member: ${mainMember}`, leftX, y);
  y += 12;
  doc.text(
    `Mode: ${
      request.consultationMode === "video_consultation"
        ? "Video consultation"
        : "House visit"
    }`,
    leftX,
    y,
  );

  doc.end();
}

module.exports = {
  streamMedicalAidClaimPdf,
};
