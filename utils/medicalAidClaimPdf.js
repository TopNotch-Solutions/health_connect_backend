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

/**
 * Build Namibian postal address as separate lines for side-by-side PDF layout.
 * @param {object|null} postal
 * @param {{ includeAddressee?: boolean }} options
 */
function postalAddressLines(postal, { includeAddressee = true } = {}) {
  if (!postal || typeof postal !== "object") return [];

  // Prefer structured fields; fall back to splitting a formatted string.
  if (postal.addressType || postal.boxNumber || postal.bagNumber || postal.premises) {
    const lines = [];
    if (includeAddressee && postal.addressee) {
      lines.push(String(postal.addressee).trim().toUpperCase());
    }
    if (postal.addressType === "po_box" && postal.boxNumber) {
      lines.push(`PO BOX ${String(postal.boxNumber).trim()}`.toUpperCase());
    } else if (postal.addressType === "private_bag" && postal.bagNumber) {
      lines.push(
        `PRIVATE BAG ${String(postal.bagNumber).trim()}`.toUpperCase(),
      );
    } else if (postal.addressType === "street") {
      if (postal.unitOrAdditional) {
        lines.push(String(postal.unitOrAdditional).trim().toUpperCase());
      }
      if (postal.premises) {
        lines.push(String(postal.premises).trim().toUpperCase());
      }
      if (postal.subLocality) {
        lines.push(String(postal.subLocality).trim().toUpperCase());
      }
      if (postal.locality) {
        lines.push(String(postal.locality).trim().toUpperCase());
      }
    }
    if (postal.postOffice) {
      lines.push(String(postal.postOffice).trim().toUpperCase());
    }
    if (postal.postcode) {
      lines.push(String(postal.postcode).trim());
    }
    lines.push(String(postal.country || "NAMIBIA").trim().toUpperCase());
    return lines.filter(Boolean);
  }

  if (postal.formatted) {
    return String(postal.formatted)
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.toUpperCase());
  }

  return [];
}

/** Append cellphone on the same row as the PO Box / Private Bag / street line. */
function withCellphoneOnDeliveryLine(lines, cellphone) {
  const phone = String(cellphone || "").trim();
  if (!phone || !Array.isArray(lines) || lines.length === 0) {
    return lines || [];
  }

  const deliveryIdx = lines.findIndex((line) =>
    /^(PO BOX|PRIVATE BAG|P\.?\s*O\.?\s*BOX)\b/i.test(String(line || "")),
  );
  const idx = deliveryIdx >= 0 ? deliveryIdx : 0;
  const next = [...lines];
  next[idx] = `${next[idx]}    ${phone}`;
  return next;
}

function patientDisplayName(request, patient) {
  return String(
    patient?.fullname || request?.medicalAidDetails?.mainMemberName || "PATIENT",
  ).toUpperCase();
}

