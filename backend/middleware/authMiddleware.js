// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const logger = require('../config/logger'); // Імпорт логера

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication attempt without token');
    return res.status(401).json({ error: 'Access denied: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.error(`Token verification failed: ${err.message}`);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn(`Unauthorized admin access attempt by user: ${req.user ? req.user.username : 'unknown'}`);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticateToken, isAdmin };