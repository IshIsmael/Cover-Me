const { body, validationResult } = require('express-validator');
const { USER_ROLES, VALIDATION } = require('../config/constants');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('errors', errors.array());
    return res.redirect('back');
  }
  next();
};

// User registration validation
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .isLength({ min: VALIDATION.MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${VALIDATION.MIN_PASSWORD_LENGTH} characters long`),
    
  body('firstName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('First name is required'),
    
  body('lastName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Last name is required'),
    
  body('phone')
    .optional()
    .isMobilePhone('en-GB')
    .withMessage('Please provide a valid UK phone number'),
    
  handleValidationErrors
];

// Login validation
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
    
  handleValidationErrors
];

// Session validation
const validateSession = [
  body('className')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Class name is required'),
    
  body('duration')
    .isInt({ min: 15, max: 300 })
    .withMessage('Duration must be between 15 and 300 minutes'),
    
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
    
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
    
  body('dayOfWeek')
    .isInt({ min: 0, max: 6 })
    .withMessage('Day of week must be between 0 and 6'),
    
  body('venue')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Venue is required'),
    
  handleValidationErrors
];

// Cover request validation
const validateCoverRequest = [
  body('session')
    .isMongoId()
    .withMessage('Valid session ID is required'),
    
  body('coverDate')
    .isISO8601()
    .withMessage('Valid cover date is required'),
    
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
    
  handleValidationErrors
];

// File upload validation
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'Please select a file to upload');
    return res.redirect('back');
  }
  
  // Check file size
  if (req.file.size > VALIDATION.MAX_FILE_SIZE) {
    req.flash('error', 'File size must be less than 10MB');
    return res.redirect('back');
  }
  
  // Check file type
  const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  
  if (!allowedTypes.includes(fileExtension)) {
    req.flash('error', 'Only PDF, JPG, JPEG, and PNG files are allowed');
    return res.redirect('back');
  }
  
  next();
};

module.exports = {
  validateUserRegistration,
  validateLogin,
  validateSession,
  validateCoverRequest,
  validateFileUpload,
  handleValidationErrors
};