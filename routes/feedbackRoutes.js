const express = require('express');
const router = express.Router();
const { sendFeedbackEmail } = require('../utils/emailService');

router.post('/send-feedback', async (req, res) => {
  const { email, name, stars, message } = req.body || {};

  if (!email?.trim() || !name?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Name and email are required.',
    });
  }

  const rating = Number(stars);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a rating between 1 and 5 stars.',
    });
  }

  try {
    await sendFeedbackEmail(email, name, rating, message);
    return res.status(200).json({
      success: true,
      message: 'Thank you for your feedback.',
    });
  } catch (error) {
    console.error('[feedback]', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send feedback. Please try again later.',
    });
  }
});

module.exports = router;
