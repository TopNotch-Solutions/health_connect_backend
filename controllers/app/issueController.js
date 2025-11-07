const Issue = require("../../models/issue");
const Notification = require("../../models/notification");

exports.createIssue = async (req, res) => {
  const { title, description } = req.body;
  const { id } = req.params;

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
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

  try {
    const allIssuesUser = await Issue.find({
      userId: id,
    });

    if (allIssuesUser.length === 0) {
      return res.status(200).json({
        message: "Looks like there are no issues linked to your account right now.",
        data: [],
      });
    }
    return res.status(201).json({
      message: "Great! Your issues have been retrieved successfully.",
      data: allIssuesUser,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};