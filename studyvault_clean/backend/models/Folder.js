const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, unique: true },
  semester: String,
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creatorName: String,
  creatorEmail: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Folder', folderSchema);
