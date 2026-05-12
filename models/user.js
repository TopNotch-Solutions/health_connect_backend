const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: false,
  },
  cellphoneNumber: {
    type: String,
    required: true,
  },
  email:{
    type: String,
    required: false,
    unique: true,
  },
  password:{
    type: String,
    required: false,
    unique: true,
  },
  dateOfBirth: {
    type: Date,
     required: false,
  },
  hpcnaExpiryDate: {
    type: Date,
     required: false,
  },
  gender:{
    type: String,
    enum: ["Male", "Female"],
    required: false,
  },
  hpcnaNumber: {
    type: String,
    required: false,
  },
  specializations: {
    type: [String],
    required: false,
    default: [],
  },
  yearsOfExperience: {
    type: String,
    required: false,
  },
  address: {
    type: String,
    required: false,
  },
  bio: {
    type: String,
    required: false,
  },
  cityTown: {
    type: String,
    required: false,
  },
  town: {
    type: String,
    required: false,
  },
  nationalId:{
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    enum: ["patient", "doctor", "nurse", "physiotherapist", "social worker", "pharmacist"],
    default: "patient",
    required: true,
  },
   consultations: {
    type: Number,
    required: true,
    default: 0,
  },
  operationalZone: {
    type: String,
    required: false,
  },
  profileImage: {
    type: String,
    required: false,
  },
  finalQualification: {
    type: String,
    required: false,
  },
  HPCNAQualification: {
    type: String,
    required: false,
  },
  idDocumentFront: {
    type: String,
    required: false,
  },
  idDocumentBack: {
    type: String,
    required: false,
  },
  verifiedCellphoneNumber: {
    type: String,
    required: true,
  },
  expoPushToken: {
    type: String,
    required: false,
  },
  isPushNotificationEnabled: {
    type: Boolean,
    required: true,
    default: true,
  },
  visibility: {
    type: String,
    enum: ["Online", "Offline"],
    default: "Offline",
    required: false,
  },
  accountDeactivation: {
    type: Boolean,
    default: false,
  },
  isDocumentVerified: {
    type: Boolean,
    default: false,
    require: false,
  },
    isDocumentsSubmitted: {
    type: Boolean,
    default: false,
    require: false,
  },
  isAccountVerified: {
    type: Boolean,
    default: false,
  },
  dispensingCertificateLicence:{
    type: String,
    require: false
  },
  trainingCertificate:{
    type: String,
    require: false
  },
  NQAEvaluation:{
    type: String,
    require: false
  },

  // ── Pharmacist-specific fields ────────────────────────────────────────────
  registeredTradingName: {
    type: String,
    required: false,
  },
  companyRegistrationNo: {
    type: String,
    required: false,
  },
  businessEmail: {
    type: String,
    required: false,
  },
  pharmacyCouncilNo: {
    type: String,
    required: false,
  },
  practiceNumber: {
    type: String,
    required: false,
  },
  // Upload: Valid Premises Registration Certificate (HPCNA)
  hpcnaCertificate: {
    type: String,
    required: false,
  },
  // GPS coordinates for dispatch
  gpsCoordinates: {
    longitude: { type: Number, required: false },
    latitude:  { type: Number, required: false },
  },
  // Cell number for settlement / prepaid credit payouts
  settlementCellNumber: {
    type: String,
    required: false,
  },
  // Acknowledgement of liability under HPCNA
  hpcnaLicenseExpiryAcknowledged: {
    type: Boolean,
    default: false,
  },

},{
    timestamps: true,
  });

const User = mongoose.model("user", userSchema);
module.exports = User;
