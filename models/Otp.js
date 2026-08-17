'use strict';

const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type:      String,
      required:  true,
      lowercase: true,
      trim:      true,
      index:     true,
    },
    otp: {
      type:     String,
      required: true,
    },
    purpose: {
      type:    String,
      enum:    ['signup', 'reset_password'],
      default: 'signup',
    },
    attempts: {
      type:    Number,
      default: 0,
    },
    // Email delivery tracking
    deliveryStatus: {
      type:    String,
      enum:    ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    deliveryAttempts: {
      type:    Number,
      default: 0,
    },
    sentAt: {
      type: Date,
    },
    lastAttemptAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    createdAt: {
      type:    Date,
      default: Date.now,
      expires: 600, // Document automatically removed by MongoDB after 10 minutes
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for rate limiting
otpSchema.index({ email: 1, purpose: 1, createdAt: 1 });

module.exports = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
