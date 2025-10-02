const mongoose = require('mongoose');
const { COVER_REQUEST_STATUS, COVER_URGENCY, PAYMENT_STATUS } = require('../config/constants');

const notificationSchema = new mongoose.Schema({
  sentTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    required: true
  }
}, { _id: false });

const coverRequestSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  
  coverDate: {
    type: Date,
    required: true
  },
  
  reason: {
    type: String,
    trim: true
  },
  
  urgency: {
    type: String,
    enum: Object.values(COVER_URGENCY),
    default: COVER_URGENCY.NORMAL
  },
  
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  requestedFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  status: {
    type: String,
    enum: Object.values(COVER_REQUEST_STATUS),
    default: COVER_REQUEST_STATUS.OPEN
  },
  
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  requestedAt: {
    type: Date,
    default: Date.now
  },
  
  acceptedAt: Date,
  confirmedAt: Date,
  
  sessionDateTime: {
    type: Date,
    required: true
  },
  
  notificationsSent: [notificationSchema],
  
  paymentRate: {
    type: Number,
    min: 0
  },
  
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING
  }
}, {
  timestamps: true
});

// Indexes
coverRequestSchema.index({ status: 1, sessionDateTime: 1 });
coverRequestSchema.index({ requestedBy: 1 });
coverRequestSchema.index({ acceptedBy: 1 });
coverRequestSchema.index({ sessionDateTime: 1 });
coverRequestSchema.index({ session: 1 });

// Method to check if cover request is still open
coverRequestSchema.methods.isOpen = function() {
  return this.status === COVER_REQUEST_STATUS.OPEN;
};

// Method to check if cover request is past due
coverRequestSchema.methods.isPastDue = function() {
  return new Date() > this.sessionDateTime;
};

module.exports = mongoose.model('CoverRequest', coverRequestSchema);