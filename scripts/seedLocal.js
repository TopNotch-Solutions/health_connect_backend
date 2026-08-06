/**
 * Seed a LOCAL development database with the minimum data needed to use the
 * app end-to-end: a portal admin, packages for every provider role, and two
 * app accounts (a verified doctor and a patient).
 *
 * Usage:  node scripts/seedLocal.js
 * Reads MONGO_URI from .env — make sure it points at your LOCAL MongoDB
 * before running. Refuses to run against a non-local URI unless
 * SEED_ALLOW_REMOTE=1 is set, so it cannot accidentally write to production.
 *
 * Idempotent: safe to run repeatedly (upserts by email / role+amount).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/user");
const PortalUser = require("../models/userPortal");
const Package = require("../models/packages");

const MONGO_URI = process.env.MONGO_URI;

const CREDENTIALS = {
  portalAdmin: { email: "admin@local.test", password: "LocalAdmin@123" },
  doctor: { email: "doctor@local.test", password: "LocalDoctor@123" },
  patient: { email: "patient@local.test", password: "LocalPatient@123" },
};

const PACKAGES = [
  // Mirrors the production N$2.00 test package so the wallet flow matches.
  { provider: "doctor", amount: 2, consultations: 1 },
  { provider: "doctor", amount: 50, consultations: 5 },
  { provider: "nurse", amount: 2, consultations: 1 },
  { provider: "physiotherapist", amount: 2, consultations: 1 },
  { provider: "social worker", amount: 2, consultations: 1 },
  { provider: "pharmacist", amount: 2, consultations: 1 },
];

async function main() {
  if (!MONGO_URI) {
    console.error("MONGO_URI is not set in .env — aborting.");
    process.exit(1);
  }

  const isLocal = /127\.0\.0\.1|localhost/.test(MONGO_URI);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
    console.error(
      `MONGO_URI does not look local (${MONGO_URI.replace(/\/\/[^@]*@/, "//***@")}).\n` +
        "Refusing to seed a remote database. Set SEED_ALLOW_REMOTE=1 to override.",
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to", MONGO_URI);

  // ── Portal super admin ─────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(CREDENTIALS.portalAdmin.password, 10);
  await PortalUser.findOneAndUpdate(
    { email: CREDENTIALS.portalAdmin.email },
    {
      $setOnInsert: {
        firstName: "Local",
        lastName: "Admin",
        cellphoneNumber: "0810000000",
        email: CREDENTIALS.portalAdmin.email,
        password: adminHash,
        role: "super admin",
        department: "Engineering",
        addedBy: "seedLocal",
        permissions: { read: true, write: true, delete: true },
      },
    },
    { upsert: true, new: true },
  );
  console.log("Portal admin ready:", CREDENTIALS.portalAdmin.email);

  // ── Packages ───────────────────────────────────────────────────────────────
  for (const pkg of PACKAGES) {
    await Package.findOneAndUpdate(
      { provider: pkg.provider, amount: pkg.amount },
      { $set: pkg },
      { upsert: true },
    );
  }
  console.log(`${PACKAGES.length} packages ready.`);

  // ── App users: verified doctor + patient ──────────────────────────────────
  const doctorHash = await bcrypt.hash(CREDENTIALS.doctor.password, 10);
  await User.findOneAndUpdate(
    { email: CREDENTIALS.doctor.email },
    {
      $setOnInsert: {
        fullname: "Local Doctor",
        cellphoneNumber: "0811111111",
        verifiedCellphoneNumber: "0811111111",
        nationalId: "90010100001",
        email: CREDENTIALS.doctor.email,
        password: doctorHash,
        gender: "Male",
        role: "doctor",
        consultations: 0,
        // Pre-verified so packages can be purchased immediately.
        isDocumentVerified: true,
        isDocumentsSubmitted: true,
      },
    },
    { upsert: true },
  );
  console.log("Verified doctor ready:", CREDENTIALS.doctor.email);

  const patientHash = await bcrypt.hash(CREDENTIALS.patient.password, 10);
  await User.findOneAndUpdate(
    { email: CREDENTIALS.patient.email },
    {
      $setOnInsert: {
        fullname: "Local Patient",
        cellphoneNumber: "0812222222",
        verifiedCellphoneNumber: "0812222222",
        nationalId: "95010100002",
        email: CREDENTIALS.patient.email,
        password: patientHash,
        gender: "Female",
        role: "patient",
        consultations: 0,
      },
    },
    { upsert: true },
  );
  console.log("Patient ready:", CREDENTIALS.patient.email);

  console.log("\nSeed complete. Test credentials:");
  console.table(CREDENTIALS);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
