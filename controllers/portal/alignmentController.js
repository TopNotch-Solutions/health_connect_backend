const AilmentCategory = require("../../models/ailment");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const parseBooleanish = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

exports.create = async (req, res) => {
    const {
      title,
      description,
      initialCost,
      specialization,
      provider,
      priority,
      supportsTeleconsultation,
    } = req.body;
    const image = req.file ? req.file.filename : null;

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
    if (!image) {
      return res
        .status(400)
        .json({ message: "Ailment image is required." });
    }
    // Normalize specialization to a proper array of ObjectId strings
    let specializationArray = specialization;

    // If specialization is a JSON string (common with multipart/form-data), parse it
    if (typeof specializationArray === "string") {
      try {
        const parsed = JSON.parse(specializationArray);
        if (Array.isArray(parsed)) {
          specializationArray = parsed;
        } else {
          specializationArray = [specializationArray];
        }
      } catch (e) {
        // Not valid JSON, wrap as single value
        specializationArray = [specializationArray];
      }
    }

    // If we received an array whose first element is a JSON stringified array, flatten it
    if (
      Array.isArray(specializationArray) &&
      specializationArray.length === 1 &&
      typeof specializationArray[0] === "string" &&
      specializationArray[0].trim().startsWith("[")
    ) {
      try {
        const innerParsed = JSON.parse(specializationArray[0]);
        if (Array.isArray(innerParsed)) {
          specializationArray = innerParsed;
        }
      } catch (e) {
        // Ignore and keep as-is
      }
    }

    // Ensure specialization is an array - convert single value to array if needed
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
            priority,
            specialization: specializationArray,
            provider,
            supportsTeleconsultation: parseBooleanish(
              supportsTeleconsultation,
              false,
            ),
            image,
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
    const ailments = await AilmentCategory.find().populate('specialization').sort({ priority: 1 });   
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
    const {
      title,
      description,
      initialCost,
      specialization,
      priority,
      supportsTeleconsultation,
    } = req.body; 
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
    if (!priority) {
      return res
        .status(400)
        .json({ message: "Priority is required." });
    }
    // Normalize specialization if provided
    let specializationArray = specialization;
    if (specializationArray !== undefined) {
      if (typeof specializationArray === "string") {
        try {
          const parsed = JSON.parse(specializationArray);
          if (Array.isArray(parsed)) {
            specializationArray = parsed;
          } else {
            specializationArray = [specializationArray];
          }
        } catch (e) {
          specializationArray = [specializationArray];
        }
      }

      if (
        Array.isArray(specializationArray) &&
        specializationArray.length === 1 &&
        typeof specializationArray[0] === "string" &&
        specializationArray[0].trim().startsWith("[")
      ) {
        try {
          const innerParsed = JSON.parse(specializationArray[0]);
          if (Array.isArray(innerParsed)) {
            specializationArray = innerParsed;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!Array.isArray(specializationArray)) {
        specializationArray = [specializationArray];
      }

      if (specializationArray.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one specialization is required." });
      }
    }
    try {
    const ailment = await AilmentCategory.findById(id);   
    if (!ailment) {
      return res.status(404).json({ message: "Ailment not found." });
    }
    ailment.title = title || ailment.title;
    ailment.description = description || ailment.description;
    ailment.priority = priority || ailment.priority;
    
    // If initialCost is provided, recalculate commission and cost
    if (initialCost) {
      ailment.initialCost = initialCost;
      ailment.commission = initialCost * 0.15;
      ailment.cost = initialCost - ailment.commission;
    }
    
    if (specializationArray !== undefined) {
      ailment.specialization = specializationArray;
    }
    if (supportsTeleconsultation !== undefined) {
      ailment.supportsTeleconsultation = parseBooleanish(
        supportsTeleconsultation,
        ailment.supportsTeleconsultation,
      );
    }
    await ailment.save();
    res.status(200).json({ message: "Ailment updated successfully", ailment });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  } 
}

exports.updateAilmentImage = async (req, res) => {
  let { id } = req.params;

  let image = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "Ailment ID is required." });
    }
     if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ailment ID format." });
  }
    if (!image) {
      return res
        .status(400)
        .json({ message: "Ailment image is required." });
    }
    
  try{
    // id = new mongoose.Types.ObjectId(id)
    const existingAilment = await AilmentCategory.findById(id);

    if (!existingAilment) {
      return res.status(404).json({
        message: "It seems the selected ailment does not exist in the system. Please contact system admin. ",
      });
    }
    if (existingAilment.image) {
      const oldImagePath = path.join("public", "ailments", existingAilment.image);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous ailment image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingAilment.image = image;
    await existingAilment.save();
    res.status(200).json({
      status: true,
      message: "Ailment image has been updated successfully",
    });
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
