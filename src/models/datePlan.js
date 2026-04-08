const mongoose = require('mongoose');

const datePlanSchema = new mongoose.Schema({
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduledAt: { type: Date, required: true },
  locationLabel: { type: String, required: true, trim: true },
  vibe: { type: String, default: '' },
  note: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'completed', 'cancelled'],
    default: 'pending'
  }
}, { timestamps: true });

datePlanSchema.index({ creator: 1, invitee: 1, scheduledAt: -1 });

module.exports = mongoose.model('DatePlan', datePlanSchema);
