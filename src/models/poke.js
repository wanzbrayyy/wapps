const mongoose = require('mongoose');

const pokeSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, default: '' },
  status: {
    type: String,
    enum: ['sent', 'opened'],
    default: 'sent'
  }
}, { timestamps: true });

pokeSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Poke', pokeSchema);
