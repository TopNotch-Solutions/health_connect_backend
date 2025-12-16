const mongoose = require("mongoose");

const advertsSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

const Adverts = mongoose.model("advert", advertsSchema);

module.exports = Adverts;