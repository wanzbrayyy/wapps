const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: [
      'chat_message',
      'room_mention',
      'room_reply',
      'room_pin',
      'call_invite',
      'system'
    ],
    default: 'system'
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  pushStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending'
  },
  deliveredAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
