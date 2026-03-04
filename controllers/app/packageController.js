const Package = require("../../models/packages");

exports.all = async (req, res) => {
  const { provider } = req.params;

  const allowedProviders = [
    "doctor",
    "nurse",
    "physiotherapist",
    "social worker",
  ];

  try {
    let filter = {};

    if (provider) {
      const normalizedProvider = provider.toLowerCase();

      if (!allowedProviders.includes(normalizedProvider)) {
        return res.status(400).json({
          status: "FAILURE",
          message: "Invalid provider type",
        });
      }

      filter.provider = normalizedProvider;
    }

    const packages = await Package.find(filter).sort({ createdAt: -1 });

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