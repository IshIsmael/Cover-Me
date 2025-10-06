var express = require('express');
var router = express.Router();
var { Session, TimetableTemplate, CoverRequest } = require('../models');
var { requireAuth, requireInstructor, requireApprovedInstructor } = require('../middleware/auth');
var { logAuditAction } = require('../utils/helpers');
var { TEMPLATE_STATUS } = require('../config/constants');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Apply authentication middleware to all instructor routes
router.use(requireAuth);
router.use(requireInstructor);
router.use(requireApprovedInstructor);

/* GET instructor timetable */
router.get('/timetable', async function(req, res, next) {
  try {
    const weekOffset = parseInt(req.query.weekOffset) || 0;

    // Get current date and time in UK timezone
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    
    // Calculate start of current week (Monday)
    const currentWeekStart = new Date(ukTime);
    currentWeekStart.setDate(ukTime.getDate() - ukTime.getDay() + (ukTime.getDay() === 0 ? -6 : 1));
    currentWeekStart.setHours(0, 0, 0, 0);

    // Apply week offset
    const startOfWeek = new Date(currentWeekStart);
    startOfWeek.setDate(startOfWeek.getDate() + (weekOffset * 7));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Get active timetable
    const activeTimetable = await TimetableTemplate.findOne({
      status: TEMPLATE_STATUS.ACTIVE
    });

    let mySessions = [];
    let todaySessions = [];
    let upcomingSessions = [];
    let canGoPrevious = true;
    let canGoNext = true;

    if (activeTimetable) {
      // Check navigation limits based on template dates
      const templateStart = new Date(activeTimetable.effectiveFrom);
      templateStart.setHours(0, 0, 0, 0);
      
      const templateEnd = new Date(activeTimetable.effectiveTo);
      templateEnd.setHours(23, 59, 59, 999);

      // Can't go before template start
      const previousWeekStart = new Date(startOfWeek);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      canGoPrevious = previousWeekStart >= templateStart;

      // Can't go after template end
      const nextWeekEnd = new Date(endOfWeek);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      canGoNext = nextWeekEnd <= templateEnd;

      // Get all sessions where this instructor is the permanent instructor
      const sessions = await Session.find({
        timetableTemplate: activeTimetable._id,
        permanentInstructor: req.user._id,
        isActive: true
      }).sort({ dayOfWeek: 1, startTime: 1 });

      // Get cover requests for these sessions in this week
      const sessionIds = sessions.map(s => s._id);
      const coverRequests = await CoverRequest.find({
        session: { $in: sessionIds },
        coverDate: { $gte: startOfWeek, $lte: endOfWeek },
        status: { $in: ['open', 'accepted', 'confirmed'] }
      });

      // Map cover requests by session and date
      const coverMap = {};
      coverRequests.forEach(cr => {
        const key = `${cr.session}_${cr.coverDate.toDateString()}`;
        coverMap[key] = cr;
      });

      // Build session list for the week
      const today = new Date(ukTime);
      today.setHours(0, 0, 0, 0);

      for (let date = new Date(startOfWeek); date <= endOfWeek; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        
        const daySessions = sessions.filter(s => s.dayOfWeek === dayOfWeek);
        
        daySessions.forEach(session => {
          const sessionDate = new Date(date);
          const [hours, minutes] = session.startTime.split(':');
          sessionDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          // Check if this session has a cover request
          const coverKey = `${session._id}_${date.toDateString()}`;
          const coverRequest = coverMap[coverKey];

          // Determine if cover can be requested
          // Can request if: future date, OR same day but before session time
          const isPast = sessionDate < ukTime;
          const isSameDay = date.toDateString() === today.toDateString();
          const canRequestCover = !isPast && !coverRequest;

          // Calculate time until session
          let timeUntil = null;
          if (isSameDay && !isPast) {
            const diff = sessionDate - ukTime;
            const hoursUntil = Math.floor(diff / (1000 * 60 * 60));
            const minutesUntil = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            if (hoursUntil > 0) {
              timeUntil = `In ${hoursUntil}h ${minutesUntil}m`;
            } else if (minutesUntil > 0) {
              timeUntil = `In ${minutesUntil}m`;
            } else {
              timeUntil = 'Starting now';
            }
          }

          const sessionData = {
            session,
            date: sessionDate,
            dateString: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
            dayName: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
            canRequestCover,
            coverRequest,
            isPast,
            isSameDay,
            timeUntil
          };

          mySessions.push(sessionData);

          // Categorize
          if (isSameDay) {
            todaySessions.push(sessionData);
          } else if (!isPast && date > today) {
            upcomingSessions.push(sessionData);
          }
        });
      }
    }

    res.render('instructor/timetable', {
      title: 'My Timetable - Southgate Leisure Centre',
      user: req.user,
      mySessions,
      todaySessions,
      upcomingSessions,
      startOfWeek,
      endOfWeek,
      today: ukTime,
      weekOffset,
      canGoPrevious,
      canGoNext
    });

  } catch (error) {
    console.error('Instructor timetable error:', error);
    req.flash('error', 'Error loading your timetable');
    res.render('instructor/timetable', {
      title: 'My Timetable - Southgate Leisure Centre',
      user: req.user,
      mySessions: [],
      todaySessions: [],
      upcomingSessions: [],
      startOfWeek: new Date(),
      endOfWeek: new Date(),
      today: new Date(),
      weekOffset: 0,
      canGoPrevious: false,
      canGoNext: false
    });
  }
});

