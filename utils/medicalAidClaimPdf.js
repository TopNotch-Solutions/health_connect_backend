const PDFDocument = require("pdfkit");

/** Namibia local timezone for claim DATE / TIME IN / TIME OUT */
const CLAIM_TIME_ZONE = "Africa/Windhoek";

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
  // Namibia calendar date (Africa/Windhoek)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLAIM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const dd = parts.find((p) => p.type === "day")?.value || "—";
  const mm = parts.find((p) => p.type === "month")?.value || "—";
  const yyyy = parts.find((p) => p.type === "year")?.value || "—";
  return `${dd}.${mm}.${yyyy}`;
}

function formatTime(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  // Namibia local time so claim TIME IN / TIME OUT match the app
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CLAIM_TIME_ZONE,
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

/** Coerce a stored date value to a valid Date, or null. */
function asValidDate(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read a nested field from a mongoose doc / subdoc / plain object. */
function readNestedField(container, key) {
  if (!container || typeof container !== "object") return null;

  // Prefer bracket access. Nested Mongoose subdocuments expose Document.get(),
  // but subdoc.get(key) often returns undefined even when subdoc[key] is set.
  let raw = container[key];

  if (raw == null && container._doc && container._doc[key] != null) {
    const nestedLooksLikeParent =
      container._doc.timeline != null || container._doc._id != null;
    if (!nestedLooksLikeParent) {
      raw = container._doc[key];
    }
  }

  return raw != null && raw !== "" ? raw : null;
}

/** Read a timeline date from a mongoose doc or plain object. */
function getTimelineDate(request, key) {
  const timeline = request?.timeline;
  let raw = readNestedField(timeline, key);

  if (raw == null && typeof request?.toObject === "function") {
    raw = request.toObject({ depopulate: true })?.timeline?.[key];
  }

  return asValidDate(raw);
}

/** consultationDetails.startTime / endTime (legacy / parallel stamps). */
function getConsultationDetailsDate(request, key) {
  const details = request?.consultationDetails;
  let raw = readNestedField(details, key);
  if (raw == null && typeof request?.toObject === "function") {
    raw = request.toObject({ depopulate: true })?.consultationDetails?.[key];
  }
  return asValidDate(raw);
}

/**
 * Resolve claim TIME IN / TIME OUT from timeline, then consultationDetails.
 */
function resolveClaimTimes(request) {
  const timeIn =
    getTimelineDate(request, "consultationStarted") ||
    getConsultationDetailsDate(request, "startTime") ||
    getTimelineDate(request, "callStarted") ||
    getTimelineDate(request, "providerArrived") ||
    getTimelineDate(request, "providerEnRoute") ||
    getTimelineDate(request, "providerAccepted") ||
    asValidDate(request?.createdAt);

  let timeOut =
    getTimelineDate(request, "consultationCompleted") ||
    getConsultationDetailsDate(request, "endTime") ||
    (request?.status === "completed"
      ? asValidDate(request?.updatedAt) || new Date()
      : null);

  if (timeIn && timeOut && timeOut.getTime() < timeIn.getTime()) {
    timeOut = timeIn;
  }

  return { timeIn: timeIn || null, timeOut: timeOut || null };
}

/**
 * Ensure claim TIME IN / TIME OUT exist from consultation start & completed.
 * TIME IN  = timeline.consultationStarted (when consultation began)
 * TIME OUT = timeline.consultationCompleted (when consultation ended)
 * Returns true if the document was modified and should be saved.
 */
function ensureConsultationTimelineForClaim(request) {
  if (!request) return false;
  if (!request.timeline) {
    request.timeline = {};
  }

  let changed = false;
  const { timeIn, timeOut } = resolveClaimTimes(request);

  if (!getTimelineDate(request, "consultationStarted") && timeIn) {
    request.timeline.consultationStarted = timeIn;
    changed = true;
  }

  if (
    !getTimelineDate(request, "consultationCompleted") &&
    timeOut &&
    request.status === "completed"
  ) {
    request.timeline.consultationCompleted = timeOut;
    changed = true;
  }

  // TIME OUT must not be earlier than TIME IN
  const started = getTimelineDate(request, "consultationStarted");
  const completed = getTimelineDate(request, "consultationCompleted");
  if (started && completed && completed.getTime() < started.getTime()) {
    request.timeline.consultationCompleted = started;
    changed = true;
  }

  if (changed && typeof request.markModified === "function") {
    request.markModified("timeline");
  }
  return changed;
}

const PORTAL_ICD_SELECT =
  "MAF ICD_10_code price secondaryICD_10_code secondaryMAF secondaryPrice alignments";

/**
 * Load portal ICD-10 records for each claim (NAMAF, codes, prices).
 * Portal MAF/NAMAF feeds the BHF/NAMAF table column; claim header "MAF"
 * uses the patient medical aid number (membershipNumber). secondaryMAF
 * applies to the second ICD-10 line when present.
 */
async function resolvePortalIcdForClaims(claims) {
  const Icd10 = require("../models/icd10");
  const portalByRequestId = new Map();

  const icdIds = [];
  const ailmentIds = [];

  for (const claim of claims) {
    const medicalAid = claim.request?.medicalAidDetails || {};
    if (medicalAid.icd10Id) {
      icdIds.push(String(medicalAid.icd10Id));
      continue;
    }
    const ailmentId =
      claim.request?.ailmentCategoryId?._id ||
      claim.request?.ailmentCategoryId ||
      claim.ailment?._id ||
      claim.ailment;
    if (ailmentId) {
      ailmentIds.push(String(ailmentId));
    }
  }

  const uniqueIcdIds = [...new Set(icdIds)];
  const byIcdId = new Map();
  if (uniqueIcdIds.length) {
    const icds = await Icd10.find({ _id: { $in: uniqueIcdIds } })
      .select(PORTAL_ICD_SELECT)
      .lean();
    for (const icd of icds) {
      byIcdId.set(String(icd._id), icd);
    }
  }

  const uniqueAilmentIds = [...new Set(ailmentIds)];
  const byAlignment = new Map();
  if (uniqueAilmentIds.length) {
    const aligned = await Icd10.find({
      alignments: { $in: uniqueAilmentIds },
    })
      .select(PORTAL_ICD_SELECT)
      .lean();
    for (const icd of aligned) {
      for (const alignmentId of icd.alignments || []) {
        const key = String(alignmentId);
        if (!byAlignment.has(key)) {
          byAlignment.set(key, icd);
        }
      }
    }
  }

  for (const claim of claims) {
    const request = claim.request;
    if (!request?._id) continue;

    const medicalAid = request.medicalAidDetails || {};
    let portal = null;

    if (medicalAid.icd10Id) {
      portal = byIcdId.get(String(medicalAid.icd10Id)) || null;
    }
    if (!portal) {
      const ailmentId =
        request.ailmentCategoryId?._id ||
        request.ailmentCategoryId ||
        claim.ailment?._id ||
        claim.ailment;
      if (ailmentId) {
        portal = byAlignment.get(String(ailmentId)) || null;
      }
    }

    const portalMaf = portal?.MAF ? String(portal.MAF).trim() : "";
    const maf =
      portalMaf ||
      (medicalAid.maf ? String(medicalAid.maf).trim() : "") ||
      (medicalAid.membershipNumber
        ? String(medicalAid.membershipNumber).trim()
        : "") ||
      (portal?.ICD_10_code ? String(portal.ICD_10_code).trim() : "") ||
      (medicalAid.icd10Code ? String(medicalAid.icd10Code).trim() : "") ||
      "—";

    const portalSecondaryMaf = portal?.secondaryMAF
      ? String(portal.secondaryMAF).trim()
      : "";
    const secondaryMaf =
      portalSecondaryMaf ||
      (medicalAid.secondaryMaf ? String(medicalAid.secondaryMaf).trim() : "") ||
      "";

    portalByRequestId.set(String(request._id), {
      portal,
      maf,
      secondaryMaf,
    });
  }

  return portalByRequestId;
}

function buildLineItemBase(
  { request, patient, ailment },
  providerName,
  practiceNumber,
  portalMaf,
) {
  // Always resolve TIME IN / TIME OUT from captured consultation times
  ensureConsultationTimelineForClaim(request);

  const medicalAid = request.medicalAidDetails || {};
  const { timeIn, timeOut } = resolveClaimTimes(request);
  const consultationDate =
    timeOut ||
    timeIn ||
    request.updatedAt ||
    request.createdAt;
  const patientName = patientDisplayName(request, patient);
  const ailmentTitle = ailment?.title || "Consultation";

  const membershipNumber = medicalAid.membershipNumber
    ? String(medicalAid.membershipNumber).trim()
    : "";
  const providedMainMemberId = medicalAid.mainMemberId
    ? String(medicalAid.mainMemberId).trim()
    : "";

  return {
    consultationDate,
    timeIn,
    timeOut,
    patientName,
    patientId: String(patient?._id || patient || ""),
    medicalAidTitle: String(medicalAid.medicalAidTitle || "MEDICAL AID"),
    // Header MAF = medical aid / membership number from the request form
    membershipNumber: membershipNumber || "—",
    // BHF/NAMAF column uses portal NAMAF (passed in as portalMaf)
    maf: portalMaf || medicalAid.maf || "—",
    // MAIN MEMBER ID = main member ID entered on the request form
    mainMemberId:
      providedMainMemberId ||
      // Legacy claims before mainMemberId was collected
      (patient?.nationalId ? String(patient.nationalId).trim() : "") ||
      "—",
    patientPhone: String(patient?.cellphoneNumber || "").trim(),
    medicalAid,
    request,
    providerName,
    practiceNumber,
    ailmentTitle,
  };
}

function finitePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Resolve primary/secondary ICD codes, MAFs, and prices for a claim row.
 * Prefer values snapshotted on the request; fall back to the portal ICD record.
 */
function resolveIcdLinesForClaim(medicalAid, portal, portalInfo) {
  const primaryCode =
    (medicalAid.icd10Code && String(medicalAid.icd10Code).trim()) ||
    (portal?.ICD_10_code && String(portal.ICD_10_code).trim()) ||
    "";

  const secondaryCode =
    (medicalAid.secondaryIcd10Code &&
      String(medicalAid.secondaryIcd10Code).trim()) ||
    (portal?.secondaryICD_10_code &&
      String(portal.secondaryICD_10_code).trim()) ||
    "";

  const primaryPrice =
    finitePrice(medicalAid.icd10Price) ?? finitePrice(portal?.price);

  const secondaryPrice =
    finitePrice(medicalAid.secondaryIcd10Price) ??
    finitePrice(portal?.secondaryPrice);

  const primaryMaf = portalInfo?.maf || "";
  const secondaryMaf =
    (portalInfo?.secondaryMaf && String(portalInfo.secondaryMaf).trim()) ||
    (medicalAid.secondaryMaf && String(medicalAid.secondaryMaf).trim()) ||
    (portal?.secondaryMAF && String(portal.secondaryMAF).trim()) ||
    "";

  return {
    primaryCode,
    secondaryCode,
    primaryPrice,
    secondaryPrice,
    primaryMaf,
    secondaryMaf,
  };
}

/**
 * Build one or two claim rows for a consultation.
 * When a second ICD-10 + price exists, they are stacked underneath each other
 * with their own amounts and MAF; the PDF TOTAL is the sum of all rows.
 */
function buildLineItemsForClaim(
  claim,
  providerName,
  practiceNumber,
  portalInfo,
) {
  const portalMaf = portalInfo?.maf;
  const portal = portalInfo?.portal || null;
  const base = buildLineItemBase(
    claim,
    providerName,
    practiceNumber,
    portalMaf,
  );
  const medicalAid = base.medicalAid || {};
  const {
    primaryCode,
    secondaryCode,
    primaryPrice,
    secondaryPrice,
    primaryMaf,
    secondaryMaf,
  } = resolveIcdLinesForClaim(medicalAid, portal, portalInfo);

  const consultationTotal = Number(
    claim.request?.consultationCost || claim.request?.estimatedCost || 0,
  );

  if (
    primaryCode &&
    secondaryCode &&
    primaryPrice != null &&
    secondaryPrice != null
  ) {
    const secondaryLineMaf = secondaryMaf || primaryMaf;
    return [
      {
        ...base,
        maf: primaryMaf || base.maf,
        amount: primaryPrice,
        details: `${base.ailmentTitle}\nICD10 ${primaryCode}`,
        isSecondaryIcdLine: false,
      },
      {
        ...base,
        maf: secondaryLineMaf || base.maf,
        amount: secondaryPrice,
        // Stacked under the primary row — ICD + price; NAMAF goes in BHF/NAMAF
        details: `ICD10 ${secondaryCode}`,
        isSecondaryIcdLine: true,
      },
    ];
  }

  return [
    {
      ...base,
      amount: Number.isFinite(consultationTotal)
        ? consultationTotal
        : primaryPrice ?? 0,
      details: `${base.ailmentTitle}\nICD10 ${primaryCode || "—"}`,
      isSecondaryIcdLine: false,
    },
  ];
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
async function streamMedicalAidClaimPdf(res, options) {
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

  const portalIcds = await resolvePortalIcdForClaims(claims);
  const lineItems = claims.flatMap((claim) =>
    buildLineItemsForClaim(
      claim,
      providerName,
      practiceNumber,
      portalIcds.get(String(claim.request?._id)),
    ),
  );

  const samePatient = lineItems.every(
    (item) => item.patientId && item.patientId === lineItems[0].patientId,
  );
  const sameMedicalAidTitle = lineItems.every(
    (item) => item.medicalAidTitle === lineItems[0].medicalAidTitle,
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

  const medicalAidTitle = sameMedicalAidTitle
    ? lineItems[0].medicalAidTitle
    : "VARIOUS";
  // Header "MAF" = membership / medical aid number from the request.
  // BHF/NAMAF table column still uses portal NAMAF codes per ICD line.
  const uniqueMemberNumbers = [
    ...new Set(
      lineItems
        .map((item) => {
          const fromItem =
            item.membershipNumber && String(item.membershipNumber).trim() !== "—"
              ? String(item.membershipNumber).trim()
              : "";
          if (fromItem) return fromItem;
          const fromDetails = item.medicalAid?.membershipNumber
            ? String(item.medicalAid.membershipNumber).trim()
            : "";
          return fromDetails && fromDetails !== "—" ? fromDetails : "";
        })
        .filter(Boolean),
    ),
  ];
  const maf =
    uniqueMemberNumbers.length === 0
      ? "—"
      : uniqueMemberNumbers.length === 1
        ? uniqueMemberNumbers[0]
        : uniqueMemberNumbers.join(" / ");

  const uniqueMainMemberIds = [
    ...new Set(
      lineItems
        .map((item) => {
          const fromItem =
            item.mainMemberId && String(item.mainMemberId).trim() !== "—"
              ? String(item.mainMemberId).trim()
              : "";
          if (fromItem) return fromItem;
          const fromDetails = item.medicalAid?.mainMemberId
            ? String(item.medicalAid.mainMemberId).trim()
            : "";
          return fromDetails || "";
        })
        .filter(Boolean),
    ),
  ];
  const mainMemberId =
    uniqueMainMemberIds.length === 0
      ? "—"
      : uniqueMainMemberIds.length === 1
        ? uniqueMainMemberIds[0]
        : uniqueMainMemberIds.join(" / ");

  // Header TIME IN / TIME OUT = consultation started / completed
  // (earliest start and latest end when the PDF batches multiple claims)
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
    bufferPages: true,
    info: {
      Title: `${providerName} - Statement`,
      Author: providerName,
      Subject: "Medical Aid Consultation Statement",
    },
  });

  doc.pipe(res);

  const stampClaimFooter = () => {
    const footerY = doc.page.height - 32;
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#6B7280")
      .text("Conducted through Health Connect Namibia", 40, footerY, {
        width: doc.page.width - 80,
        align: "right",
        lineBreak: false,
      });
  };

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

  // Line items — dual ICD consultations stack as two rows (code + price), then TOTAL
  lineItems.forEach((item) => {
    if (y > pageBottom - 120) {
      doc.addPage();
      y = 40;
      drawTableHeader();
    }

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    const rowStartY = y;
    const isContinuation = Boolean(item.isSecondaryIcdLine);
    const dateText = isContinuation ? "" : formatDate(item.consultationDate);
    const providerText = isContinuation ? "" : item.providerName;
    const patientText = isContinuation ? "" : item.patientName;
    // BHF/NAMAF column shows the portal NAMAF code for that ICD line
    const namafText =
      item.maf && String(item.maf).trim() && String(item.maf).trim() !== "—"
        ? String(item.maf).trim()
        : "";

    const cellHeights = [
      dateText ? doc.heightOfString(dateText, { width: cols[0].w }) : 0,
      providerText ? doc.heightOfString(providerText, { width: cols[1].w }) : 0,
      patientText ? doc.heightOfString(patientText, { width: cols[2].w }) : 0,
      namafText ? doc.heightOfString(namafText, { width: cols[3].w }) : 0,
      doc.heightOfString(item.details, { width: cols[4].w }),
      doc.heightOfString(formatMoney(item.amount), { width: cols[5].w }),
      doc.heightOfString(formatMoney(item.amount), { width: cols[6].w }),
    ];
    const rowHeight = Math.max(isContinuation ? 18 : 24, ...cellHeights) + 8;

    if (dateText) {
      doc.text(dateText, cols[0].x, rowStartY, { width: cols[0].w });
    }
    if (providerText) {
      doc.text(providerText, cols[1].x, rowStartY, { width: cols[1].w });
    }
    if (patientText) {
      doc.text(patientText, cols[2].x, rowStartY, { width: cols[2].w });
    }
    if (namafText) {
      doc.text(namafText, cols[3].x, rowStartY, { width: cols[3].w });
    }
    doc.text(item.details, cols[4].x, rowStartY, { width: cols[4].w });
    doc.text(formatMoney(item.amount), cols[5].x, rowStartY, {
      width: cols[5].w,
      align: "right",
    });
    doc.text(formatMoney(item.amount), cols[6].x, rowStartY, {
      width: cols[6].w,
      align: "right",
    });
    y = rowStartY + rowHeight;
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

  // Stamp production footer on every page (bottom-right)
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    stampClaimFooter();
  }

  doc.end();
}

module.exports = {
  streamMedicalAidClaimPdf,
  ensureConsultationTimelineForClaim,
  getTimelineDate,
};
