const mongoose = require("mongoose");
const MedicalAid = require("../../models/medicalAid");
const Icd10 = require("../../models/icd10");
const Specialization = require("../../models/specialization");
const User = require("../../models/user");
const ConsultationRequest = require("../../models/request");
const BankDetails = require("../../models/bankDetails");
const {
  streamMedicalAidClaimPdf,
  ensureConsultationTimelineForClaim,
} = require("../../utils/medicalAidClaimPdf");
const { isBankDetailsComplete } = require("../../utils/bankDetailsValidation");

exports.all = async (req, res) => {
  try {
    const items = await MedicalAid.find().sort({ title: 1 }).select("title image");

    return res.status(200).json({
      status: "SUCCESS",
      count: items.length,
      data: items,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

const ACTIVE_MEDICAL_AID_STATUSES = [
  "accepted",
  "payment_pending",
  "paid",
  "provider_confirmation_pending",
  "ready_for_call",
  "in_call",
  "en_route",
  "arrived",
  "in_progress",
];

async function resolveMedicalAidEligibility(providerId) {
  const provider = await User.findById(providerId).select("specializations role");
  if (!provider) {
    return { eligible: false, provider: null };
  }

  const providerTitles = (provider.specializations || [])
    .map((title) => String(title || "").trim())
    .filter(Boolean);

  if (providerTitles.length === 0) {
    return { eligible: false, provider };
  }

  const matchingSpecs = await Specialization.find({
    title: {
      $in: providerTitles.map(
        (title) =>
          new RegExp(
            `^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
      ),
    },
  }).select("_id");

  const specIds = matchingSpecs.map((spec) => spec._id);
  if (specIds.length === 0) {
    return { eligible: false, provider };
  }

  const linkedIcd = await Icd10.exists({
    specializations: { $in: specIds },
  });

  return { eligible: Boolean(linkedIcd), provider };
}

exports.providerStats = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }

    const { eligible, provider } = await resolveMedicalAidEligibility(providerId);
    if (!provider) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Provider not found",
      });
    }

    if (!eligible) {
      return res.status(200).json({
        status: "SUCCESS",
        eligible: false,
        totalMedicalAidConsultations: 0,
        activeMedicalAidConsultations: 0,
        completedMedicalAidConsultations: 0,
        currentMonthMedicalAidConsultations: 0,
        currentMonthMedicalAidEarnings: 0,
        totalMedicalAidEarnings: 0,
      });
    }

    const providerObjectId = new mongoose.Types.ObjectId(providerId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const baseMatch = {
      providerId: providerObjectId,
      paymentMethod: "medical_aid",
    };

    const [
      totalMedicalAidConsultations,
      activeMedicalAidConsultations,
      completedMedicalAidConsultations,
      monthCompleted,
      totalEarningsResult,
    ] = await Promise.all([
      ConsultationRequest.countDocuments({
        ...baseMatch,
        status: { $nin: ["cancelled", "expired", "rejected"] },
      }),
      ConsultationRequest.countDocuments({
        ...baseMatch,
        status: { $in: ACTIVE_MEDICAL_AID_STATUSES },
      }),
      ConsultationRequest.countDocuments({
        ...baseMatch,
        status: "completed",
      }),
      ConsultationRequest.aggregate([
        {
          $match: {
            ...baseMatch,
            status: "completed",
            consultationCost: { $gte: 0 },
            $or: [
              {
                "timeline.consultationCompleted": {
                  $gte: startOfMonth,
                  $lte: endOfMonth,
                },
              },
              {
                "timeline.consultationCompleted": { $exists: false },
                updatedAt: {
                  $gte: startOfMonth,
                  $lte: endOfMonth,
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: "$consultationCost" },
          },
        },
      ]),
      ConsultationRequest.aggregate([
        {
          $match: {
            ...baseMatch,
            status: "completed",
            consultationCost: { $gte: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$consultationCost" },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      status: "SUCCESS",
      eligible: true,
      totalMedicalAidConsultations,
      activeMedicalAidConsultations,
      completedMedicalAidConsultations,
      currentMonthMedicalAidConsultations: monthCompleted[0]?.count || 0,
      currentMonthMedicalAidEarnings: monthCompleted[0]?.totalAmount || 0,
      totalMedicalAidEarnings: totalEarningsResult[0]?.totalAmount || 0,
    });
  } catch (error) {
    console.error("Error fetching medical aid provider stats:", error);
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.providerConsultations = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }

    const { eligible } = await resolveMedicalAidEligibility(providerId);

    const providerObjectId = mongoose.Types.ObjectId.isValid(providerId)
      ? new mongoose.Types.ObjectId(providerId)
      : null;

    if (!providerObjectId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid provider id",
      });
    }

    const statusFilter = String(req.query.status || "all").toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10),
    );
    const skip = (page - 1) * limit;

    // Match medical-aid claims assigned to this provider. Include docs that
    // have medicalAidDetails even if paymentMethod was omitted historically.
    const match = {
      providerId: providerObjectId,
      status: { $nin: ["cancelled", "expired", "rejected"] },
      $or: [
        { paymentMethod: "medical_aid" },
        { "medicalAidDetails.icd10Code": { $exists: true, $nin: [null, ""] } },
        { "medicalAidDetails.medicalAidId": { $exists: true, $ne: null } },
      ],
    };

    if (statusFilter === "completed") {
      match.status = "completed";
      match["medicalAidClaimDownload.archived"] = { $ne: true };
    } else if (statusFilter === "active") {
      match.status = { $in: ACTIVE_MEDICAL_AID_STATUSES };
      match["medicalAidClaimDownload.archived"] = { $ne: true };
    } else if (statusFilter === "archived") {
      match.status = "completed";
      match["medicalAidClaimDownload.claimed"] = true;
      match["medicalAidClaimDownload.archived"] = true;
    } else {
      // "all" — hide archived claimed consultations from the main list
      match["medicalAidClaimDownload.archived"] = { $ne: true };
    }

    const total = await ConsultationRequest.countDocuments(match);

    // Unclaimed / not-downloaded first, then newest activity.
    const consultations = await ConsultationRequest.find(match)
      .populate(
        "patientId",
        "fullname cellphoneNumber nationalId profileImage dateOfBirth",
      )
      .populate("ailmentCategoryId", "title")
      .sort({
        "medicalAidClaimDownload.claimed": 1,
        "medicalAidClaimDownload.downloaded": 1,
        updatedAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      status: "SUCCESS",
      eligible,
      count: consultations.length,
      total,
      data: consultations,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPages,
        totalItems: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching medical aid consultations:", error);
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

const CLAIM_POPULATE = [
  {
    path: "patientId",
    select: "fullname cellphoneNumber nationalId email dateOfBirth address",
  },
  { path: "ailmentCategoryId", select: "title" },
  {
    path: "providerId",
    select:
      "fullname cellphoneNumber email address cityTown town region practiceNumber hpcnaNumber settlementCellNumber",
  },
];

function markRequestDownloaded(request, providerId) {
  const previous = request.medicalAidClaimDownload || {};
  const previousCount = Number(previous.downloadCount || 0);
  request.medicalAidClaimDownload = {
    ...(previous.toObject?.() || previous),
    downloaded: true,
    downloadedAt: new Date(),
    downloadCount: previousCount + 1,
    lastDownloadedBy: providerId,
    claimed: Boolean(previous.claimed),
    claimedAt: previous.claimedAt || undefined,
    claimedBy: previous.claimedBy || undefined,
    archived: Boolean(previous.archived),
    archivedAt: previous.archivedAt || undefined,
    archivedBy: previous.archivedBy || undefined,
  };
  return request;
}

function assertOwnedMedicalAidClaim(request, providerId) {
  if (!request) {
    return { status: 404, message: "Consultation not found" };
  }
  if (String(request.providerId) !== String(providerId)) {
    return {
      status: 403,
      message: "You are not allowed to update this claim",
    };
  }
  if (request.paymentMethod !== "medical_aid") {
    return {
      status: 400,
      message: "This consultation is not a medical aid claim",
    };
  }
  return null;
}

function validateClaimForDownload(request, providerId) {
  if (!request) {
    return { status: 404, message: "Consultation not found" };
  }
  if (String(request.providerId?._id || request.providerId) !== String(providerId)) {
    return { status: 403, message: "You are not allowed to download this claim" };
  }
  if (request.paymentMethod !== "medical_aid") {
    return { status: 400, message: "This consultation is not a medical aid claim" };
  }
  if (request.status !== "completed") {
    return {
      status: 400,
      message:
        "Claims can only be downloaded after the consultation is completed.",
    };
  }
  if (request.medicalAidClaimDownload?.claimed) {
    return {
      status: 400,
      message:
        "This claim has already been marked as claimed and can no longer be downloaded.",
    };
  }
  return null;
}

exports.downloadClaimPdf = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    const requestId = req.params.id;

    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid consultation id",
      });
    }

    const request = await ConsultationRequest.findById(requestId).populate(
      CLAIM_POPULATE,
    );

    const validationError = validateClaimForDownload(request, providerId);
    if (validationError) {
      return res.status(validationError.status).json({
        status: "FAILURE",
        message: validationError.message,
      });
    }

    const bankDetails = await BankDetails.findOne({ userId: providerId });
    if (!isBankDetailsComplete(bankDetails)) {
      return res.status(400).json({
        status: "FAILURE",
        code: "BANK_DETAILS_REQUIRED",
        message:
          "Please complete your practice bank details before downloading a medical aid claim.",
      });
    }

    const provider =
      request.providerId && typeof request.providerId === "object"
        ? request.providerId
        : await User.findById(providerId).select(
            "fullname cellphoneNumber email address cityTown town region practiceNumber hpcnaNumber settlementCellNumber",
          );

    ensureConsultationTimelineForClaim(request);
    markRequestDownloaded(request, providerId);
    await request.save();

    res.setHeader("X-Claim-Downloaded", "true");
    res.setHeader(
      "X-Claim-Download-Count",
      String(request.medicalAidClaimDownload.downloadCount),
    );
    if (request.medicalAidClaimDownload.downloadedAt) {
      res.setHeader(
        "X-Claim-Downloaded-At",
        new Date(request.medicalAidClaimDownload.downloadedAt).toISOString(),
      );
    }

    await streamMedicalAidClaimPdf(res, {
      claims: [
        {
          request,
          patient: request.patientId,
          ailment: request.ailmentCategoryId,
        },
      ],
      provider,
      bankDetails,
    });
  } catch (error) {
    console.error("Error generating medical aid claim PDF:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        status: "ERROR",
        message: error.message,
      });
    }
    res.end();
  }
};

/**
 * Download multiple consultations as a single combined claim PDF
 * (one statement with multiple line items).
 * Body: { ids: string[] }
 */
exports.downloadClaimPdfsBatch = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }

    const ids = [
      ...new Set(
        rawIds
          .map((id) => String(id || "").trim())
          .filter((id) => mongoose.Types.ObjectId.isValid(id)),
      ),
    ];

    if (!ids.length) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Select at least one valid consultation id",
      });
    }

    const bankDetails = await BankDetails.findOne({ userId: providerId });
    if (!isBankDetailsComplete(bankDetails)) {
      return res.status(400).json({
        status: "FAILURE",
        code: "BANK_DETAILS_REQUIRED",
        message:
          "Please complete your practice bank details before downloading a medical aid claim.",
      });
    }

    const requests = await ConsultationRequest.find({
      _id: { $in: ids },
    }).populate(CLAIM_POPULATE);

    const byId = new Map(requests.map((r) => [String(r._id), r]));
    const ordered = [];
    const failures = [];

    for (const id of ids) {
      const request = byId.get(id);
      const validationError = validateClaimForDownload(request, providerId);
      if (validationError) {
        failures.push({ id, message: validationError.message });
        continue;
      }
      ordered.push(request);
    }

    if (!ordered.length) {
      return res.status(400).json({
        status: "FAILURE",
        message:
          failures[0]?.message ||
          "None of the selected consultations can be downloaded.",
        failures,
      });
    }

    const provider =
      ordered[0].providerId && typeof ordered[0].providerId === "object"
        ? ordered[0].providerId
        : await User.findById(providerId).select(
            "fullname cellphoneNumber email address cityTown town region practiceNumber hpcnaNumber settlementCellNumber",
          );

    for (const request of ordered) {
      ensureConsultationTimelineForClaim(request);
      markRequestDownloaded(request, providerId);
      await request.save();
    }

    res.setHeader("X-Claim-Downloaded", "true");
    res.setHeader("X-Claim-Download-Count", String(ordered.length));
    res.setHeader(
      "X-Claim-Downloaded-Ids",
      ordered.map((r) => String(r._id)).join(","),
    );

    await streamMedicalAidClaimPdf(res, {
      claims: ordered.map((request) => ({
        request,
        patient: request.patientId,
        ailment: request.ailmentCategoryId,
      })),
      provider,
      bankDetails,
    });
  } catch (error) {
    console.error("Error generating batch medical aid claim PDF:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        status: "ERROR",
        message: error.message,
      });
    }
    res.end();
  }
};

exports.markClaimed = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    const requestId = req.params.id;

    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid consultation id",
      });
    }

    const request = await ConsultationRequest.findById(requestId);
    const ownershipError = assertOwnedMedicalAidClaim(request, providerId);
    if (ownershipError) {
      return res.status(ownershipError.status).json({
        status: "FAILURE",
        message: ownershipError.message,
      });
    }

    if (request.status !== "completed") {
      return res.status(400).json({
        status: "FAILURE",
        message: "Only completed consultations can be marked as claimed.",
      });
    }

    if (request.medicalAidClaimDownload?.claimed) {
      return res.status(200).json({
        status: "SUCCESS",
        message: "Claim was already marked as claimed.",
        data: {
          _id: request._id,
          medicalAidClaimDownload: request.medicalAidClaimDownload,
        },
      });
    }

    const previous = request.medicalAidClaimDownload || {};
    request.medicalAidClaimDownload = {
      ...(previous.toObject?.() || previous),
      downloaded: Boolean(previous.downloaded),
      downloadedAt: previous.downloadedAt || undefined,
      downloadCount: Number(previous.downloadCount || 0),
      lastDownloadedBy: previous.lastDownloadedBy || undefined,
      claimed: true,
      claimedAt: new Date(),
      claimedBy: providerId,
      archived: Boolean(previous.archived),
      archivedAt: previous.archivedAt || undefined,
      archivedBy: previous.archivedBy || undefined,
    };
    await request.save();

    return res.status(200).json({
      status: "SUCCESS",
      message: "Claim marked as claimed.",
      data: {
        _id: request._id,
        medicalAidClaimDownload: request.medicalAidClaimDownload,
      },
    });
  } catch (error) {
    console.error("Error marking medical aid claim as claimed:", error);
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.archiveClaimed = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    const requestId = req.params.id;

    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid consultation id",
      });
    }

    const request = await ConsultationRequest.findById(requestId);
    const ownershipError = assertOwnedMedicalAidClaim(request, providerId);
    if (ownershipError) {
      return res.status(ownershipError.status).json({
        status: "FAILURE",
        message: ownershipError.message,
      });
    }

    if (!request.medicalAidClaimDownload?.claimed) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Only claimed consultations can be archived.",
      });
    }

    if (request.medicalAidClaimDownload?.archived) {
      return res.status(200).json({
        status: "SUCCESS",
        message: "Consultation was already archived.",
        data: {
          _id: request._id,
          medicalAidClaimDownload: request.medicalAidClaimDownload,
        },
      });
    }

    const previous = request.medicalAidClaimDownload || {};
    request.medicalAidClaimDownload = {
      ...(previous.toObject?.() || previous),
      archived: true,
      archivedAt: new Date(),
      archivedBy: providerId,
    };
    await request.save();

    return res.status(200).json({
      status: "SUCCESS",
      message: "Consultation archived.",
      data: {
        _id: request._id,
        medicalAidClaimDownload: request.medicalAidClaimDownload,
      },
    });
  } catch (error) {
    console.error("Error archiving medical aid consultation:", error);
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.unarchiveClaimed = async (req, res) => {
  try {
    const providerId = req.user?.id || req.user?._id;
    const requestId = req.params.id;

    if (!providerId) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User id is required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid consultation id",
      });
    }

    const request = await ConsultationRequest.findById(requestId);
    const ownershipError = assertOwnedMedicalAidClaim(request, providerId);
    if (ownershipError) {
      return res.status(ownershipError.status).json({
        status: "FAILURE",
        message: ownershipError.message,
      });
    }

    if (!request.medicalAidClaimDownload?.archived) {
      return res.status(200).json({
        status: "SUCCESS",
        message: "Consultation was not archived.",
        data: {
          _id: request._id,
          medicalAidClaimDownload: request.medicalAidClaimDownload,
        },
      });
    }

    const previous = request.medicalAidClaimDownload || {};
    const next = {
      ...(previous.toObject?.() || previous),
      archived: false,
    };
    delete next.archivedAt;
    delete next.archivedBy;
    request.medicalAidClaimDownload = next;
    request.markModified("medicalAidClaimDownload");
    await request.save();

    return res.status(200).json({
      status: "SUCCESS",
      message: "Consultation unarchived.",
      data: {
        _id: request._id,
        medicalAidClaimDownload: request.medicalAidClaimDownload,
      },
    });
  } catch (error) {
    console.error("Error unarchiving medical aid consultation:", error);
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
