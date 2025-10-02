var express = require('express');
var router = express.Router();
var { requireAuth, requireInstructor, requireApprovedInstructor } = require('../middleware/auth');

// Apply authentication middleware to all instructor routes
router.use(requireAuth);
router.use(requireInstructor);
router.use(requireApprovedInstructor);

/* GET instructor test page */
router.get('/test', function(req, res, next) {
  res.render('instructor/test', {
    title: 'Instructor Test Page - Southgate Leisure Centre',
    user: req.user
  });
});

/* GET instructor timetable (placeholder) */
router.get('/timetable', function(req, res, next) {
  res.render('instructor/test', {
    title: 'My Timetable - Southgate Leisure Centre',
    user: req.user
  });
});

module.exports = router;