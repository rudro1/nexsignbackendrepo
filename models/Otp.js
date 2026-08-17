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

module.exports = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
