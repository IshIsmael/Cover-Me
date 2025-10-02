const { AuditLog } = require('../models');

// Format time for display
const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
};

// Format date for display
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Get day name from number
const getDayName = (dayNumber) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber];
};

// Calculate duration between two times
const calculateDuration = (startTime, endTime) => {
  const start = new Date(`2000-01-01 ${startTime}:00`);
  const end = new Date(`2000-01-01 ${endTime}:00`);
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);
  
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

// Generate unique filename
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = path.extname(originalName);
  return `${timestamp}_${random}${extension}`;
};

// Log audit action helper
const logAuditAction = async (action, entityType, entityId, performedBy, details = {}, req = null) => {
  try {
    const auditData = {
      action,
      entityType,
      entityId,
      performedBy,
      details
    };
    
    if (req) {
      auditData.ipAddress = req.ip || req.connection.remoteAddress;
      auditData.userAgent = req.get('User-Agent');
    }
    
    await AuditLog.logAction(auditData);
  } catch (error) {
    console.error('Error logging audit action:', error);
    // Don't throw error to avoid breaking main functionality
  }
};

// Check if instructor has required qualification
const hasRequiredQualification = (instructor, requiredQualifications) => {
  if (!instructor.instructorData || !instructor.instructorData.qualifications) {
    return false;
  }
  
  if (!requiredQualifications || requiredQualifications.length === 0) {
    return true;
  }
  
  return requiredQualifications.some(required => 
    instructor.instructorData.qualifications.includes(required)
  );
};

// Calculate earnings estimate
const calculateEarnings = (hours, rate) => {
  return (hours * rate).toFixed(2);
};

// Get time until date
const getTimeUntil = (targetDate) => {
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target - now;
  
  if (diffMs <= 0) return 'Past due';
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }
  
  return `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
};

module.exports = {
  formatTime,
  formatDate,
  getDayName,
  calculateDuration,
  generateUniqueFilename,
  logAuditAction,
  hasRequiredQualification,
  calculateEarnings,
  getTimeUntil
};