/* POST request cover */
router.post('/cover/request', async function(req, res, next) {
  try {
    const { session, coverDate, reason } = req.body;

    // Validate session exists and belongs to this instructor
    const sessionDoc = await Session.findOne({
      _id: session,
      permanentInstructor: req.user._id
    });

    if (!sessionDoc) {
      req.flash('error', 'Session not found or not assigned to you');
      return res.redirect('/instructor/timetable');
    }

    // Parse cover date
    const coverDateObj = new Date(coverDate);
    
    // Get current UK time
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));

    // Create session datetime
    const [hours, minutes] = sessionDoc.startTime.split(':');
    const sessionDateTime = new Date(coverDateObj);
    sessionDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // Check if it's too late (session already started or passed)
    if (sessionDateTime < ukTime) {
      req.flash('error', 'Cannot request cover for sessions that have already started or passed');
      return res.redirect('/instructor/timetable');
    }

    // Check for duplicate cover request
    const existingCover = await CoverRequest.findOne({
      session: session,
      coverDate: coverDateObj,
      status: { $in: ['open', 'accepted', 'confirmed'] }
    });

    if (existingCover) {
      req.flash('error', 'Cover request already exists for this session on this date');
      return res.redirect('/instructor/timetable');
    }

    // Determine urgency based on time until session
    const hoursUntil = (sessionDateTime - ukTime) / (1000 * 60 * 60);
    let urgency = 'advance_planned';
    if (hoursUntil < 24) {
      urgency = 'urgent';
    } else if (hoursUntil < 72) {
      urgency = 'normal';
    }

    // Create cover request
    const newCoverRequest = new CoverRequest({
      session: session,
      coverDate: coverDateObj,
      sessionDateTime: sessionDateTime,
      urgency: urgency,
      reason: reason || '',
      requestedBy: req.user._id,
      requestedFor: req.user._id,
      status: 'open'
    });

    await newCoverRequest.save();

    // Log creation
    await logAuditAction(
      'instructor_cover_request',
      'CoverRequest',
      newCoverRequest._id,
      req.user._id,
      {
        sessionName: sessionDoc.className,
        coverDate: coverDateObj.toISOString()
      },
      req
    );

    // TODO: Send email notifications to eligible instructors

    req.flash('success', `Cover request submitted for ${sessionDoc.className} on ${coverDateObj.toLocaleDateString('en-GB')}`);
    res.redirect('/instructor/timetable');

  } catch (error) {
    console.error('Request cover error:', error);
    req.flash('error', 'Error submitting cover request');
    res.redirect('/instructor/timetable');
  }
});

