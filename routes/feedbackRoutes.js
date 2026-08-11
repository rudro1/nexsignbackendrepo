const express = require('express');
const router = express.Router();
const { sendFeedbackEmail } = require('../utils/emailService');

router.post('/send-feedback', async (req, res) => {
  const { email, name, stars } = req.body;

  try {
    await sendFeedbackEmail(email, name, stars);
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;



// const express = require('express');
// const router = express.Router();

// // ✅ PRODUCTION RATE LIMIT (Spam Protection)
// const rateLimit = require('express-rate-limit');
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // 5 feedback per IP
//   message: { error: 'Too many feedback requests. Please wait.' }
// });

// router.post('/send-feedback', limiter, async (req, res) => {
//   try {
//     const { email, name, message, stars } = req.body;

//     // ✅ VALIDATION
//     if (!email || !name || stars < 1 || stars > 5) {
//       return res.status(400).json({ 
//         error: 'Valid email, name & 1-5 stars required' 
//       });
//     }

//     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//       return res.status(400).json({ error: 'Invalid email format' });
//     }

//     // ✅ SANITIZE INPUT
//     const cleanEmail = email.trim().toLowerCase();
//     const cleanName = name.trim().substring(0, 50);
//     const cleanMessage = (message || '').trim().substring(0, 1000);

//     // ✅ Send Email (Production Safe)
//     await sendFeedbackEmail(cleanEmail, cleanName, stars, cleanMessage);
    
//     console.log(`✅ Feedback from ${cleanEmail}: ${stars}⭐`);
    
//     res.status(200).json({ 
//       success: true, 
//       message: 'Thank you! Your feedback helps us improve 🚀' 
//     });
    
//   } catch (error) {
//     console.error('Feedback Error:', error);
//     res.status(500).json({ 
//       error: 'Feedback submission failed. Please try again.' 
//     });
//   }
// });

// module.exports = router;