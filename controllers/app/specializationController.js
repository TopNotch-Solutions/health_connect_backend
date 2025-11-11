const Specialization = require("../../models/specialization");

exports.getAllSpecializations = async (req, res) => {
    try {
    const specializations = await Specialization.find();
    res.status(200).json({ specializations });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};