/* GET test page */
router.get('/test', function(req, res, next) {
  res.render('instructor/test', {
    title: 'Instructor Test Page - Southgate Leisure Centre',
    user: req.user
  });
});


/* GET open cover page */
router.get('/open-cover', async function(req, res, next) {
  try {
    // Get current UK time
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));

    // Get instructor's qualifications
    const instructorQualifications = req.user.instructorData.qualifications || [];

    // Find open cover requests
    // Exclude: own requests, requests already accepted by this instructor, past sessions
    const openRequests = await CoverRequest.find({
      status: 'open',
      requestedFor: { $ne: req.user._id }, // Not their own requests
      sessionDateTime: { $gte: ukTime } // Not past sessions
    })
    .populate('session', 'className startTime endTime venue requiredQualifications')
    .populate('requestedFor', 'profile.firstName profile.lastName')
    .sort({ urgency: 1, sessionDateTime: 1 });

    // Filter by qualifications eligibility
    const eligibleRequests = openRequests.filter(request => {
      const requiredQuals = request.session.requiredQualifications || [];
      
      // If no qualifications required, everyone is eligible
      if (requiredQuals.length === 0) return true;
      
      // Check if instructor has at least one required qualification
      return requiredQuals.some(reqQual => 
        instructorQualifications.some(instQual => 
          instQual.toLowerCase().includes(reqQual.toLowerCase()) ||
          reqQual.toLowerCase().includes(instQual.toLowerCase())
        )
      );
    });

    // Find requests this instructor has accepted (awaiting admin confirmation)
    const acceptedRequests = await CoverRequest.find({
      status: 'accepted',
      acceptedBy: req.user._id
    })
    .populate('session', 'className startTime endTime venue')
    .populate('requestedFor', 'profile.firstName profile.lastName')
    .sort({ sessionDateTime: 1 });

    // Count urgent requests
    const urgentCount = eligibleRequests.filter(r => r.urgency === 'urgent').length;

    res.render('instructor/open-cover', {
      title: 'Open Cover - Southgate Leisure Centre',
      user: req.user,
      openRequests: eligibleRequests,
      acceptedRequests,
      urgentCount
    });

  } catch (error) {
    console.error('Open cover page error:', error);
    req.flash('error', 'Error loading cover opportunities');
    res.render('instructor/open-cover', {
      title: 'Open Cover - Southgate Leisure Centre',
      user: req.user,
      openRequests: [],
      acceptedRequests: [],
      urgentCount: 0
    });
  }
});

