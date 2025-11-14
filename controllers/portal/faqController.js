const FAQ = require("../../models/faq");

exports.create = async (req, res) => {
    const {question, answer} = req.body;

    if (!question) {
      return res
        .status(400)
        .json({ message: "Question is required." });
    }
    if (!answer) {
      return res
        .status(400)
        .json({ message: "Answer is required." });
    }

    try {
        const existing = await FAQ.findOne({ question });
        if (existing) {
          return res
            .status(400)
            .json({ message: "FAQ with this question already exists." });
        }
        const faq = new FAQ({
            question,
            answer,
        });
        await faq.save();
        res.status(201).json({ message: "FAQ created successfully", faq });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};

exports.getAllFAQ = async (req, res) => {
    try{
    const faqs = await FAQ.find();
    res.status(200).json({ faqs });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getFAQById = async (req, res) => {
    const { id } = req.params;
    try {
    const faq = await FAQ.findById(id);   
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found." });
    }
    res.status(200).json({ faq });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.deleteFAQ = async (req, res) => {
    const { id } = req.params;
    try {
    const faq = await FAQ.findByIdAndDelete(id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found." });
    }
    res.status(200).json({ message: "FAQ deleted successfully." });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
exports.updateFAQ = async (req, res) => {
    const { id } = req.params;
    const { question, answer } = req.body;
    if (!question) {
      return res
        .status(400)
        .json({ message: "Question is required." });
    }
    if (!answer) {
      return res
        .status(400)
        .json({ message: "Answer is required." });
    }
    try {
    const faq = await FAQ.findById(id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found." });
    }
    faq.question = question || faq.question;
    faq.answer = answer || faq.answer;
    await faq.save();
    res.status(200).json({ message: "Specialization updated successfully.", faq });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
