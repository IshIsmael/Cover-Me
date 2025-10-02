const mongoose = require('mongoose');
const { VALIDATION } = require('../config/constants');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    trim: true
  },
  
  entityType: {
    type: String,
    required: true,
    trim: true
  },
  
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  performedAt: {
    type: Date,
    default: Date.now
  },
  
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  ipAddress: {
    type: String,
    trim: true
  },
  
  userAgent: {
    type: String,
    trim: true
  },
  
  retainUntil: {
    type: Date,
    default: function() {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() + VALIDATION.RETENTION_PERIOD_DAYS);
      return retentionDate;
    }
  }
}, {
  timestamps: false // We're using performedAt instead
});

// TTL Index for automatic deletion
auditLogSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0 });
auditLogSchema.index({ performedBy: 1, performedAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });

// Static method to log an action
auditLogSchema.statics.logAction = async function(actionData) {
  try {
    const {
      action,
      entityType,
      entityId,
      performedBy,
      details = {},
      ipAddress,
      userAgent
    } = actionData;
    
    const logEntry = new this({
      action,
      entityType,
      entityId,
      performedBy,
      details,
      ipAddress,
      userAgent
    });
    
    await logEntry.save();
    return logEntry;
  } catch (error) {
    console.error('Error logging audit action:', error);
    // Don't throw error to avoid breaking main functionality
    return null;
  }
};

// Static method to get user activity
auditLogSchema.statics.getUserActivity = function(userId, limit = 50) {
  return this.find({ performedBy: userId })
    .sort({ performedAt: -1 })
    .limit(limit)
    .populate('performedBy', 'profile.firstName profile.lastName email');
};

// Static method to get entity history
auditLogSchema.statics.getEntityHistory = function(entityType, entityId, limit = 20) {
  return this.find({ entityType, entityId })
    .sort({ performedAt: -1 })
    .limit(limit)
    .populate('performedBy', 'profile.firstName profile.lastName email');
};

module.exports = mongoose.model('AuditLog', auditLogSchema);