/* POST accept cover request */
router.post('/cover/accept/:id', async function(req, res, next) {
  try {
    const requestId = req.params.id;

    const coverRequest = await CoverRequest.findById(requestId)
      .populate('session', 'className requiredQualifications');

    if (!coverRequest) {
      req.flash('error', 'Cover request not found');
      return res.redirect('/instructor/open-cover');
    }

    // Check if still open
    if (coverRequest.status !== 'open') {
      req.flash('error', 'This cover request is no longer available');
      return res.redirect('/instructor/open-cover');
    }

    // Check if it's their own request
    if (coverRequest.requestedFor && coverRequest.requestedFor.toString() === req.user._id.toString()) {
      req.flash('error', 'You cannot accept your own cover request');
      return res.redirect('/instructor/open-cover');
    }

    // Get current UK time
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));

    // Check if session has already passed
    if (new Date(coverRequest.sessionDateTime) < ukTime) {
      req.flash('error', 'This session has already passed');
      return res.redirect('/instructor/open-cover');
    }

    // Check qualifications match
    const instructorQualifications = req.user.instructorData.qualifications || [];
    const requiredQuals = coverRequest.session.requiredQualifications || [];
    
    if (requiredQuals.length > 0) {
      const isQualified = requiredQuals.some(reqQual => 
        instructorQualifications.some(instQual => 
          instQual.toLowerCase().includes(reqQual.toLowerCase()) ||
          reqQual.toLowerCase().includes(instQual.toLowerCase())
        )
      );

      if (!isQualified) {
        req.flash('error', 'You do not meet the qualification requirements for this session');
        return res.redirect('/instructor/open-cover');
      }
    }

    // Accept the request
    coverRequest.status = 'accepted';
    coverRequest.acceptedBy = req.user._id;
    coverRequest.acceptedAt = new Date();
    await coverRequest.save();

    // Log acceptance
    await logAuditAction(
      'cover_request_accepted',
      'CoverRequest',
      coverRequest._id,
      req.user._id,
      {
        sessionName: coverRequest.session.className
      },
      req
    );

    // TODO: Send notification to admin about acceptance

    req.flash('success', `Cover request accepted! Waiting for admin confirmation for ${coverRequest.session.className}`);
    res.redirect('/instructor/open-cover');

  } catch (error) {
    console.error('Accept cover error:', error);
    req.flash('error', 'Error accepting cover request');
    res.redirect('/instructor/open-cover');
  }
});

