const mongoose = require('mongoose');
const fileInfoSchema = new mongoose.Schema({
  url: String,
  name: String,
  size: Number,
  mimeType: String,
  duration: Number, 
  thumbnail: String
}, { _id: false });
const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  address: String
}, { _id: false });

const chatSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  message: { type: String, trim: true },
  type: { 
    type: String, 
    enum: ['text', 'image', 'file', 'audio', 'video', 'sticker', 'location', 'system'], 
    default: 'text' 
  },
  
  fileInfo: { type: fileInfoSchema },
  location: { type: locationSchema },

  isRead: { type: Boolean, default: false },
  readAt: { type: Date }, 
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  reactions: [{ 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    type: { type: String, enum: ['like', 'love', 'laugh', 'sad', 'angry', 'wow'] } 
  }],
  expireAt: { type: Date, default: undefined },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]

}, { timestamps: true });
chatSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 0 });
chatSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);