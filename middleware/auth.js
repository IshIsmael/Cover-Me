const { User } = require('../models');
const { USER_ROLES, USER_STATUS } = require('../config/constants');

// Check if user is authenticated
const requireAuth = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    req.user = user;
    res.locals.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).render('error', { 
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

// Check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.isAdmin()) {
      return res.status(403).render('error', {
        message: 'Access denied. Admin privileges required.',
        error: {}
      });
    }
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).render('error', {
      message: 'Authorization error',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

// Check if user is instructor
const requireInstructor = async (req, res, next) => {
  try {
    if (!req.user || !req.user.isInstructor()) {
      return res.status(403).render('error', {
        message: 'Access denied. Instructor privileges required.',
        error: {}
      });
    }
    next();
  } catch (error) {
    console.error('Instructor auth middleware error:', error);
    res.status(500).render('error', {
      message: 'Authorization error',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

// Check if instructor is approved
const requireApprovedInstructor = async (req, res, next) => {
  try {
    if (!req.user || !req.user.isInstructor() || !req.user.isApproved()) {
      return res.render('instructor/pending-approval', {
        title: 'Pending Approval',
        user: req.user
      });
    }
    next();
  } catch (error) {
    console.error('Approved instructor middleware error:', error);
    res.status(500).render('error', {
      message: 'Authorization error',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

// Redirect based on user role
const redirectByRole = (req, res, next) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  if (req.user.isAdmin()) {
    return res.redirect('/admin/dashboard');
  }
  
  if (req.user.isInstructor()) {
    if (req.user.isApproved()) {
      return res.redirect('/instructor/timetable');
    } else {
      return res.redirect('/instructor/pending');
    }
  }
  
  res.redirect('/login');
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireInstructor,
  requireApprovedInstructor,
  redirectByRole
};