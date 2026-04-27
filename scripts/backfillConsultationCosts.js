require("dotenv").config();
const mongoose = require("mongoose");
const ConsultationRequest = require("../models/request");
const AilmentCategory = require("../models/ailment");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/health_connect_db";

async function backfillConsultationCosts() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to ${MONGO_URI}`);

  const requests = await ConsultationRequest.find({
    $or: [
      { consultationCost: { $exists: false } },
      { consultationCost: null },
      { consultationCost: { $lte: 0 } },
    ],
  }).select("_id ailmentCategoryId consultationMode consultationCost");

  let updated = 0;
  let skipped = 0;

  for (const request of requests) {
    const ailment = await AilmentCategory.findById(request.ailmentCategoryId);
    if (!ailment) {
      console.warn(`Skipped ${request._id}: ailment category not found`);
      skipped += 1;
      continue;
    }

    const selectedCost =
      request.consultationMode === "video_consultation"
        ? ailment.teleconsultationCost
        : ailment.physicalconsultationCost;
    const parsedCost = parseFloat(selectedCost);

    if (Number.isNaN(parsedCost) || parsedCost <= 0) {
      console.warn(`Skipped ${request._id}: invalid category cost`);
      skipped += 1;
      continue;
    }

    request.consultationCost = parsedCost;
    await request.save();
    updated += 1;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

backfillConsultationCosts().catch(async (error) => {
  console.error("Backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
