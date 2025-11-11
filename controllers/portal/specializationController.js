const Specialization = require("../../models/specialization");

exports.create = async (req, res) => {
    const {title, description, role} = req.body;

    if (!title) {
      return res
        .status(400)
        .json({ message: "Title is required." });
    }
    if (!description) {
      return res
        .status(400)
        .json({ message: "Description is required." });
    }
    if (!role) {
      return res
        .status(400)
        .json({ message: "Category is required." });
    }
    try {
        const existingSpecialization = await Specialization.findOne({ title });
        if (existingSpecialization) {
          return res
            .status(400)
            .json({ message: "Specialization with this title already exists." });
        }
        const specialization = new Specialization({
            title,
            description,
            role,
        });
        await specialization.save();
        res.status(201).json({ message: "Specialization created successfully", specialization });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};

exports.getAllSpecializations = async (req, res) => {
    try{
    const specializations = await Specialization.find();
    res.status(200).json({ specializations });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getSpecializationById = async (req, res) => {
    const { id } = req.params;
    try {
    const specialization = await Specialization.findById(id);   
    if (!specialization) {
      return res.status(404).json({ message: "Specialization not found." });
    }
    res.status(200).json({ specialization });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.deleteSpecialization = async (req, res) => {
    const { id } = req.params;
    try {
    const specialization = await Specialization.findByIdAndDelete(id);
    if (!specialization) {
      return res.status(404).json({ message: "Specialization not found." });
    }
    res.status(200).json({ message: "Specialization deleted successfully." });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
exports.updateSpecialization = async (req, res) => {
    const { id } = req.params;
    const { title, description, role } = req.body;
    try {
    const specialization = await Specialization.findById(id);
    if (!specialization) {
      return res.status(404).json({ message: "Specialization not found." });
    }
    specialization.title = title || specialization.title;
    specialization.description = description || specialization.description;
    specialization.role = role || specialization.role;
    await specialization.save();
    res.status(200).json({ message: "Specialization updated successfully.", specialization });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
