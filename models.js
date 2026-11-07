const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    rollNumber: { type: String, trim: true, default: '' },
    password: { type: String, required: true },
    signupIp: { type: String, default: '' },
    lastLoginIp: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    bannedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Confession Schema
const ConfessionSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, maxlength: 500, trim: true },
    category: {
      type: String,
      enum: ['Love', 'Funny', 'Campus Life', 'Secret', 'Other'],
      default: 'Other'
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    isReportHidden: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);
const Confession = mongoose.model('Confession', ConfessionSchema);

module.exports = { User, Confession };
