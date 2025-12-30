const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true },
  isRead: { type: Boolean, default: false },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['like', 'love', 'laugh', 'sad', 'angry'] }
  }],
  expireAt: { type: Date, default: undefined }
}, { timestamps: true });
chatSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Chat', chatSchema);