const mongoose = require('mongoose');

const chatPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallpaper: { type: String, default: '' }, 
  isPinned: { type: Boolean, default: false }
});

chatPreferenceSchema.index({ user: 1, targetUser: 1 }, { unique: true });

module.exports = mongoose.model('ChatPreference', chatPreferenceSchema);