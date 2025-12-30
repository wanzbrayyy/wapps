const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  liker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  liked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

likeSchema.index({ liker: 1, liked: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);