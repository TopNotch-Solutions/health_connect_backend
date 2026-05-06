const Issue = require("../../models/issue");
const Notification = require("../../models/notification");

exports.createIssue = async (req, res) => {
  const { title, description } = req.body;
  const id = req.user.id;

  let issueImage = req.file ? req.file.filename : null;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }
  if (!title) {
    return res.status(400).json({ message: "Issue title is required" });
  }
  if (!description) {
    return res.status(400).json({ message: "Description is required" });
  }
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0); 

    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingIssue = await Issue.findOne({
      userId: id,
      title: title,
      date: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    if (existingIssue) {
      return res.status(409).json({ 
        message: "Looks like this issue has already been reported today. Thanks for letting us know!"
      });
    }
    await Issue.create({
      userId: id,
      title,
      description,
      issueImage,
      date: Date.now(),
    });
    await Notification.createNotification({
      userId: id,
      type: "issue_reported",
      title: "Issue reported successfully.",
      status: "sent",
      message: `Thanks for reporting the issue '${title}'. Our team will check it out shortly.`,
      data: {
        message: `Thanks for reporting the issue '${title}'. Our team will check it out shortly.`,
    }});
    const data = await Issue.find({userId: id});
    return res.status(201).json({
      message: "Great! Your issue was created successfully. We appreciate you bringing this to our attention.",
      data
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};

exports.all = async (req, res) => {
  const id = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

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

    // Total issues count
    const totalIssues = await Issue.countDocuments({
      userId: id
    });

    if (totalIssues === 0) {
      return res.status(200).json({
        message: "Looks like there are no issues linked to your account right now.",
        data: [],
        pagination: {
          currentPage: pageNumber,
          totalPages: 0,
          totalIssues: 0,
          limit: limitNumber,
          hasNextPage: false,
          hasPreviousPage: false
        }
      });
    }

    // Fetch paginated issues (latest first)
    const issues = await Issue.find({ userId: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalPages = Math.ceil(totalIssues / limitNumber);

    return res.status(200).json({
      message: "Great! Your issues have been retrieved successfully.",
      data: issues,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalIssues,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      }
    });
  } catch (error) {
    console.error("Error fetching issues:", error);
    res.status(500).json({
      message: "We're having trouble processing your request. Please try again shortly.",
      error
    });
  }
};


exports.getAllIssues = async (req, res) => {
  try {
    const issues = await Issue.find().populate('userId', 'fullname email cellphoneNumber').sort({ date: -1 });
    res.status(200).json({ status: true, issues });
  } catch (error) {
    console.error("Error fetching all issues:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};