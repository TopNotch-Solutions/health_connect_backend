const FAQ = require("../../models/faq");

exports.getAllFAQ = async (req, res) => {
    try {
    const faq = await FAQ.find();
    res.status(200).json({ faq });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};