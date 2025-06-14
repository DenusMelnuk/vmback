// middleware/errorHandler.js
const logger = require('../config/logger'); // Імпорт логера
const multer = require('multer'); // Для перевірки Multer errors

function errorHandler(err, req, res, next) {
  // Обробка помилок Multer
  if (err instanceof multer.MulterError) {
    logger.error(`Multer error: ${err.message}`, err);
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  // Обробка інших помилок
  logger.error(`Unhandled error: ${err.message}`, err.stack);
  res.status(err.statusCode || 500).json({
    error: 'An unexpected error occurred.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

module.exports = errorHandler;