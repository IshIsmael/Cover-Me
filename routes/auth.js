var express = require('express');
var router = express.Router();
var { User } = require('../models');
var { requireAuth } = require('../middleware/auth');
var { validateUserRegistration, validateLogin } = require('../middleware/validation');
var { logAuditAction } = require('../utils/helpers');
var { USER_ROLES, USER_STATUS } = require('../config/constants');

/* GET login page */
router.get('/login', function(req, res, next) {
  // Redirect if already logged in
  if (req.session.userId) {
    return res.redirect('/');
  }
  
  res.render('auth/login', { 
    title: 'Login - Southgate Leisure Centre'
  });
});

/* POST login */
router.post('/login', validateLogin, async function(req, res, next) {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/auth/login');
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/auth/login');
    }
    
    // Check if instructor is approved
    if (user.isInstructor() && !user.isApproved()) {
      req.flash('error', 'Your account is pending admin approval. Please wait for confirmation.');
      return res.redirect('/auth/login');
    }
    
    // Log successful login
    await logAuditAction('user_login', 'User', user._id, user._id, {}, req);
    
    // Set session and redirect
    req.session.userId = user._id;
    req.flash('success', `Welcome back, ${user.profile.firstName}!`);
    
    // Redirect based on role
    if (user.isAdmin()) {
      return res.redirect('/admin/dashboard');
    } else {
      return res.redirect('/instructor/timetable');
    }
    
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'An error occurred during login');
    res.redirect('/auth/login');
  }
});

/* GET register page */
router.get('/register', function(req, res, next) {
  // Redirect if already logged in
  if (req.session.userId) {
    return res.redirect('/');
  }
  
  res.render('auth/register', { 
    title: 'Register - Southgate Leisure Centre'
  });
});

/* POST register */
router.post('/register', validateUserRegistration, async function(req, res, next) {
  try {
    const { email, password, firstName, lastName, phone, emergencyContactName, emergencyContactPhone } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      req.flash('error', 'An account with this email already exists');
      return res.redirect('/auth/register');
    }
    
    // Create new instructor user
    const newUser = new User({
      email,
      password,
      role: USER_ROLES.INSTRUCTOR,
      status: USER_STATUS.PENDING,
      profile: {
        firstName,
        lastName,
        phone
      },
      instructorData: {
        qualifications: [],
        preferences: {
          emailDigest: 'immediate',
          coverTypes: [],
          minNoticeHours: 24
        },
        stats: {
          totalHoursWorked: 0,
          sessionsThisMonth: 0,
          coversAcceptedThisMonth: 0,
          reliabilityScore: 5
        }
      }
    });
    
    // Add emergency contact if provided
    if (emergencyContactName && emergencyContactPhone) {
      newUser.profile.emergencyContact = {
        name: emergencyContactName,
        phone: emergencyContactPhone
      };
    }
    
    await newUser.save();
    
    // Log registration
    await logAuditAction('user_registered', 'User', newUser._id, newUser._id, {
      email: newUser.email,
      role: newUser.role
    }, req);
    
    // Redirect to login with success message
    req.flash('success', 'Registration successful! Your account is pending admin approval. You will be notified once approved.');
    res.redirect('/auth/login');
    
  } catch (error) {
    console.error('Registration error:', error);
    req.flash('error', 'An error occurred during registration');
    res.redirect('/auth/register');
  }
});

/* GET logout */
router.get('/logout', function(req, res, next) {
  const userId = req.session.userId;
  
  req.session.destroy(function(err) {
    if (err) {
      console.error('Logout error:', err);
    }
    
    // Log logout if we had a user
    if (userId) {
      logAuditAction('user_logout', 'User', userId, userId, {}, req);
    }
    
    res.redirect('/auth/login');
  });
});

module.exports = router;