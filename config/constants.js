module.exports = {
    USER_ROLES: {
      ADMIN: 'admin',
      INSTRUCTOR: 'instructor'
    },
    
    USER_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved', 
      REJECTED: 'rejected',
      SUSPENDED: 'suspended'
    },
    
    ASSIGNMENT_TYPES: {
      PERMANENT: 'permanent',
      OPEN: 'open',
      COVER_NEEDED: 'cover_needed'
    },
    
    TEMPLATE_TYPES: {
      WEEKLY: 'weekly',
      BI_WEEKLY: 'bi-weekly'
    },
    
    TEMPLATE_STATUS: {
      DRAFT: 'draft',
      ACTIVE: 'active',
      ARCHIVED: 'archived'
    },
    
    COVER_REQUEST_STATUS: {
      OPEN: 'open',
      ACCEPTED: 'accepted',
      CONFIRMED: 'confirmed',
      CANCELLED: 'cancelled',
      COMPLETED: 'completed'
    },
    
    COVER_URGENCY: {
      URGENT: 'urgent',
      NORMAL: 'normal',
      ADVANCE_PLANNED: 'advance_planned'
    },
    
    DOCUMENT_TYPES: {
      QUALIFICATION: 'qualification',
      INSURANCE: 'insurance',
      DBS_CHECK: 'dbs_check'
    },
    
    DOCUMENT_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      EXPIRED: 'expired'
    },
    
    NOTIFICATION_PREFERENCES: {
      IMMEDIATE: 'immediate',
      DAILY: 'daily',
      WEEKLY: 'weekly',
      OFF: 'off'
    },
    
    PAYMENT_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      PAID: 'paid'
    },
    
    DAYS_OF_WEEK: {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6
    },
    
    // Validation constants
    VALIDATION: {
      MIN_PASSWORD_LENGTH: 8,
      MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
      ALLOWED_FILE_TYPES: ['.pdf', '.jpg', '.jpeg', '.png'],
      RETENTION_PERIOD_DAYS: 366 // 1 year + 1 day
    }
  };