/* GET stats and hours page */
router.get('/stats', async function(req, res, next) {
  try {
    // Get current UK time
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));

    // Get instructor's hourly rate (fallback to 25 if not set)
    const hourlyRate = req.user.instructorData.hourlyRate || 25;

    // Get all confirmed cover requests where this instructor taught
    const coverRequests = await CoverRequest.find({
      acceptedBy: req.user._id,
      status: 'confirmed',
      sessionDateTime: { $lt: ukTime } // Only past sessions
    })
    .populate('session', 'className duration')
    .sort({ coverDate: 1 });

    // Get all permanent sessions assigned to this instructor
    const permanentSessions = await Session.find({
      permanentInstructor: req.user._id,
      isActive: true
    })
    .populate('timetableTemplate', 'effectiveFrom effectiveTo status');

    // Calculate all occurrences of permanent sessions that have occurred
    const permanentSessionOccurrences = [];
    
    for (const session of permanentSessions) {
      const template = session.timetableTemplate;
      if (!template) continue;

      const templateStart = new Date(template.effectiveFrom);
      const templateEnd = new Date(template.effectiveTo);
      
      // Only count sessions up to current date
      const endDate = templateEnd < ukTime ? templateEnd : ukTime;

      // Find all occurrences of this session
      for (let date = new Date(templateStart); date <= endDate; date.setDate(date.getDate() + 1)) {
        if (date.getDay() === session.dayOfWeek) {
          const sessionDate = new Date(date);
          const [hours, minutes] = session.startTime.split(':');
          sessionDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          // Only count if session has already occurred
          if (sessionDate < ukTime) {
            permanentSessionOccurrences.push({
              date: new Date(date),
              session: session,
              sessionName: session.className,
              duration: session.duration,
              type: 'permanent'
            });
          }
        }
      }
    }

    // Organize data by month
    const monthlyData = {};

    // Process permanent sessions
    permanentSessionOccurrences.forEach(occurrence => {
      const monthKey = `${occurrence.date.getFullYear()}-${String(occurrence.date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          year: occurrence.date.getFullYear(),
          month: occurrence.date.getMonth(),
          sessions: 0,
          covers: 0,
          hours: 0,
          earnings: 0,
          breakdown: {}
        };
      }

      monthlyData[monthKey].sessions++;
      monthlyData[monthKey].hours += occurrence.duration / 60;
      monthlyData[monthKey].earnings += (occurrence.duration / 60) * hourlyRate;

      // Add to breakdown
      const breakdownKey = `permanent_${occurrence.session._id}`;
      if (!monthlyData[monthKey].breakdown[breakdownKey]) {
        monthlyData[monthKey].breakdown[breakdownKey] = {
          sessionName: occurrence.sessionName,
          type: 'permanent',
          count: 0,
          hours: 0,
          earnings: 0
        };
      }
      monthlyData[monthKey].breakdown[breakdownKey].count++;
      monthlyData[monthKey].breakdown[breakdownKey].hours += occurrence.duration / 60;
      monthlyData[monthKey].breakdown[breakdownKey].earnings += (occurrence.duration / 60) * hourlyRate;
    });

    // Process cover requests
    coverRequests.forEach(cover => {
      const coverDate = new Date(cover.coverDate);
      const monthKey = `${coverDate.getFullYear()}-${String(coverDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          year: coverDate.getFullYear(),
          month: coverDate.getMonth(),
          sessions: 0,
          covers: 0,
          hours: 0,
          earnings: 0,
          breakdown: {}
        };
      }

      const duration = cover.session.duration;
      const payment = cover.paymentRate || hourlyRate;

      monthlyData[monthKey].covers++;
      monthlyData[monthKey].hours += duration / 60;
      monthlyData[monthKey].earnings += (duration / 60) * payment;

      // Add to breakdown
      const breakdownKey = `cover_${cover._id}`;
      if (!monthlyData[monthKey].breakdown[breakdownKey]) {
        monthlyData[monthKey].breakdown[breakdownKey] = {
          sessionName: cover.session.className,
          type: 'cover',
          count: 0,
          hours: 0,
          earnings: 0
        };
      }
      monthlyData[monthKey].breakdown[breakdownKey].count++;
      monthlyData[monthKey].breakdown[breakdownKey].hours += duration / 60;
      monthlyData[monthKey].breakdown[breakdownKey].earnings += (duration / 60) * payment;
    });

    // Calculate total stats
    const totalStats = {
      totalHours: 0,
      totalSessions: 0,
      totalCovers: 0,
      totalEarnings: 0
    };

    Object.values(monthlyData).forEach(month => {
      totalStats.totalHours += month.hours;
      totalStats.totalSessions += month.sessions;
      totalStats.totalCovers += month.covers;
      totalStats.totalEarnings += month.earnings;
    });

    // Round total hours
    totalStats.totalHours = Math.round(totalStats.totalHours);

    // Get current month key
    const currentMonthKey = `${ukTime.getFullYear()}-${String(ukTime.getMonth() + 1).padStart(2, '0')}`;
    
    // Prepare current month stats
    let currentMonthStats = null;
    if (monthlyData[currentMonthKey]) {
      const data = monthlyData[currentMonthKey];
      currentMonthStats = {
        monthName: new Date(data.year, data.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        hours: Math.round(data.hours),
        sessions: data.sessions,
        covers: data.covers,
        earnings: data.earnings,
        sessionBreakdown: Object.values(data.breakdown).map(item => ({
          ...item,
          hours: Math.round(item.hours)
        }))
      };
    }

    // Prepare previous months stats (sorted newest first)
    const previousMonthsStats = Object.keys(monthlyData)
      .filter(key => key !== currentMonthKey)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const data = monthlyData[key];
        return {
          monthName: new Date(data.year, data.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          hours: Math.round(data.hours),
          sessions: data.sessions,
          covers: data.covers,
          earnings: data.earnings,
          sessionBreakdown: Object.values(data.breakdown).map(item => ({
            ...item,
            hours: Math.round(item.hours)
          }))
        };
      });

    res.render('instructor/stats', {
      title: 'Stats & Hours - Southgate Leisure Centre',
      user: req.user,
      totalStats,
      currentMonthStats,
      previousMonthsStats
    });

  } catch (error) {
    console.error('Stats page error:', error);
    req.flash('error', 'Error loading stats');
    res.render('instructor/stats', {
      title: 'Stats & Hours - Southgate Leisure Centre',
      user: req.user,
      totalStats: {
        totalHours: 0,
        totalSessions: 0,
        totalCovers: 0,
        totalEarnings: 0
      },
      currentMonthStats: null,
      previousMonthsStats: []
    });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/documents';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user._id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed'));
    }
  }
});

