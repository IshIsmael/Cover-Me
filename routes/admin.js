var express = require('express');
var router = express.Router();
var { User, CoverRequest, Session, Document, TimetableTemplate } = require('../models');
var { requireAuth, requireAdmin } = require('../middleware/auth');
var { logAuditAction } = require('../utils/helpers');
var { USER_STATUS, USER_ROLES, DOCUMENT_STATUS, TEMPLATE_TYPES, TEMPLATE_STATUS, ASSIGNMENT_TYPES } = require('../config/constants');

// Apply authentication middleware to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

/* GET admin dashboard */
router.get('/dashboard', async function(req, res, next) {
  // Default values to ensure variables are always defined
  let stats = { 
    pendingInstructors: 0, 
    approvedInstructors: 0, 
    openCoverRequests: 0, 
    pendingDocuments: 0 
  };
  let recentInstructors = [];
  let recentCoverRequests = [];

  try {
    // Get basic stats for dashboard
    stats = {
      pendingInstructors: await User.countDocuments({ 
        role: USER_ROLES.INSTRUCTOR, 
        status: USER_STATUS.PENDING 
      }),
      approvedInstructors: await User.countDocuments({ 
        role: USER_ROLES.INSTRUCTOR, 
        status: USER_STATUS.APPROVED 
      }),
      openCoverRequests: await CoverRequest.countDocuments({ 
        status: 'open' 
      }),
      pendingDocuments: await Document.countDocuments({ 
        status: DOCUMENT_STATUS.PENDING 
      })
    };

    // Get recent instructor registrations
    recentInstructors = await User.find({ 
      role: USER_ROLES.INSTRUCTOR,
      status: USER_STATUS.PENDING
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('profile.firstName profile.lastName email createdAt');

    // Get recent cover requests
    recentCoverRequests = await CoverRequest.find({ status: 'open' })
      .populate('session', 'className dayOfWeek startTime')
      .populate('requestedBy', 'profile.firstName profile.lastName')
      .sort({ createdAt: -1 })
      .limit(5);

  } catch (error) {
    console.error('Admin dashboard error:', error);
    req.flash('error', 'Error loading dashboard');
  }

  // Always render with the variables defined
  res.render('admin/dashboard', {
    title: 'Admin Dashboard - Southgate Leisure Centre',
    pageTitle: 'Dashboard',
    pageSubtitle: 'Overview of your leisure centre operations',
    currentPage: 'dashboard',
    user: req.user,
    stats,
    recentInstructors,
    recentCoverRequests
  });
});

/* GET instructors management page */
router.get('/instructors', async function(req, res, next) {
  try {
    // Get all instructors, sorted by status (pending first) then by creation date
    const instructors = await User.find({ role: USER_ROLES.INSTRUCTOR })
      .sort({ status: 1, createdAt: -1 })
      .select('-password');

    // Separate pending and approved for easier display
    const pendingInstructors = instructors.filter(instructor => 
      instructor.status === USER_STATUS.PENDING
    );
    
    const approvedInstructors = instructors.filter(instructor => 
      instructor.status === USER_STATUS.APPROVED
    );

    const rejectedInstructors = instructors.filter(instructor => 
      instructor.status === USER_STATUS.REJECTED
    );

    res.render('admin/instructors', {
      title: 'Instructor Management - Southgate Leisure Centre',
      user: req.user,
      pendingInstructors,
      approvedInstructors,
      rejectedInstructors
    });
  } catch (error) {
    console.error('Instructors page error:', error);
    req.flash('error', 'Error loading instructors');
    res.render('admin/instructors', {
      title: 'Instructor Management - Southgate Leisure Centre',
      user: req.user,
      pendingInstructors: [],
      approvedInstructors: [],
      rejectedInstructors: []
    });
  }
});

/* POST approve instructor */
router.post('/instructors/:id/approve', async function(req, res, next) {
  try {
    const instructorId = req.params.id;
    
    const instructor = await User.findById(instructorId);
    if (!instructor) {
      req.flash('error', 'Instructor not found');
      return res.redirect('/admin/instructors');
    }

    if (instructor.role !== USER_ROLES.INSTRUCTOR) {
      req.flash('error', 'User is not an instructor');
      return res.redirect('/admin/instructors');
    }

    // Update instructor status
    instructor.status = USER_STATUS.APPROVED;
    instructor.approvedAt = new Date();
    instructor.approvedBy = req.user._id;
    await instructor.save();

    // Log the approval
    await logAuditAction(
      'instructor_approved',
      'User',
      instructor._id,
      req.user._id,
      {
        instructorEmail: instructor.email,
        instructorName: `${instructor.profile.firstName} ${instructor.profile.lastName}`
      },
      req
    );

    req.flash('success', `${instructor.profile.firstName} ${instructor.profile.lastName} has been approved`);
    res.redirect('/admin/instructors');

  } catch (error) {
    console.error('Approve instructor error:', error);
    req.flash('error', 'Error approving instructor');
    res.redirect('/admin/instructors');
  }
});

/* POST reject instructor */
router.post('/instructors/:id/reject', async function(req, res, next) {
  try {
    const instructorId = req.params.id;
    
    const instructor = await User.findById(instructorId);
    if (!instructor) {
      req.flash('error', 'Instructor not found');
      return res.redirect('/admin/instructors');
    }

    if (instructor.role !== USER_ROLES.INSTRUCTOR) {
      req.flash('error', 'User is not an instructor');
      return res.redirect('/admin/instructors');
    }

    // Update instructor status
    instructor.status = USER_STATUS.REJECTED;
    await instructor.save();

    // Log the rejection
    await logAuditAction(
      'instructor_rejected',
      'User',
      instructor._id,
      req.user._id,
      {
        instructorEmail: instructor.email,
        instructorName: `${instructor.profile.firstName} ${instructor.profile.lastName}`
      },
      req
    );

    req.flash('success', `${instructor.profile.firstName} ${instructor.profile.lastName} has been rejected`);
    res.redirect('/admin/instructors');

  } catch (error) {
    console.error('Reject instructor error:', error);
    req.flash('error', 'Error rejecting instructor');
    res.redirect('/admin/instructors');
  }
});

/* DELETE instructor account */
router.delete('/instructors/:id', async function(req, res, next) {
  try {
    const instructorId = req.params.id;
    
    const instructor = await User.findById(instructorId);
    if (!instructor) {
      req.flash('error', 'Instructor not found');
      return res.redirect('/admin/instructors');
    }

    if (instructor.role !== USER_ROLES.INSTRUCTOR) {
      req.flash('error', 'User is not an instructor');
      return res.redirect('/admin/instructors');
    }

    // Log the deletion before removing
    await logAuditAction(
      'instructor_deleted',
      'User',
      instructor._id,
      req.user._id,
      {
        instructorEmail: instructor.email,
        instructorName: `${instructor.profile.firstName} ${instructor.profile.lastName}`,
        instructorStatus: instructor.status
      },
      req
    );

    // Delete the instructor
    await User.findByIdAndDelete(instructorId);

    req.flash('success', `${instructor.profile.firstName} ${instructor.profile.lastName} has been deleted`);
    res.redirect('/admin/instructors');

  } catch (error) {
    console.error('Delete instructor error:', error);
    req.flash('error', 'Error deleting instructor');
    res.redirect('/admin/instructors');
  }
});

// ==================== TIMETABLE MANAGEMENT ROUTES ====================

/* GET timetable management page */
router.get('/timetable', async function(req, res, next) {
  try {
    // Get all timetable templates
    const templates = await TimetableTemplate.find()
      .sort({ status: 1, effectiveFrom: -1 })
      .populate('createdBy', 'profile.firstName profile.lastName');

    // Get current active template
    const activeTemplate = await TimetableTemplate.findOne({ 
      status: TEMPLATE_STATUS.ACTIVE,
      effectiveFrom: { $lte: new Date() },
      effectiveTo: { $gte: new Date() }
    });

    // Get sessions for the active template if it exists
    let currentSessions = [];
    if (activeTemplate) {
      currentSessions = await Session.find({ 
        timetableTemplate: activeTemplate._id,
        isActive: true 
      })
      .populate('permanentInstructor', 'profile.firstName profile.lastName')
      .sort({ dayOfWeek: 1, startTime: 1 });
    }

    res.render('admin/timetable', {
      title: 'Timetable Management - Southgate Leisure Centre',
      user: req.user,
      templates,
      activeTemplate,
      currentSessions
    });

  } catch (error) {
    console.error('Timetable page error:', error);
    req.flash('error', 'Error loading timetable');
    res.render('admin/timetable', {
      title: 'Timetable Management - Southgate Leisure Centre',
      user: req.user,
      templates: [],
      activeTemplate: null,
      currentSessions: []
    });
  }
});

/* GET create new timetable template */
router.get('/timetable/create', async function(req, res, next) {
  res.render('admin/timetable-create', {
    title: 'Create Timetable Template - Southgate Leisure Centre',
    user: req.user
  });
});

/* POST create new timetable template */
router.post('/timetable/create', async function(req, res, next) {
  try {
    const { name, type, effectiveFrom, effectiveTo, noEndDate } = req.body;

    // Validate dates
    const fromDate = new Date(effectiveFrom);
    let toDate = null;
    
    // Check if this is an endless template
    const isEndless = noEndDate === 'on' || !effectiveTo || effectiveTo.trim() === '';
    
    if (!isEndless) {
      toDate = new Date(effectiveTo);
      
      if (fromDate >= toDate) {
        req.flash('error', 'End date must be after start date');
        return res.redirect('/admin/timetable/create');
      }
    } else {
      // Set a far future date for endless templates (100 years from now)
      toDate = new Date(fromDate);
      toDate.setFullYear(toDate.getFullYear() + 100);
    }

    // Check for overlapping active templates
    const overlapping = await TimetableTemplate.findOne({
      status: TEMPLATE_STATUS.ACTIVE,
      $or: [
        { 
          effectiveFrom: { $lte: fromDate },
          effectiveTo: { $gte: fromDate }
        },
        {
          effectiveFrom: { $lte: toDate },
          effectiveTo: { $gte: toDate }
        }
      ]
    });

    // If overlapping and trying to create endless template, reject
    if (overlapping && isEndless) {
      req.flash('error', 'Templates that overlap with the current active template must have an end date');
      return res.redirect('/admin/timetable/create');
    }

    // Create new template
    const newTemplate = new TimetableTemplate({
      name,
      type,
      effectiveFrom: fromDate,
      effectiveTo: toDate,
      status: TEMPLATE_STATUS.DRAFT,
      createdBy: req.user._id
    });

    await newTemplate.save();

    // Log creation
    await logAuditAction(
      'timetable_template_created',
      'TimetableTemplate',
      newTemplate._id,
      req.user._id,
      {
        templateName: newTemplate.name,
        templateType: newTemplate.type,
        isEndless: isEndless
      },
      req
    );

    req.flash('success', `Timetable template "${name}" created successfully. Now add sessions to this template.`);
    res.redirect(`/admin/timetable/${newTemplate._id}`);

  } catch (error) {
    console.error('Create timetable error:', error);
    req.flash('error', 'Error creating timetable template');
    res.redirect('/admin/timetable/create');
  }
});

/* GET view specific timetable */
router.get('/timetable/:id', async function(req, res, next) {
  try {
    const templateId = req.params.id;
    
    const template = await TimetableTemplate.findById(templateId)
      .populate('createdBy', 'profile.firstName profile.lastName');
    
    if (!template) {
      req.flash('error', 'Timetable template not found');
      return res.redirect('/admin/timetable');
    }

    // Get sessions for this template
    const sessions = await Session.find({ 
      timetableTemplate: templateId,
      isActive: true 
    })
    .populate('permanentInstructor', 'profile.firstName profile.lastName')
    .sort({ dayOfWeek: 1, startTime: 1 });

    // Get approved instructors for assignment
    const availableInstructors = await User.find({
      role: USER_ROLES.INSTRUCTOR,
      status: USER_STATUS.APPROVED
    })
    .select('profile.firstName profile.lastName instructorData.qualifications')
    .sort({ 'profile.firstName': 1 });

    res.render('admin/timetable-detail', {
      title: `${template.name} - Southgate Leisure Centre`,
      user: req.user,
      template,
      sessions,
      availableInstructors
    });

  } catch (error) {
    console.error('Timetable detail error:', error);
    req.flash('error', 'Error loading timetable');
    res.redirect('/admin/timetable');
  }
});

/* POST add session to timetable */
router.post('/timetable/:id/session', async function(req, res, next) {
  try {
    const templateId = req.params.id;
    const { 
      className, 
      description, 
      dayOfWeek, 
      startTime, 
      endTime, 
      venue, 
      maxParticipants,
      assignmentType,
      permanentInstructor,
      requiredQualifications
    } = req.body;

    // Validate template exists
    const template = await TimetableTemplate.findById(templateId);
    if (!template) {
      req.flash('error', 'Timetable template not found');
      return res.redirect('/admin/timetable');
    }

    // Calculate duration
    const startTimeParts = startTime.split(':');
    const endTimeParts = endTime.split(':');
    const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
    const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
    const duration = endMinutes - startMinutes;

    if (duration <= 0) {
      req.flash('error', 'End time must be after start time');
      return res.redirect(`/admin/timetable/${templateId}`);
    }

    // Check for time conflicts
    const conflictingSessions = await Session.find({
      timetableTemplate: templateId,
      dayOfWeek: parseInt(dayOfWeek),
      venue: venue,
      isActive: true,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    });

    if (conflictingSessions.length > 0) {
      req.flash('error', 'Session time conflicts with existing session in the same venue');
      return res.redirect(`/admin/timetable/${templateId}`);
    }

    // Create new session
    const newSession = new Session({
      className,
      description,
      duration,
      maxParticipants: parseInt(maxParticipants) || null,
      dayOfWeek: parseInt(dayOfWeek),
      startTime,
      endTime,
      venue,
      assignmentType: assignmentType || ASSIGNMENT_TYPES.OPEN,
      permanentInstructor: assignmentType === ASSIGNMENT_TYPES.PERMANENT ? permanentInstructor : null,
      requiredQualifications: requiredQualifications ? requiredQualifications.split(',').map(q => q.trim()) : [],
      timetableTemplate: templateId,
      createdBy: req.user._id
    });

    await newSession.save();

    // Update template session count
    await TimetableTemplate.findByIdAndUpdate(templateId, {
      $inc: { sessionCount: 1 }
    });

    // Log session creation
    await logAuditAction(
      'session_created',
      'Session',
      newSession._id,
      req.user._id,
      {
        sessionName: newSession.className,
        templateName: template.name
      },
      req
    );

    req.flash('success', `Session "${className}" added successfully`);
    res.redirect(`/admin/timetable/${templateId}`);

  } catch (error) {
    console.error('Add session error:', error);
    req.flash('error', 'Error adding session');
    res.redirect(`/admin/timetable/${req.params.id}`);
  }
});

/* POST activate timetable template */
router.post('/timetable/:id/activate', async function(req, res, next) {
  try {
    const templateId = req.params.id;
    
    const template = await TimetableTemplate.findById(templateId);
    if (!template) {
      req.flash('error', 'Timetable template not found');
      return res.redirect('/admin/timetable');
    }

    if (template.status === TEMPLATE_STATUS.ACTIVE) {
      req.flash('error', 'Template is already active');
      return res.redirect('/admin/timetable');
    }

    // Deactivate any existing active templates
    await TimetableTemplate.updateMany(
      { status: TEMPLATE_STATUS.ACTIVE },
      { status: TEMPLATE_STATUS.ARCHIVED }
    );

    // Activate this template
    template.status = TEMPLATE_STATUS.ACTIVE;
    await template.save();

    // Log activation
    await logAuditAction(
      'timetable_activated',
      'TimetableTemplate',
      template._id,
      req.user._id,
      {
        templateName: template.name
      },
      req
    );

    req.flash('success', `Timetable template "${template.name}" is now active`);
    res.redirect('/admin/timetable');

  } catch (error) {
    console.error('Activate timetable error:', error);
    req.flash('error', 'Error activating timetable');
    res.redirect('/admin/timetable');
  }
});

// ==================== GET COVER ROUTES ====================

/* GET get cover page */
router.get('/get-cover', async function(req, res, next) {
  try {
    // Get active timetable
    const activeTimetable = await TimetableTemplate.findOne({
      status: TEMPLATE_STATUS.ACTIVE
    });

    let sessions = [];
    let eligibleInstructors = [];

    if (activeTimetable) {
      // Get all sessions from active timetable
      sessions = await Session.find({
        timetableTemplate: activeTimetable._id,
        isActive: true
      })
      .populate('permanentInstructor', 'profile.firstName profile.lastName')
      .sort({ dayOfWeek: 1, startTime: 1 });

      // Get all approved instructors for eligible count
      eligibleInstructors = await User.find({
        role: USER_ROLES.INSTRUCTOR,
        status: USER_STATUS.APPROVED
      }).select('profile.firstName profile.lastName instructorData.qualifications');
    }

    res.render('admin/get-cover', {
      title: 'Get Cover - Southgate Leisure Centre',
      user: req.user,
      activeTimetable,
      sessions,
      eligibleInstructors
    });

  } catch (error) {
    console.error('Get cover page error:', error);
    req.flash('error', 'Error loading cover request page');
    res.render('admin/get-cover', {
      title: 'Get Cover - Southgate Leisure Centre',
      user: req.user,
      activeTimetable: null,
      sessions: [],
      eligibleInstructors: []
    });
  }
});

/* POST create cover request */
router.post('/cover/create', async function(req, res, next) {
  try {
    const { session, coverDate, urgency, reason, paymentRate } = req.body;

    // Validate session exists
    const sessionDoc = await Session.findById(session);
    if (!sessionDoc) {
      req.flash('error', 'Session not found');
      return res.redirect('/admin/get-cover');
    }

    // Parse cover date
    const coverDateObj = new Date(coverDate);
    
    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (coverDateObj < today) {
      req.flash('error', 'Cannot request cover for past dates');
      return res.redirect('/admin/get-cover');
    }

    // Create session datetime by combining date and session time
    const [hours, minutes] = sessionDoc.startTime.split(':');
    const sessionDateTime = new Date(coverDateObj);
    sessionDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // Check for duplicate cover request
    const existingCover = await CoverRequest.findOne({
      session: session,
      coverDate: coverDateObj,
      status: { $in: ['open', 'accepted', 'confirmed'] }
    });

    if (existingCover) {
      req.flash('error', 'Cover request already exists for this session on this date');
      return res.redirect('/admin/get-cover');
    }

    // Create cover request
    const newCoverRequest = new CoverRequest({
      session: session,
      coverDate: coverDateObj,
      sessionDateTime: sessionDateTime,
      urgency: urgency || 'normal',
      reason: reason || '',
      requestedBy: req.user._id,
      requestedFor: sessionDoc.permanentInstructor || null,
      paymentRate: paymentRate ? parseFloat(paymentRate) : null,
      status: 'open'
    });

    await newCoverRequest.save();

    // Log creation
    await logAuditAction(
      'cover_request_created',
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
    // This will be implemented when we build the email system

    req.flash('success', `Cover request created successfully for ${sessionDoc.className} on ${coverDateObj.toLocaleDateString('en-GB')}`);
    res.redirect('/admin/cover');

  } catch (error) {
    console.error('Create cover request error:', error);
    req.flash('error', 'Error creating cover request');
    res.redirect('/admin/get-cover');
  }
});

// ==================== YOUR COVER ROUTES ====================

/* GET your cover page */
router.get('/cover', async function(req, res, next) {
  try {
    // Get stats
    const stats = {
      open: await CoverRequest.countDocuments({ status: 'open' }),
      accepted: await CoverRequest.countDocuments({ status: 'accepted' }),
      confirmed: await CoverRequest.countDocuments({ status: 'confirmed' }),
      total: await CoverRequest.countDocuments({ 
        status: { $in: ['open', 'accepted', 'confirmed'] }
      })
    };

    // Get cover requests by status
    const openRequests = await CoverRequest.find({ status: 'open' })
      .populate('session', 'className startTime endTime venue dayOfWeek')
      .populate('requestedBy', 'profile.firstName profile.lastName')
      .populate('requestedFor', 'profile.firstName profile.lastName')
      .sort({ sessionDateTime: 1 });

    const acceptedRequests = await CoverRequest.find({ status: 'accepted' })
      .populate('session', 'className startTime endTime venue dayOfWeek')
      .populate('requestedBy', 'profile.firstName profile.lastName')
      .populate('acceptedBy', 'profile.firstName profile.lastName')
      .sort({ sessionDateTime: 1 });

    const confirmedRequests = await CoverRequest.find({ status: 'confirmed' })
      .populate('session', 'className startTime endTime venue dayOfWeek')
      .populate('acceptedBy', 'profile.firstName profile.lastName')
      .sort({ sessionDateTime: 1 })
      .limit(20);

    res.render('admin/cover', {
      title: 'Your Cover - Southgate Leisure Centre',
      user: req.user,
      stats,
      openRequests,
      acceptedRequests,
      confirmedRequests
    });

  } catch (error) {
    console.error('Your cover page error:', error);
    req.flash('error', 'Error loading cover requests');
    res.render('admin/cover', {
      title: 'Your Cover - Southgate Leisure Centre',
      user: req.user,
      stats: { open: 0, accepted: 0, confirmed: 0, total: 0 },
      openRequests: [],
      acceptedRequests: [],
      confirmedRequests: []
    });
  }
});

/* POST confirm cover acceptance */
router.post('/cover/:id/confirm', async function(req, res, next) {
  try {
    const requestId = req.params.id;

    const coverRequest = await CoverRequest.findById(requestId);
    if (!coverRequest) {
      req.flash('error', 'Cover request not found');
      return res.redirect('/admin/cover');
    }

    if (coverRequest.status !== 'accepted') {
      req.flash('error', 'Can only confirm accepted cover requests');
      return res.redirect('/admin/cover');
    }

    // Update status to confirmed
    coverRequest.status = 'confirmed';
    coverRequest.confirmedBy = req.user._id;
    coverRequest.confirmedAt = new Date();
    await coverRequest.save();

    // Log confirmation
    await logAuditAction(
      'cover_request_confirmed',
      'CoverRequest',
      coverRequest._id,
      req.user._id,
      {
        acceptedBy: coverRequest.acceptedBy
      },
      req
    );

    req.flash('success', 'Cover request confirmed successfully');
    res.redirect('/admin/cover');

  } catch (error) {
    console.error('Confirm cover error:', error);
    req.flash('error', 'Error confirming cover request');
    res.redirect('/admin/cover');
  }
});

/* POST decline cover acceptance */
router.post('/cover/:id/decline', async function(req, res, next) {
  try {
    const requestId = req.params.id;

    const coverRequest = await CoverRequest.findById(requestId);
    if (!coverRequest) {
      req.flash('error', 'Cover request not found');
      return res.redirect('/admin/cover');
    }

    if (coverRequest.status !== 'accepted') {
      req.flash('error', 'Can only decline accepted cover requests');
      return res.redirect('/admin/cover');
    }

    // Store who was declined
    const declinedInstructor = coverRequest.acceptedBy;

    // Reopen the request
    coverRequest.status = 'open';
    coverRequest.acceptedBy = null;
    coverRequest.acceptedAt = null;
    await coverRequest.save();

    // Log decline
    await logAuditAction(
      'cover_acceptance_declined',
      'CoverRequest',
      coverRequest._id,
      req.user._id,
      {
        declinedInstructor: declinedInstructor
      },
      req
    );

    // TODO: Notify other instructors that request is open again

    req.flash('success', 'Cover acceptance declined. Request reopened to other instructors.');
    res.redirect('/admin/cover');

  } catch (error) {
    console.error('Decline cover error:', error);
    req.flash('error', 'Error declining cover acceptance');
    res.redirect('/admin/cover');
  }
});

/* POST cancel cover request */
router.post('/cover/:id/cancel', async function(req, res, next) {
  try {
    const requestId = req.params.id;

    const coverRequest = await CoverRequest.findById(requestId);
    if (!coverRequest) {
      req.flash('error', 'Cover request not found');
      return res.redirect('/admin/cover');
    }

    // Update status to cancelled
    coverRequest.status = 'cancelled';
    await coverRequest.save();

    // Log cancellation
    await logAuditAction(
      'cover_request_cancelled',
      'CoverRequest',
      coverRequest._id,
      req.user._id,
      {},
      req
    );

    // TODO: Notify instructors that request was cancelled

    req.flash('success', 'Cover request cancelled');
    res.redirect('/admin/cover');

  } catch (error) {
    console.error('Cancel cover error:', error);
    req.flash('error', 'Error cancelling cover request');
    res.redirect('/admin/cover');
  }
});

module.exports = router;