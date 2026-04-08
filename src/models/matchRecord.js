const mongoose = require('mongoose');

const matchRecordSchema = new mongoose.Schema({
  userA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  matchedByAction: {
    type: String,
    enum: ['like', 'superlike', 'instant', 'rematch'],
    default: 'like'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'unmatched'],
    default: 'active'
  },
  matchedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  extendedAt: {
    type: Date,
    default: null
  },
  rematchedAt: {
    type: Date,
    default: null
  },
  lastInteractionAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

matchRecordSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchRecordSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('MatchRecord', matchRecordSchema);
