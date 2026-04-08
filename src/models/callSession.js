const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['offer', 'answer', 'ice'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false, timestamps: true });

const callSessionSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callType: { type: String, enum: ['voice', 'video'], required: true },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'accepted', 'declined', 'ended', 'missed'],
    default: 'initiated'
  },
  roomId: { type: String, default: '' },
  signals: { type: [signalSchema], default: [] },
  startedAt: { type: Date, default: Date.now },
  answeredAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

callSessionSchema.index({ caller: 1, callee: 1, createdAt: -1 });

module.exports = mongoose.model('CallSession', callSessionSchema);
