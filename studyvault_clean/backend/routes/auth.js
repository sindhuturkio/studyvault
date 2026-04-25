const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendOTPEmail, sendWelcomeEmail, notifyAdmin } = require('../services/emailService');

// ── Allowed domains ──
const getAllowedDomains = () => {
  const envDomains = process.env.ALLOWED_DOMAINS || 'edu.pk,ac.pk,university.edu.pk,neduet.edu.pk,cloud.neduet.edu.pk,gmail.com';
  return envDomains.split(',').map(d => d.trim().toLowerCase());
};

function isAllowedEmail(email) {
  if (!email || !email.includes('@')) return false;
  const emailLower = email.toLowerCase().trim();
  if (emailLower === 'sindhuturkio20@gmail.com') return true;
  const domain = emailLower.split('@')[1];
  const allowed = getAllowedDomains().filter(d => d !== 'gmail.com');
  return allowed.some(d => domain === d || domain.endsWith('.' + d));
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── REGISTER ──
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all fields.' });
    }
    const emailLower = email.toLowerCase().trim();
    if (!isAllowedEmail(emailLower)) {
      return res.status(400).json({ message: 'Only university email addresses are allowed (e.g. .edu.pk, .ac.pk).' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    const existing = await User.findOne({ email: emailLower });
    if (existing && existing.isVerified) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const hashedPassword = await bcrypt.hash(password, 12);
    if (existing && !existing.isVerified) {
      existing.name = name;
      existing.password = hashedPassword;
      existing.department = department || '';
      existing.otp = otp;
      existing.otpExpiry = otpExpiry;
      await existing.save();
    } else {
      await User.create({
        name,
        email: emailLower,
        password: hashedPassword,
        department: department || '',
        otp,
        otpExpiry,
        isVerified: false,
        points: 0
      });
    }
    await sendOTPEmail(emailLower, name, otp);
    try {
      await notifyAdmin('New Registration Attempt', {
        Name: name,
        Email: emailLower,
        Department: department || 'N/A'
      });
    } catch (e) { console.log('Admin notify failed:', e.message); }
    res.json({ message: 'OTP sent to your email. Please verify.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── VERIFY OTP ──
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required.' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'User not found.' });
    if (user.isVerified) return res.status(400).json({ message: 'Email already verified.' });
    if (!user.otp || user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP.' });
    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired. Please register again.' });
    }
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.joinedAt = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    try {
      await sendWelcomeEmail(user.email, user.name);
      await notifyAdmin('New Student Verified', {
        Name: user.name,
        Email: user.email,
        Department: user.department || 'N/A'
      });
    } catch (e) { console.log('Welcome email failed:', e.message); }
    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        department: user.department,
        points: user.points || 0,
        joinedAt: user.joinedAt,
        isVerified: true
      }
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── LOGIN ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Please enter email and password.' });
    const emailLower = email.toLowerCase().trim();
    if (!isAllowedEmail(emailLower)) {
      return res.status(400).json({ message: 'Only university email addresses are allowed.' });
    }
    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(400).json({ message: 'No account found with this email.' });
    if (!user.isVerified) return res.status(400).json({ message: 'Please verify your email first.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Incorrect password.' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    try {
      await notifyAdmin('Student Login', {
        Name: user.name,
        Email: user.email,
        Department: user.department || 'N/A'
      });
    } catch (e) { console.log('Admin notify failed:', e.message); }
    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        department: user.department,
        points: user.points || 0,
        joinedAt: user.joinedAt,
        isVerified: true
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── FORGOT PASSWORD ──
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Please enter your email.' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'No account found with this email.' });
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const { sendPasswordResetEmail } = require('../services/emailService');
    await sendPasswordResetEmail(user.email, user.name, resetToken);
    res.json({ message: 'Password reset link sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── GET CURRENT USER ──
router.get('/me', protect, async (req, res) => {
  try {
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── ADMIN: GET ALL USERS ──
router.get('/admin/users', protect, async (req, res) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'sindhuturkio20@gmail.com';
    if (req.user.email !== adminEmail) {
      return res.status(403).json({ message: 'Access denied. Admins only.' });
    }
    const users = await User.find({ isVerified: true }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
