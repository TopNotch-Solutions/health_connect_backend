const AilmentCategory = require("../../models/ailment");

exports.create = async (req, res) => {
    const {title, description, initialCost, specialization, provider, icon} = req.body;
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
    if (!initialCost) {
      return res
        .status(400)
        .json({ message: "Initial cost is required." });
    }
    if (!specialization) {
      return res
        .status(400)
        .json({ message: "Specialization is required." });
    }
    if (!provider) {
      return res
        .status(400)
        .json({ message: "Provider is required." });
    }
    if (!icon) {
      return res
        .status(400)
        .json({ message: "Icon is required." });
    }
    // Validate provider enum
    const validProviders = ["Doctor", "Nurse", "Physiotherapist", "Social Worker"];
    if (!validProviders.includes(provider)) {
      return res
        .status(400)
        .json({ message: "Invalid provider. Must be one of: Doctor, Nurse, Physiotherapist, Social Worker" });
    }
    // Ensure specialization is an array - convert single value to array if needed
    let specializationArray = specialization;
    if (!Array.isArray(specializationArray)) {
      specializationArray = [specializationArray];
    }
    if (specializationArray.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one specialization is required." });
    }
    try{
        const existingAilment = await AilmentCategory.findOne({ title });
        if (existingAilment) {
          return res
            .status(400)
            .json({ message: "Ailment with this title already exists." });
        }
        
        // Calculate commission (15% of initialCost) and cost (remaining amount)
        const commission = initialCost * 0.15;
        const cost = initialCost - commission;
        
        const ailment = new AilmentCategory({
            title,
            description,
            initialCost,
            cost,
            commission,
            specialization: specializationArray,
            provider,
            icon,
        });
        await ailment.save();
        res.status(201).json({ message: "Ailment created successfully", ailment });
    }catch (error) {
    console.error("Error creating ailment:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getAllAilments = async (req, res) => {
    try{
    const ailments = await AilmentCategory.find().populate('specialization');   
    res.status(200).json({ ailments });
    }catch (error) {    
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getAilmentById = async (req, res) => {
    const { id } = req.params;
    try {
    const ailment = await AilmentCategory.findById(id).populate('specialization');   
    if (!ailment) {
      return res.status(404).json({ message: "Ailment not found." });
    }
    res.status(200).json({ ailment });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateAilment = async (req, res) => {
    const { id } = req.params;
    const { title, description, initialCost, specialization } = req.body; 
    if (!title) {
      return res
        .status(400)
        .
        json({ message: "Title is required." });
    }
    if (!description) {
      return res
        .status(400)
        .json({ message: "Description is required." });
    }
    if (!initialCost) {
      return res
        .status(400)
        .json({ message: "Initial cost is required." });
    }
    if (!specialization) {
      return res
        .status(400)
        .json({ message: "Specialization is required." });
    }
    // Ensure specialization is an array - convert single value to array if needed
    let specializationArray = specialization;
    if (!Array.isArray(specializationArray)) {
      specializationArray = [specializationArray];
    }
    if (specializationArray.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one specialization is required." });
    }
    try {
    const ailment = await AilmentCategory.findById(id);   
    if (!ailment) {
      return res.status(404).json({ message: "Ailment not found." });
    }
    ailment.title = title || ailment.title;
    ailment.description = description || ailment.description;
    
    // If initialCost is provided, recalculate commission and cost
    if (initialCost) {
      ailment.initialCost = initialCost;
      ailment.commission = initialCost * 0.15;
      ailment.cost = initialCost - ailment.commission;
    }
    
    ailment.specialization = specializationArray;
    await ailment.save();
    res.status(200).json({ message: "Ailment updated successfully", ailment });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  } 
}
exports.deleteAilment = async (req, res) => {
    const { id } = req.params;  
    try {
    const ailment = await AilmentCategory.findByIdAndDelete(id);
    if (!ailment) {
      return res.status(404).json({ message: "Ailment not found." });
    }
    res.status(200).json({ message: "Ailment deleted successfully." });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  } 
}