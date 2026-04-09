const mongoose = require('mongoose');

const roomMessageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    default: '',
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'system', 'gif', 'sticker'],
    default: 'text'
  },
  fileInfo: {
    url: { type: String, default: '' },
    downloadUrl: { type: String, default: '' },
    storageKey: { type: String, default: '' },
    name: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    thumbnail: { type: String, default: '' },
    stickerId: { type: String, default: '' },
    label: { type: String, default: '' }
  },
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoomMessage',
    default: null
  },
  threadRoot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoomMessage',
    default: null
  },
  isPinned: { type: Boolean, default: false },
  pinnedAt: { type: Date, default: null },
  deletedForEveryone: { type: Boolean, default: false },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('RoomMessage', roomMessageSchema);
