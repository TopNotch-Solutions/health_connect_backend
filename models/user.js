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
  walletID: {
    type: String,
    required: true,
    unique: true,
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
    enum: ["Male", "Female", "Other"],
    required: false,
  },
  nationalID: {
    type: String,
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
  balance: {
    type: Number,
    required: true,
    default: 0.00,
  },
  PreviousBalance: {
    type: Number,
    required: true,
    default: 0.00,
  },
  address: {
    type: String,
    required: false,
  },
  cityTown: {
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
    enum: ["patient", "doctor", "nurse", "physiotherapist", "social worker:"],
    default: "patient",
    required: true,
  },
  
  operationalZone: {
    type: String,
    required: false,
  },
  profileImage: {
    type: String,
    required: false,
  },
  primaryQualification: {
    type: String,
    required: false,
  },
  annualQualification: {
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
});

const User = mongoose.model("user", userSchema);
module.exports = User;