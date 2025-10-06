var express = require('express');
var router = express.Router();

/* GET home page - redirect to login */
router.get('/', function(req, res, next) {
  // If user is already logged in, redirect to their dashboard
  if (req.isAuthenticated()) {
    if (req.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    } else if (req.user.role === 'instructor') {
      return res.redirect('/instructor/timetable');
    }
  }
  
  // Otherwise redirect to login
  res.redirect('/auth/login');
});

module.exports = router;