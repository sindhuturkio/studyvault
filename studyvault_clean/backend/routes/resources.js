const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Resource = require('../models/Resource');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { notifyAdmin } = require('../services/emailService');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'studyvault',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
    public_id: (req, file) => Date.now() + '-' + Math.round(Math.random() * 1e9)
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed.'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/resources
router.get('/', protect, async (req, res) => {
  try {
    const { type, semester, search } = req.query;
    let query = {};
    if (type && type !== 'All') query.type = type;
    if (semester && semester !== 'All') query.semester = semester;
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
    const resources = await Resource.find(query).sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/resources/upload
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
  try {
    const { title, subject, type, semester, description, folderId, folderName } = req.body;
    if (!title || !subject || !type) {
      return res.status(400).json({ message: 'Title, subject and type are required.' });
    }
    const resource = await Resource.create({
      title, subject, type, semester, description,
      folderId: folderId || null,
      folderName: folderName || null,
      uploader: req.user._id,
      uploaderName: req.user.name,
      uploaderEmail: req.user.email,
      fileName: req.file ? req.file.originalname : null,
      filePath: req.file ? req.file.path : null,
      fileSize: req.file ? req.file.size : null
    });
    await User.findByIdAndUpdate(req.user._id, {
      $push: { uploads: resource._id },
      $inc: { points: 20 }
    });
    await notifyAdmin('New Resource Uploaded', {
      Title: title, Type: type, Subject: subject,
      Folder: folderName || 'None (General)',
      'Uploaded By': req.user.name, Email: req.user.email,
      'Has PDF': req.file ? 'Yes' : 'No'
    });
    res.status(201).json({ message: 'Resource uploaded successfully! +20 points earned.', resource });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: err.message || 'Server error.' });
  }
});

// GET /api/resources/:id/download
router.get('/:id/download', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found.' });
    if (!resource.filePath) return res.status(404).json({ message: 'No PDF attached to this resource.' });
    resource.downloads += 1;
    await resource.save();
    await notifyAdmin('Resource Downloaded', {
      Resource: resource.title,
      Folder: resource.folderName || 'General',
      'Downloaded By': req.user.name,
      'Student Email': req.user.email,
      'Total Downloads': resource.downloads
    });
    // Redirect to Cloudinary URL
    res.redirect(resource.filePath);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/resources/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found.' });
    const isOwner = resource.uploaderEmail === req.user.email;
    const isAdmin = req.user.email === ADMIN_EMAIL;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You can only delete files you uploaded.' });
    }
    // Delete from Cloudinary if exists
    if (resource.filePath && resource.filePath.includes('cloudinary')) {
      try {
        const urlParts = resource.filePath.split('/');
        const publicIdWithExt = urlParts.slice(-2).join('/');
        const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      } catch (e) { console.log('Cloudinary delete failed:', e.message); }
    }
    await resource.deleteOne();
    await notifyAdmin('Resource Deleted', {
      Title: resource.title,
      'Deleted By': req.user.name,
      Email: req.user.email
    });
    res.json({ message: 'Resource deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/resources/:id/comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text, stars } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text is required.' });
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found.' });
    resource.comments.push({ author: req.user._id, authorName: req.user.name, text, stars: stars || 0 });
    if (stars && stars >= 1 && stars <= 5) {
      const total = resource.ratingCount + 1;
      resource.rating = parseFloat(((resource.rating * resource.ratingCount + stars) / total).toFixed(1));
      resource.ratingCount = total;
    }
    await resource.save();
    res.json({ message: 'Comment added.', resource });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/resources/my/uploads
router.get('/my/uploads', protect, async (req, res) => {
  try {
    const resources = await Resource.find({ uploader: req.user._id }).sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;