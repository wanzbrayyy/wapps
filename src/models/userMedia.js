const mongoose = require('mongoose');

const mediaCommentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true }
}, { timestamps: true, _id: true });

const userMediaSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  downloadUrl: { type: String, required: true },
  storageKey: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], required: true },
  mimeType: { type: String, default: '' },
  name: { type: String, default: '' },
  caption: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  size: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [mediaCommentSchema]
}, { timestamps: true });

module.exports = mongoose.model('UserMedia', userMediaSchema);
