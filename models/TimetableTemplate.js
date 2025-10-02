const mongoose = require('mongoose');
const { TEMPLATE_TYPES, TEMPLATE_STATUS } = require('../config/constants');

const timetableTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  type: {
    type: String,
    enum: Object.values(TEMPLATE_TYPES),
    required: true
  },
  
  status: {
    type: String,
    enum: Object.values(TEMPLATE_STATUS),
    default: TEMPLATE_STATUS.DRAFT
  },
  
  effectiveFrom: {
    type: Date,
    required: true
  },
  
  effectiveTo: {
    type: Date,
    required: true
  },
  
  sessionCount: {
    type: Number,
    default: 0
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
timetableTemplateSchema.index({ status: 1 });
timetableTemplateSchema.index({ effectiveFrom: 1, effectiveTo: 1 });
timetableTemplateSchema.index({ createdBy: 1 });

// Virtual to check if template is currently active
timetableTemplateSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.status === TEMPLATE_STATUS.ACTIVE && 
         now >= this.effectiveFrom && 
         now <= this.effectiveTo;
});

// Method to check if date falls within template period
timetableTemplateSchema.methods.isDateInRange = function(date) {
  return date >= this.effectiveFrom && date <= this.effectiveTo;
};

// Pre-save middleware to validate date range
timetableTemplateSchema.pre('save', function(next) {
  if (this.effectiveFrom >= this.effectiveTo) {
    return next(new Error('Effective from date must be before effective to date'));
  }
  next();
});

module.exports = mongoose.model('TimetableTemplate', timetableTemplateSchema);