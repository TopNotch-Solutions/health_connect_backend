const Adverts = require("../../models/adverts");

exports.getAllAdverts = async (req, res) => {
    try {
    const adverts = await Adverts.find();
    res.status(200).json({ adverts });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};