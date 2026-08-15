'use strict';
/**
 * One-time seed: create or update NexSign admin user.
 * Usage: node scripts/seedAdmin.js
 * Does NOT run automatically — invoke manually or in CI with env loaded.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const User     = require('../models/User');

const ADMIN = {
  full_name:         process.env.SEED_ADMIN_NAME     || 'NexSign Admin',
  email:             process.env.SEED_ADMIN_EMAIL,
  password:          process.env.SEED_ADMIN_PASSWORD,
  role:              'super_admin',
  is_email_verified: true,
  is_active:         true,
};

if (!ADMIN.email || !ADMIN.password) {
  console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars are required.');
  process.exit(1);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: ADMIN.email }).select('+password');

  if (user) {
    user.full_name         = ADMIN.full_name;
    user.password          = ADMIN.password;
    user.role              = ADMIN.role;
    user.is_email_verified = true;
    user.is_active         = true;
    await user.save();
    console.log('Updated existing admin:', ADMIN.email, 'role:', user.role);
  } else {
    user = await User.create(ADMIN);
    console.log('Created admin:', ADMIN.email, 'role:', user.role);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
