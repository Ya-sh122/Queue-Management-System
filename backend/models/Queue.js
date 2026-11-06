const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ['waiting', 'in_service', 'completed', 'cancelled'],
    default: 'waiting'
  },
  position: { type: Number, required: true },
  joinedAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date
});

const queueSchema = new mongoose.Schema(
  {
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager', required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 160 },
    nextNumber: { type: Number, default: 1 },
    tokens: [tokenSchema]
  },
  { timestamps: true, optimisticConcurrency: true }
);

module.exports = mongoose.model('Queue', queueSchema);
