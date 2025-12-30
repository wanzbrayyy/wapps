const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: String,
  date: Date,
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const roomSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
  
  // Participants & Roles
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Kick/Ban
  bannedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Scheduled Events
  events: [eventSchema]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);