const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: '', maxlength: 250 },
  profilePic: { type: String, default: 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg' },
  cloudinaryId: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  coins: { type: Number, default: 1000 },
  
  // Dating Profile Fields
  birthDate: { type: Date },
  gender: { type: String, enum: ['Man', 'Woman', 'Other'] },
  interestedIn: { type: String, enum: ['Men', 'Women', 'Everyone'], default: 'Everyone' },

  // Location for Nearby Users
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
  },
  
  // Compatibility Fields
  zodiac: { type: String, default: '' },
  mbti: { type: String, default: '' },
  
  // Matchmaking Data
  swiped: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, enum: ['like', 'dislike'] }
  }],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Profile Visitors
  profileVisitors: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],

  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

// Geospatial index for nearby queries
userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', userSchema);