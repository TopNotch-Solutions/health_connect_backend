const Adverts = require("../../models/adverts");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

exports.create = async (req, res) => {
    const { description } = req.body;
    const image = req.file ? req.file.filename : null;
    if (!description) {
      return res
        .status(400)
        .json({ message: "Description is required." });
    }
    if (!image) {
      return res
        .status(400)
        .json({ message: "Advert image is required." });
    }
    try{
        const newAdvert = new Adverts({
            description,
            image
        });
        await newAdvert.save();
        return res
          .status(201)
          .json({ message: "Advert created successfully.", advert: newAdvert });
    }catch (error) {
        console.error("Error creating advert:", error);
        res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
    }
}
exports.getAllAdverts = async (req, res) => {
    try{
        const adverts = await Adverts.find();   
        res.status(200).json({ adverts });
    }catch (error) {    
        console.error("Error retrieving adverts:", error);
        res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
    }   
}
exports.updateDescription = async (req, res) => {
    const { description } = req.body;
    const { id } = req.params;
    if (!description) {
      return res
        .status(400)
        .json({ message: "Description is required." });
    }   
    try{
        const advert = await Adverts.findById(id);
        if (!advert) {
            return res.status(404).json({ message: "Advert not found." });
        }
        advert.description = description;
        await advert.save();
        res.status(200).json({ message: "Advert description updated successfully.", advert });
    }catch (error) {
        console.error("Error updating advert description:", error);
        res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
    }
}
exports.updateImage = async (req, res) => {
    const { id } = req.params;
    const image = req.file ? req.file.filename : null;
    if (!image) {
      return res
        .status(400)
        .json({ message: "Advert image is required." });
    }
    try{
        const advert = await Adverts.findById(id);
        if (!advert) {
            return res.status(404).json({ message: "Advert not found." });
        }
        if (advert.image) {
              const oldImagePath = path.join("public", "adverts", advert.image);

              if (fs.existsSync(oldImagePath)) {
                console.log("Removing previous ailment image:", oldImagePath);
                fs.unlinkSync(oldImagePath);
              }
            }
        advert.image = image;
        await advert.save();
        res.status(200).json({ message: "Advert image updated successfully.", advert });
    }catch (error) {
        console.error("Error updating advert image:", error);
        res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
    }
}
exports.deleteAdvert = async (req, res) => {
    const { id } = req.params;
    try{
        const advert = await Adverts.findByIdAndDelete(id);
        if (!advert) {
            return res.status(404).json({ message: "Advert not found." });
        }
        res.status(200).json({ message: "Advert deleted successfully." });
    }catch (error) {
        console.error("Error deleting advert:", error);
        res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
    }
}