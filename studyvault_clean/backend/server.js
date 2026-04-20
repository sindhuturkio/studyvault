require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const folderRoutes = require('./routes/folders');

const app = express();
app.set('trust proxy', 1);

// ── Rate limiting (security) ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests. Please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

// ── Middleware ──
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// ── Serve frontend static files ──
const frontendPath = path.join(__dirname, 'frontend', 'public');
app.use(express.static(frontendPath));

// ── Routes ──
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/folders', folderRoutes);

// ── Health check ──
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'StudyVault API running' }));

// ── Serve frontend for all other routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Connect to MongoDB and start server ──
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 StudyVault server running on http://localhost:${PORT}`);
      console.log(`📧 Admin notifications → ${process.env.ADMIN_EMAIL}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
