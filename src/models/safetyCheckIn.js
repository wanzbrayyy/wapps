const mongoose = require('mongoose');

const safetyCheckInSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  datePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'DatePlan', default: null },
  scheduledFor: { type: Date, required: true },
  locationLabel: { type: String, default: '' },
  emergencyNote: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'safe', 'missed'],
    default: 'pending'
  },
  checkedInAt: { type: Date, default: null }
}, { timestamps: true });

safetyCheckInSchema.index({ user: 1, scheduledFor: -1 });

module.exports = mongoose.model('SafetyCheckIn', safetyCheckInSchema);
