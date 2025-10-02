require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models');
const { USER_STATUS } = require('./config/constants');

async function fixAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find and approve the first admin
    const admin = await User.findOne({ email: 'testme@gmail.com' });
    if (admin) {
      admin.status = USER_STATUS.APPROVED;
      admin.approvedAt = new Date();
      await admin.save();
      console.log('Admin approved:', admin.email);
    }
    
    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

fixAdmin();