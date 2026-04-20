const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendOTPEmail, sendWelcomeEmail, notifyAdmin, sendPasswordResetEmail } = require('../services/emailService');

// ── Allowed university domains ──
const isAllowedEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  const allowed = (process.env.ALLOWED_DOMAINS || 'edu.pk,ac.pk').split(',');
  return allowed.some(d => domain === d.trim() || domain.endsWith('.' + d.trim()));
};

// ── Generate 6-digit OTP ──
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// ── Generate JWT token ──
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password || !department) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (!isAllowedEmail(email)) {
      return res.status(400).json({ message: 'Only university email addresses are allowed (e.g. .edu.pk, .ac.pk).' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.isVerified) {
      return res.status(400).json({ message: 'This email is already registered. Please log in.' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existing && !existing.isVerified) {
      // Update existing unverified user
      existing.name = name;
      existing.password = password;
      existing.department = department;
      existing.otp = { code: otp, expiresAt: otpExpiry };
      await existing.save();
    } else {
      // Create new user
      await User.create({
        name, email: email.toLowerCase(), password, department,
        otp: { code: otp, expiresAt: otpExpiry }
      });
    }

    // Send OTP to student's email
    await sendOTPEmail(email, name, otp);

    // Notify admin
    await notifyAdmin('New Registration Attempt', {
      Name: name,
      Email: email,
      Department: department
    });

    res.json({ message: 'OTP sent to your email. Please verify to complete registration.' });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) return res.status(400).json({ message: 'User not found.' });
    if (!user.otp?.code) return res.status(400).json({ message: 'No OTP found. Please register again.' });
    if (new Date() > user.otp.expiresAt) return res.status(400).json({ message: 'OTP has expired. Please register again.' });
    if (user.otp.code !== otp) return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });

    user.isVerified = true;
    user.otp = undefined;
    await user.save();

    // Send welcome email
    await sendWelcomeEmail(email, user.name);

    // Notify admin
    await notifyAdmin('New Student Verified', {
      Name: user.name,
      Email: email,
      Department: user.department
    });

    const token = generateToken(user._id);
    res.json({
      message: 'Email verified! Welcome to StudyVault.',
      token,
      user: { id: user._id, name: user.name, email: user.email, department: user.department, points: user.points }
    });

  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    if (!isAllowedEmail(email)) return res.status(400).json({ message: 'Only university email addresses are allowed.' });

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      await notifyAdmin('Failed Login Attempt', { Email: email, Reason: 'User not found' });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (!user.isVerified) {
      return res.status(401).json({ message: 'Email not verified. Please check your inbox for the OTP.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await notifyAdmin('Failed Login Attempt', { Name: user.name, Email: email, Reason: 'Wrong password' });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Notify admin of successful login
    await notifyAdmin('Student Logged In', {
      Name: user.name,
      Email: email,
      Department: user.department
    });

    const token = generateToken(user._id);
    res.json({
      message: 'Logged in successfully.',
      token,
      user: { id: user._id, name: user.name, email: user.email, department: user.department, points: user.points }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!isAllowedEmail(email)) return res.status(400).json({ message: 'Not a recognized university email.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.otp = { code: resetToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
    await user.save();

    await sendPasswordResetEmail(email, user.name, resetToken);
    await notifyAdmin('Password Reset Requested', { Name: user.name, Email: email });

    res.json({ message: 'Password reset link sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required.' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const user = await User.findOne({ 'otp.code': token });
    if (!user || new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    user.password = newPassword;
    user.otp = undefined;
    await user.save();

    await notifyAdmin('Password Reset Completed', { Name: user.name, Email: user.email });
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
