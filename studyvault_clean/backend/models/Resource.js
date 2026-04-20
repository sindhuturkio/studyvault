const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorName: String,
  text: String,
  stars: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now }
});

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Notes', 'Past Paper', 'Assignment'], required: true },
  semester: String,
  description: String,
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  folderName: { type: String, default: null },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploaderName: String,
  uploaderEmail: String,
  fileName: String,
  filePath: String,
  fileSize: Number,
  downloads: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: [commentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Resource', resourceSchema);
