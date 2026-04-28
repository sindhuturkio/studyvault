const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  department: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: { code: String, expiresAt: Date },
  uploads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Resource' }],
  points: { type: Number, default: 0 },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  lastLogin: Date,
  lastSeen: { type: Date, default: null },
  joinedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  if (this.password.startsWith('$2')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);