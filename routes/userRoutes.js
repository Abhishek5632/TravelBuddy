const express = require("express");
const router = express.Router();
const User = require("../models/User");

// -------------------------------
// SEND REQUEST
// -------------------------------
router.post("/send-request", async (req, res) => {
  try {
    const { fromEmail, toEmail, trip } = req.body;

    if (!fromEmail || !toEmail)
      return res.json({ success: false, message: "Missing emails" });

    if (fromEmail === toEmail)
      return res.json({ success: false, message: "Cannot send request to yourself" });

    const sender = await User.findOne({ email: fromEmail });
    const receiver = await User.findOne({ email: toEmail });

    if (!sender || !receiver)
      return res.json({ success: false, message: "User not found" });

    // Check if already connected
    if (sender.connections.includes(toEmail))
      return res.json({ success: false, message: "Already connected" });

    // Check duplicate outgoing request
    if (sender.sentRequests.find(r => r.toEmail === toEmail && r.status === "pending"))
      return res.json({ success: false, message: "Request already sent" });

    // Check if receiver already sent a request to sender
    if (receiver.requests.find(r => r.fromEmail === fromEmail && r.status === "pending"))
      return res.json({ success: false, message: "Request already pending" });

    // Add to sender (sent)
    sender.sentRequests.push({
      toEmail,
      trip,
      status: "pending",
      date: new Date()
    });

    // Add to receiver (incoming)
    receiver.requests.push({
      fromEmail,
      fromName: sender.firstName,
      trip,
      status: "pending",
      date: new Date()
    });

    await sender.save();
    await receiver.save();

    res.json({ success: true, message: "Request sent" });

  } catch (err) {
    console.log("SEND REQUEST ERROR:", err);
    res.json({ success: false, message: "Server error" });
  }
});

// ---------------------------------
// ACCEPT / REJECT REQUEST
// ---------------------------------
router.post("/respond-request", async (req, res) => {
  try {
    const { toEmail, fromEmail, action } = req.body;

    const receiver = await User.findOne({ email: toEmail });
    const sender = await User.findOne({ email: fromEmail });

    if (!receiver || !sender)
      return res.json({ success: false, message: "Users not found" });

    // Update receiver (incoming)
    const incoming = receiver.requests.find(r => r.fromEmail === fromEmail);
    if (incoming) incoming.status = action;

    // Update sender (outgoing)
    const outgoing = sender.sentRequests.find(r => r.toEmail === toEmail);
    if (outgoing) outgoing.status = action;

    // If accepted → add to connections
    if (action === "accept") {
      if (!receiver.connections.includes(fromEmail))
        receiver.connections.push(fromEmail);

      if (!sender.connections.includes(toEmail))
        sender.connections.push(toEmail);
    }

    await receiver.save();
    await sender.save();

    res.json({ success: true, message: `Request ${action}ed` });

  } catch (err) {
    console.log("RESPOND ERROR:", err);
    res.json({ success: false, message: "Server error" });
  }
});

// ------------------------------------
// GET ALL REQUESTS FOR LOGGED IN USER
// ------------------------------------
router.get("/requests", async (req, res) => {
  try {
    const email = req.query.email;

    const user = await User.findOne({ email });

    if (!user)
      return res.json({ success: false, message: "User not found" });

    res.json({
      success: true,
      requests: user.requests,
      sentRequests: user.sentRequests
    });

  } catch (err) {
    console.log("REQUESTS ERROR:", err);
    res.json({ success: false, message: "Server error" });
  }
});

module.exports = router;
