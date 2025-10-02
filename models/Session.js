const mongoose = require('mongoose');
const { ASSIGNMENT_TYPES, DAYS_OF_WEEK } = require('../config/constants');

const sessionSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  duration: {
    type: Number,
    required: true,
    min: 15 // minimum 15 minutes
  },
  
  maxParticipants: {
    type: Number,
    min: 1
  },
  
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  
  venue: {
    type: String,
    required: true,
    trim: true
  },
  
  assignmentType: {
    type: String,
    enum: Object.values(ASSIGNMENT_TYPES),
    default: ASSIGNMENT_TYPES.OPEN
  },
  
  permanentInstructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  requiredQualifications: [String],
  
  timetableTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimetableTemplate',
    required: true
  },
  
  isActive: {
    type: Boolean,
    default: true
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
sessionSchema.index({ timetableTemplate: 1 });
sessionSchema.index({ dayOfWeek: 1, startTime: 1 });
sessionSchema.index({ permanentInstructor: 1 });
sessionSchema.index({ requiredQualifications: 1 });
sessionSchema.index({ isActive: 1 });

// Virtual for day name
sessionSchema.virtual('dayName').get(function() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[this.dayOfWeek];
});

// Method to check if time slot conflicts with another session
sessionSchema.methods.hasTimeConflict = function(otherSession) {
  if (this.dayOfWeek !== otherSession.dayOfWeek) return false;
  if (this.venue !== otherSession.venue) return false;
  
  const thisStart = this.startTime;
  const thisEnd = this.endTime;
  const otherStart = otherSession.startTime;
  const otherEnd = otherSession.endTime;
  
  return (thisStart < otherEnd && thisEnd > otherStart);
};

module.exports = mongoose.model('Session', sessionSchema);