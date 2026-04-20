const express = require('express');
const router = express.Router();
const Folder = require('../models/Folder');
const Resource = require('../models/Resource');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { notifyAdmin } = require('../services/emailService');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// GET /api/folders — get all folders
router.get('/', protect, async (req, res) => {
  try {
    const folders = await Folder.find().sort({ createdAt: -1 });
    // attach file count to each folder
    const result = await Promise.all(folders.map(async f => {
      const count = await Resource.countDocuments({ folderId: f._id });
      return { ...f.toObject(), fileCount: count };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/folders — create a new folder
router.post('/', protect, async (req, res) => {
  try {
    const { name, code, semester, description } = req.body;
    if (!name || !code) return res.status(400).json({ message: 'Subject name and code are required.' });

    const existing = await Folder.findOne({ code: { $regex: new RegExp('^' + code + '$', 'i') } });
    if (existing) return res.status(400).json({ message: 'A folder with this subject code already exists.' });

    const folder = await Folder.create({
      name, code, semester, description,
      createdBy: req.user._id,
      creatorName: req.user.name,
      creatorEmail: req.user.email
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { points: 10 } });

    await notifyAdmin('New Subject Folder Created', {
      Folder: name,
      Code: code,
      Semester: semester || '—',
      'Created By': req.user.name,
      Email: req.user.email
    });

    res.status(201).json({ message: 'Folder created! +10 points earned.', folder });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/folders/:id — delete folder (only creator or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found.' });

    const isOwner = folder.creatorEmail === req.user.email;
    const isAdmin = req.user.email === ADMIN_EMAIL;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You can only delete folders you created.' });
    }

    // Delete all files inside this folder too
    const filesInFolder = await Resource.find({ folderId: folder._id });
    for (const file of filesInFolder) {
      if (file.filePath) {
        const path = require('path');
        const fs = require('fs');
        const fp = path.join(__dirname, '../uploads', file.filePath);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    await Resource.deleteMany({ folderId: folder._id });
    await folder.deleteOne();

    await notifyAdmin('Folder Deleted', {
      Folder: folder.name,
      'Deleted By': req.user.name,
      Email: req.user.email
    });

    res.json({ message: 'Folder and all its files deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/folders/:id/files — get all files in a folder
router.get('/:id/files', protect, async (req, res) => {
  try {
    const { type, search } = req.query;
    let query = { folderId: req.params.id };
    if (type) query.type = type;
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } }
    ];
    const files = await Resource.find(query).sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
