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
    // Ensure role is an array - convert single value to array if needed
    let roleArray = role;
    if (!roleArray) {
      return res
        .status(400)
        .json({ message: "Category is required." });
    }
    if (!Array.isArray(roleArray)) {
      roleArray = [roleArray];
    }
    if (roleArray.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one category is required." });
    }
    // Validate each role value
    const validRoles = ["doctor", "nurse", "physiotherapist", "social worker"];
    const invalidRoles = roleArray.filter(r => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      return res
        .status(400)
        .json({ message: `Invalid category values: ${invalidRoles.join(", ")}` });
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
            role: roleArray,
        });
        await specialization.save();
        res.status(201).json({ message: "Specialization created successfully", specialization });
    }catch (error) {
    console.error("Error creating specialization:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.getAllSpecializations = async (req, res) => {
    try{
    const specializations = await Specialization.find();
    res.status(200).json({ specializations });
    }catch (error) {
    console.error("Error fetching specializations:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
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
    console.error("Error fetching specialization:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
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
    console.error("Error deleting specialization:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
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
    if (title !== undefined) {
      specialization.title = title;
    }
    if (description !== undefined) {
      specialization.description = description;
    }
    if (role !== undefined) {
      // Ensure role is an array - convert single value to array if needed
      let roleArray = role;
      if (!Array.isArray(roleArray)) {
        roleArray = [roleArray];
      }
      if (roleArray.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one category is required." });
      }
      // Validate each role value
      const validRoles = ["doctor", "nurse", "physiotherapist", "social worker"];
      const invalidRoles = roleArray.filter(r => !validRoles.includes(r));
      if (invalidRoles.length > 0) {
        return res
          .status(400)
          .json({ message: `Invalid category values: ${invalidRoles.join(", ")}` });
      }
      specialization.role = roleArray;
    }
    await specialization.save();
    res.status(200).json({ message: "Specialization updated successfully.", specialization });
    }catch (error) {
    console.error("Error updating specialization:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};
