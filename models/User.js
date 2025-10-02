const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES, USER_STATUS, NOTIFICATION_PREFERENCES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  password: {
    type: String,
    required: true,
    minlength: process.env.MIN_PASSWORD_LENGTH || 8
  },
  
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    required: true
  },
  
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.PENDING
  },
  
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    emergencyContact: {
      name: String,
      phone: String
    }
  },
  
  instructorData: {
    type: {
      qualifications: [String],
      hourlyRate: {
        type: Number,
        min: 0
      },
      maxHoursPerWeek: {
        type: Number,
        min: 0
      },
      preferences: {
        emailDigest: {
          type: String,
          enum: Object.values(NOTIFICATION_PREFERENCES),
          default: NOTIFICATION_PREFERENCES.IMMEDIATE
        },
        coverTypes: [String],
        minNoticeHours: {
          type: Number,
          default: 24
        },
        maxDistanceFromVenue: Number
      },
      stats: {
        totalHoursWorked: {
          type: Number,
          default: 0
        },
        sessionsThisMonth: {
          type: Number,
          default: 0
        },
        coversAcceptedThisMonth: {
          type: Number,
          default: 0
        },
        reliabilityScore: {
          type: Number,
          min: 1,
          max: 5,
          default: 5
        },
        lastActive: Date
      }
    },
    default: null
  },
  
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'instructorData.qualifications': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user is instructor
userSchema.methods.isInstructor = function() {
  return this.role === USER_ROLES.INSTRUCTOR;
};

// Method to check if user is admin
userSchema.methods.isAdmin = function() {
  return this.role === USER_ROLES.ADMIN;
};

// Method to check if instructor is approved
userSchema.methods.isApproved = function() {
  return this.status === USER_STATUS.APPROVED;
};

module.exports = mongoose.model('User', userSchema);