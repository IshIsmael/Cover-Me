var express = require('express');
var router = express.Router();

/* GET home page - redirect to login */
router.get('/', function(req, res, next) {
  // Check if user exists in session
  if (req.session && req.session.userId) {
    // User is logged in, check their role
    const { User } = require('../models');
    User.findById(req.session.userId).then(user => {
      if (user) {
        if (user.role === 'admin') {
          return res.redirect('/admin/dashboard');
        } else if (user.role === 'instructor') {
          return res.redirect('/instructor/timetable');
        }
      }
      // If no user found, redirect to login
      res.redirect('/auth/login');
    }).catch(err => {
      console.error('Error checking user:', err);
      res.redirect('/auth/login');
    });
  } else {
    // No session, redirect to login
    res.redirect('/auth/login');
  }
});

module.exports = router;