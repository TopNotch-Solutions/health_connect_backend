const mongoose = require("mongoose");
const userPortalSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
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
  },
  role: {
    type: String,
    enum: ["super admin", "health provider", "admin"],
    default: "admin",
    required: true,
  },
  profileImage: {
    type: String,
    required: false,
  },
  department: {
    type: String,
    required: true,
  },
  addedBy: {
    type: String,
    required: false,
  },
  permissions: {
    read: {
      type: Boolean,
      default: true,
      required: true,
    },
    write: {
      type: Boolean,
      default: false,
      required: true,
    },
    delete: {
      type: Boolean,
      default: false,
      required: true,
    },
  }
},{
    timestamps: true,
  });

const PortalUser = mongoose.model("user_portal", userPortalSchema);
module.exports = PortalUser;