/* GET documents page */
router.get('/documents', async function(req, res, next) {
  try {
    const { Document } = require('../models');
    const { DOCUMENT_STATUS } = require('../config/constants');

    // Get current UK time
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    
    // 30 days from now
    const thirtyDaysFromNow = new Date(ukTime);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Get all documents for this instructor - removed populate since approvedBy doesn't exist
    const documents = await Document.find({ instructor: req.user._id })
      .sort({ uploadedAt: -1 });

    console.log('Found documents:', documents.length);
    console.log('Instructor ID:', req.user._id);

    // Add expiry flags to each document
    documents.forEach(doc => {
      console.log('Document:', doc.documentType, 'Status:', doc.status);
      if (doc.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        doc.isExpired = expiryDate < ukTime;
        doc.isExpiringSoon = !doc.isExpired && expiryDate <= thirtyDaysFromNow;
      } else {
        doc.isExpired = false;
        doc.isExpiringSoon = false;
      }
    });

    // Categorize documents
    const approved = documents.filter(d => d.status === DOCUMENT_STATUS.APPROVED && !d.isExpired);
    const pending = documents.filter(d => d.status === DOCUMENT_STATUS.PENDING);
    const rejected = documents.filter(d => d.status === DOCUMENT_STATUS.REJECTED);
    const expired = documents.filter(d => d.isExpired);
    const expiringSoon = documents.filter(d => d.isExpiringSoon);

    console.log('Pending count:', pending.length);
    console.log('Approved count:', approved.length);

    // Count stats
    const approvedCount = approved.length;
    const pendingCount = pending.length;
    const expiredCount = expired.length;

    res.render('instructor/documents', {
      title: 'Documents - Southgate Leisure Centre',
      user: req.user,
      documents,
      approved,
      pending,
      rejected,
      expired,
      expiringSoon,
      approvedCount,
      pendingCount,
      expiredCount
    });

  } catch (error) {
    console.error('Documents page error:', error);
    req.flash('error', 'Error loading documents');
    res.render('instructor/documents', {
      title: 'Documents - Southgate Leisure Centre',
      user: req.user,
      documents: [],
      approved: [],
      pending: [],
      rejected: [],
      expired: [],
      expiringSoon: [],
      approvedCount: 0,
      pendingCount: 0,
      expiredCount: 0
    });
  }
});

/* POST upload document */
router.post('/documents/upload', upload.single('documentFile'), async function(req, res, next) {
  try {
    const { Document } = require('../models');
    const { DOCUMENT_STATUS } = require('../config/constants');
    
    if (!req.file) {
      req.flash('error', 'Please select a file to upload');
      return res.redirect('/instructor/documents');
    }

    const { documentType, expiryDate, notes } = req.body;

    // Create new document with correct field names matching the schema
    const newDocument = new Document({
      instructor: req.user._id,  // Changed from uploadedBy
      documentType,
      fileName: req.file.originalname,  // Original file name
      filePath: req.file.filename,  // Stored file name
      fileSize: req.file.size,  // File size in bytes
      expiryDate: expiryDate || null,
      notes: notes || '',
      status: DOCUMENT_STATUS.PENDING,
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    });

    await newDocument.save();

    // Log upload
    await logAuditAction(
      'document_uploaded',
      'Document',
      newDocument._id,
      req.user._id,
      {
        documentType: documentType
      },
      req
    );

    req.flash('success', 'Document uploaded successfully. Awaiting admin approval.');
    res.redirect('/instructor/documents');

  } catch (error) {
    console.error('Upload document error:', error);
    
    // Delete uploaded file if document creation failed
    if (req.file) {
      const filePath = path.join('public/uploads/documents', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    req.flash('error', 'Error uploading document: ' + error.message);
    res.redirect('/instructor/documents');
  }
});

module.exports = router;