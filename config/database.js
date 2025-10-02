const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes on connection
    await createIndexes();
    
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const { User, Session, CoverRequest, Document, AuditLog } = require('../models');
    
    // User indexes
    await User.createIndexes();
    
    // Session indexes  
    await Session.createIndexes();
    
    // CoverRequest indexes
    await CoverRequest.createIndexes();
    
    // Document indexes
    await Document.createIndexes();
    
    // AuditLog indexes
    await AuditLog.createIndexes();
    
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = connectDB;