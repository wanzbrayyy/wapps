const mongoose = require('mongoose');

const missionProgressSchema = new mongoose.Schema({
  lastLoginClaim: { type: Date },
  messagesSent: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  swipesMade: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  superLikeSent: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  roomsJoined: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  roomMessageSent: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  giftSent: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  profileUpdated: { lastClaim: { type: Date } },
  likeReceived: { count: { type: Number, default: 0 }, lastClaim: { type: Date } },
  appShared: { lastClaim: { type: Date } },
}, { _id: false });

const notificationSettingsSchema = new mongoose.Schema({
  newChat: { type: Boolean, default: true },
  profileVisitor: { type: Boolean, default: true },
  newFollower: { type: Boolean, default: true },
  incomingCall: { type: Boolean, default: true },
  matchUpdates: { type: Boolean, default: true },
}, { _id: false });

const matchSettingsSchema = new mongoose.Schema({
  minAge: { type: Number, default: 18 },
  maxAge: { type: Number, default: 99 },
  maxDistanceKm: { type: Number, default: 5000 },
  preferredGender: { type: String, enum: ['Men', 'Women', 'Everyone'], default: 'Everyone' },
  globalMode: { type: Boolean, default: false },
  autoReply: { type: String, default: '' },
  education: { type: String, default: '' },
  religion: { type: String, default: '' },
  smoking: { type: String, default: '' },
  relationshipIntent: { type: String, default: '' }
}, { _id: false });

const matchExtensionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  extendedAt: { type: Date, default: Date.now }
}, { _id: false });

const availabilitySchema = new mongoose.Schema({
  day: { type: String, required: true },
  startHour: { type: String, required: true },
  endHour: { type: String, required: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: '' },
  profilePic: { type: String, default: 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg' },
  cloudinaryId: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  coins: { type: Number, default: 1000 },
  
  missionProgress: { type: missionProgressSchema, default: {} },

  birthDate: { type: Date },
  gender: { type: String, enum: ['Man', 'Woman', 'Other'] },
  interestedIn: { type: String, enum: ['Men', 'Women', 'Everyone'] },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
  travelLocation: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number] } },
  height: { type: Number },
  education: { type: String },
  religion: { type: String },
  smoking: { type: String, enum: ['Yes', 'No', 'Sometimes'] },
  relationshipIntent: { type: String, enum: ['Serious', 'Casual', 'Friends'] },
  zodiacSign: { type: String, default: '' },
  mbti: { type: String, default: '' },
  passions: [{ type: String }],
  
  isOnline: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now },
  isLive: { type: Boolean, default: false },
  currentRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  accountStatus: { type: String, enum: ['Active', 'Paused', 'Suspended'], default: 'Active' },

  gallery: [{ type: String }],
  voiceBio: { type: String, default: '' },
  videoBio: { type: String, default: '' },
  instagramHandle: { type: String, default: '' },
  spotifyAnthem: { type: String, default: '' },

  swiped: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: { type: String, enum: ['like', 'dislike', 'superlike'] } }],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  matchExtensions: { type: [matchExtensionSchema], default: [] },
  matchSettings: { type: matchSettingsSchema, default: () => ({}) },
  boostExpiresAt: { type: Date },
  
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  fcmToken: { type: String, default: '' },
  darkMode: { type: Boolean, default: false },
  
  notificationSettings: { type: notificationSettingsSchema, default: () => ({}) },
  
  profileVisitors: [{
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visitedAt: { type: Date, default: Date.now }
  }],

  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dateAvailability: { type: [availabilitySchema], default: [] },
  
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });
userSchema.index({ travelLocation: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
