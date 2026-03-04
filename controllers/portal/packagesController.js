const Package = require("../../models/packages");

const allowedProviders = [
  "doctor",
  "nurse",
  "physiotherapist",
  "social worker",
];

exports.create = async (req, res) => {
  try {
    const { provider, amount, consultations } = req.body;

    if (!provider || !amount || !consultations) {
      return res.status(400).json({
        status: "FAILURE",
        message: "All fields are required",
      });
    }

    if (!allowedProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid provider type",
      });
    }
    const existingPackage = await Package.findOne({ provider: provider.toLowerCase() , amount, consultations });
    if (existingPackage) {
      return res.status(400).json({
        status: "FAILURE",
        message: `A package for this provider ${provider.toLowerCase()}, amount ${amount}, and consultations ${consultations} already exists`,
      });
    }
    const newPackage = await Package.create({
      provider: provider.toLowerCase(),
      amount,
      consultations,
    });

    return res.status(201).json({
      status: "SUCCESS",
      data: newPackage,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.all = async (req, res) => {
  try {
    const packages = await Package.find().sort({ createdAt: -1 });

    return res.status(200).json({
      status: "SUCCESS",
      count: packages.length,
      data: packages,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.get = async (req, res) => {
  try {
    const { id } = req.params;

    const packageItem = await Package.findById(id);

    if (!packageItem) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Package not found",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      data: packageItem,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { provider, amount, consultations } = req.body;

    if (provider && !allowedProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Invalid provider type",
      });
    }

    const updatedPackage = await Package.findByIdAndUpdate(
      id,
      {
        ...(provider && { provider: provider.toLowerCase() }),
        ...(amount !== undefined && { amount }),
        ...(consultations !== undefined && { consultations }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Package not found",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      data: updatedPackage,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedPackage = await Package.findByIdAndDelete(id);

    if (!deletedPackage) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Package not found",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      message: "Package deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};