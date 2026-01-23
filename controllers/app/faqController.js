const FAQ = require("../../models/faq");

exports.getAllFAQ = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    // Convert page & limit to numbers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    // Validate pagination values
    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({
        message: "Page and limit must be positive numbers"
      });
    }

    // Pagination calculation
    const skip = (pageNumber - 1) * limitNumber;

    // Total FAQ count
    const totalFAQs = await FAQ.countDocuments();

    if (totalFAQs === 0) {
      return res.status(200).json({
        message: "No FAQs are available at the moment.",
        data: [],
        pagination: {
          currentPage: pageNumber,
          totalPages: 0,
          totalFAQs: 0,
          limit: limitNumber,
          hasNextPage: false,
          hasPreviousPage: false
        }
      });
    }

    // Fetch paginated FAQs (latest first if applicable)
    const faqs = await FAQ.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalPages = Math.ceil(totalFAQs / limitNumber);

    return res.status(200).json({
      message: "FAQs retrieved successfully.",
      data: faqs,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalFAQs,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      }
    });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({
      message: "We’re having trouble processing your request. Please try again shortly.",
      error
    });
  }
};