/** Read a timeline date from a mongoose doc or plain object. */
function getTimelineDate(request, key) {
  const timeline = request?.timeline;
  if (!timeline || typeof timeline !== "object") return null;
  const raw =
    typeof timeline.get === "function" ? timeline.get(key) : timeline[key];
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ensure claim TIME IN / TIME OUT fields exist on a completed request.
 * Returns true if the document was modified and should be saved.
 */
function ensureConsultationTimelineForClaim(request) {
  if (!request) return false;
  if (!request.timeline) {
    request.timeline = {};
  }

  let changed = false;
  const started = getTimelineDate(request, "consultationStarted");
  const completed = getTimelineDate(request, "consultationCompleted");

  if (!started) {
    const fallback =
      getTimelineDate(request, "callStarted") ||
      getTimelineDate(request, "providerArrived") ||
      getTimelineDate(request, "providerEnRoute") ||
      getTimelineDate(request, "providerAccepted") ||
      (request.createdAt ? new Date(request.createdAt) : null);
    if (fallback) {
      request.timeline.consultationStarted = fallback;
      changed = true;
    }
  }

  if (!completed && request.status === "completed") {
    request.timeline.consultationCompleted =
      (request.updatedAt ? new Date(request.updatedAt) : null) || new Date();
    changed = true;
  }

  if (changed && typeof request.markModified === "function") {
    request.markModified("timeline");
  }
  return changed;
}

function buildLineItem({ request, patient, ailment }, providerName, practiceNumber) {
  const medicalAid = request.medicalAidDetails || {};
  const timeIn = getTimelineDate(request, "consultationStarted");
  const timeOut = getTimelineDate(request, "consultationCompleted");
  const consultationDate =
    timeOut ||
    timeIn ||
    request.updatedAt ||
    request.createdAt;
  const patientName = patientDisplayName(request, patient);
  const icd10 = medicalAid.icd10Code || "—";
  const ailmentTitle = ailment?.title || "Consultation";
  const amount = Number(request.consultationCost || 0);
  const shortProvider =
    providerName.length > 14 ? `${providerName.slice(0, 14)}…` : providerName;
  const shortPatient =
    patientName.length > 12 ? `${patientName.slice(0, 12)}…` : patientName;

  return {
    consultationDate,
    timeIn,
    timeOut,
    patientName,
    patientId: String(patient?._id || patient || ""),
    medicalAidTitle: String(medicalAid.medicalAidTitle || "MEDICAL AID"),
    maf: medicalAid.membershipNumber || "—",
    mainMemberId: patient?.nationalId || medicalAid.membershipNumber || "—",
    patientPhone: String(patient?.cellphoneNumber || "").trim(),
    medicalAid,
    request,
    amount,
    shortProvider,
    shortPatient,
    practiceNumber,
    details: `${ailmentTitle}\nICD10 ${icd10}`,
  };
}

function buildLeftAddressBlock(lineItems, samePatient) {
  if (!samePatient) {
    return ["MULTIPLE PATIENTS"];
  }

  const first = lineItems[0];
  const medicalAid = first.medicalAid || {};
  const request = first.request;
  const patientPostalLines = postalAddressLines(medicalAid.postalAddress, {
    includeAddressee: false,
  });

  return [
    first.patientName,
    ...withCellphoneOnDeliveryLine(
      patientPostalLines.length
        ? patientPostalLines
        : [
            medicalAid.residentialAddress,
            request.address?.route,
            request.address?.locality,
            request.address?.administrative_area_level_1,
            "NAMIBIA",
          ]
            .filter(Boolean)
            .map((line) => String(line).trim().toUpperCase()),
      first.patientPhone,
    ),
  ];
}

/**
 * Build a medical-aid statement PDF similar to a Namibian provider claim statement.
 * Accepts one or many consultations as line items on a single claim PDF.
 * Streams PDF bytes into the Express response.
 *
 * Options:
 * - claims: [{ request, patient, ailment }, ...]  (preferred for batch)
 * - or single: { request, patient, ailment }
 * - provider, bankDetails
 */
function streamMedicalAidClaimPdf(res, options) {
  const { provider, bankDetails } = options;
  const claims = Array.isArray(options.claims)
    ? options.claims
    : options.request
      ? [
          {
            request: options.request,
            patient: options.patient,
            ailment: options.ailment,
          },
        ]
      : [];

  if (!claims.length) {
    throw new Error("At least one consultation is required to build a claim PDF.");
  }

  const providerName = String(provider?.fullname || "PROVIDER").toUpperCase();
  const practiceNumber =
    provider?.practiceNumber || provider?.hpcnaNumber || "—";
  const providerPhone = String(provider?.cellphoneNumber || "").trim();

  const lineItems = claims.map((claim) =>
    buildLineItem(claim, providerName, practiceNumber),
  );

  const samePatient = lineItems.every(
    (item) => item.patientId && item.patientId === lineItems[0].patientId,
  );
  const sameMedicalAid = lineItems.every(
    (item) =>
      item.maf === lineItems[0].maf &&
      item.medicalAidTitle === lineItems[0].medicalAidTitle,
  );

  const leftBlock = buildLeftAddressBlock(lineItems, samePatient);

  const providerPostalLines = postalAddressLines(
    claims[0].request.providerPostalAddress,
    { includeAddressee: false },
  );
  const rightBlock = withCellphoneOnDeliveryLine(
    providerPostalLines.length
      ? providerPostalLines
      : [
          provider?.address,
          provider?.cityTown || provider?.town,
          provider?.region,
          "NAMIBIA",
        ]
          .filter(Boolean)
          .map((line) => String(line).trim().toUpperCase()),
    providerPhone,
  );

  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const referenceName = samePatient
    ? lineItems[0].patientName
    : "MULTIPLE PATIENTS";

  const medicalAidTitle = sameMedicalAid
    ? lineItems[0].medicalAidTitle
    : "VARIOUS";
  const maf = sameMedicalAid ? lineItems[0].maf : "VARIOUS";
  const mainMemberId = samePatient ? lineItems[0].mainMemberId : "VARIOUS";

  const timeIns = lineItems
    .map((item) => item.timeIn)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  const timeOuts = lineItems
    .map((item) => item.timeOut)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  const earliestIn =
    timeIns.length > 0
      ? new Date(Math.min(...timeIns.map((d) => d.getTime())))
      : null;
  const latestOut =
    timeOuts.length > 0
      ? new Date(Math.max(...timeOuts.map((d) => d.getTime())))
      : null;

  const safeFileName =
    claims.length === 1
      ? `${lineItems[0].patientName.replace(/[^a-z0-9]+/gi, "_")}_claim.pdf`
      : `${providerName.replace(/[^a-z0-9]+/gi, "_")}_claims.pdf`;

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
  const pageBottom = 780;
  let y = 40;

  // Header – practice name
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#111827")
    .text(`${providerName} - STATEMENT`, leftX, y, { width: 520 });
  y += 28;

  // Two-column postal block: patient left, provider right (same row)
  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  const addressRows = Math.max(leftBlock.length, rightBlock.length);
  for (let i = 0; i < addressRows; i += 1) {
    const rowY = y + i * 12;
    if (leftBlock[i]) {
      doc.text(leftBlock[i], leftX, rowY, { width: 250, lineBreak: false });
    }
    if (rightBlock[i]) {
      doc.text(rightBlock[i], rightX, rowY, { width: 230, lineBreak: false });
    }
  }
  y += addressRows * 12 + 18;

  // Practice number
  doc.font("Helvetica-Bold").fontSize(9).text("PRACTICE NUMBER:", leftX, y);
  y += 12;
  doc.font("Helvetica").text(String(practiceNumber), leftX, y);
  y += 20;

  // Medical fund reference block
  doc.font("Helvetica-Bold").text("MEDICAL FUND REFERENCE", leftX, y);
  y += 14;

  const refRows = [
    [
      "MEDICAL AID",
      medicalAidTitle.toUpperCase(),
      "TIME IN",
      formatTime(earliestIn),
    ],
    ["MAF", String(maf), "TIME OUT", formatTime(latestOut)],
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

  const drawTableHeader = () => {
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
  };

  drawTableHeader();

  // Line items (one row per selected consultation)
  lineItems.forEach((item) => {
    if (y > pageBottom - 120) {
      doc.addPage();
      y = 40;
      drawTableHeader();
    }

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    doc.text(formatDate(item.consultationDate), cols[0].x, y, {
      width: cols[0].w,
    });
    doc.text(item.shortProvider, cols[1].x, y, { width: cols[1].w });
    doc.text(item.shortPatient, cols[2].x, y, { width: cols[2].w });
    doc.text(String(item.practiceNumber), cols[3].x, y, { width: cols[3].w });
    doc.text(item.details, cols[4].x, y, { width: cols[4].w });
    doc.text(formatMoney(item.amount), cols[5].x, y, {
      width: cols[5].w,
      align: "right",
    });
    doc.text(formatMoney(item.amount), cols[6].x, y, {
      width: cols[6].w,
      align: "right",
    });
    y += 36;
  });

  if (y > pageBottom - 200) {
    doc.addPage();
    y = 40;
  }

  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#9CA3AF")
    .lineWidth(0.8)
    .stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
  doc.text("TOTAL", leftX + 360, y, { width: 60 });
  doc.text(formatMoney(totalAmount), leftX + 422, y, {
    width: 95,
    align: "right",
  });
  y += 22;

  // Ageing summary
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#374151");
  const ageing = [
    ["DUE PATIENT", formatMoney(0)],
    ["DUE MEDICAL AID", formatMoney(totalAmount)],
    ["CURRENT", formatMoney(totalAmount)],
    ["30 DAYS", formatMoney(0)],
    ["60 DAYS", formatMoney(0)],
    ["90 DAYS", formatMoney(0)],
  ];
  let ax = leftX;
  ageing.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").text(label, ax, y, { width: 78 });
    doc.font("Helvetica").fillColor("#111827").text(value, ax, y + 11, {
      width: 78,
    });
    ax += 82;
  });
  y += 40;

  // Practice banking details — directly below the table / ageing summary
  doc
    .moveTo(leftX, y)
    .lineTo(555, y)
    .strokeColor("#D1D5DB")
    .lineWidth(0.5)
    .stroke();
  y += 14;

  const holder = String(
    bankDetails?.accountHolder || providerName || "",
  ).toUpperCase();
  const bank = String(bankDetails?.bankName || "").toUpperCase();
  const branch = String(bankDetails?.branchName || "").toUpperCase();
  const branchCode = String(bankDetails?.branchCode || "");
  const accountNumber = String(bankDetails?.accountNumber || "");
  const accountType = String(bankDetails?.accountType || "").toUpperCase();

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
  doc.text("***PRACTICE BANKING DETAILS***", leftX, y, { lineBreak: false });
  y += 14;
  doc.font("Helvetica").fontSize(8);
  if (holder) {
    doc.text(holder, leftX, y, { lineBreak: false });
    y += 12;
  }
  if (bank) {
    doc.text(bank, leftX, y, { lineBreak: false });
    y += 12;
  }
  doc.text(`BRANCH NAME : ${branch || "—"}`, leftX, y, { lineBreak: false });
  y += 12;
  doc.text(`BRANCH CODE : ${branchCode || "—"}`, leftX, y, { lineBreak: false });
  y += 12;
  doc.text(`ACCOUNT NUMBER : ${accountNumber || "—"}`, leftX, y, {
    lineBreak: false,
  });
  y += 12;
  doc.text(`ACCOUNT TYPE : ${accountType || "—"}`, leftX, y, {
    lineBreak: false,
  });
  y += 12;
  doc.text(`REFERENCE: ${referenceName}`, leftX, y, { lineBreak: false });

  doc.end();
}

module.exports = {
  streamMedicalAidClaimPdf,
  ensureConsultationTimelineForClaim,
  getTimelineDate,
};
