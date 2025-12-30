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
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'system'],
    default: 'text'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('RoomMessage', roomMessageSchema);