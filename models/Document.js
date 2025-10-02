const mongoose = require('mongoose');
const { DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../config/constants');

const documentSchema = new mongoose.Schema({
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  documentType: {
    type: String,
    enum: Object.values(DOCUMENT_TYPES),
    required: true
  },
  
  qualificationType: {
    type: String,
    trim: true
  },
  
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  
  filePath: {
    type: String,
    required: true
  },
  
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  
  status: {
    type: String,
    enum: Object.values(DOCUMENT_STATUS),
    default: DOCUMENT_STATUS.PENDING
  },
  
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  reviewedAt: Date,
  
  reviewNotes: {
    type: String,
    trim: true
  },
  
  issueDate: Date,
  
  expiryDate: Date,
  
  isRequired: {
    type: Boolean,
    default: true
  },
  
  remindersSent: [Date]
}, {
  timestamps: true
});

// Indexes
documentSchema.index({ instructor: 1, documentType: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ expiryDate: 1 });
documentSchema.index({ reviewedBy: 1 });

// Virtual to check if document is expired
documentSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Virtual to check if document is expiring soon (30 days)
documentSchema.virtual('isExpiringSoon').get(function() {
  if (!this.expiryDate) return false;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expiryDate <= thirtyDaysFromNow && this.expiryDate > new Date();
});

// Method to check if document is approved
documentSchema.methods.isApproved = function() {
  return this.status === DOCUMENT_STATUS.APPROVED;
};

// Method to check if document needs review
documentSchema.methods.needsReview = function() {
  return this.status === DOCUMENT_STATUS.PENDING;
};

// Method to add reminder sent timestamp
documentSchema.methods.addReminderSent = function() {
  this.remindersSent.push(new Date());
  return this.save();
};

// Pre-save middleware to update status if expired
documentSchema.pre('save', function(next) {
  if (this.expiryDate && new Date() > this.expiryDate && this.status === DOCUMENT_STATUS.APPROVED) {
    this.status = DOCUMENT_STATUS.EXPIRED;
  }
  next();
});

module.exports = mongoose.model('Document', documentSchema);