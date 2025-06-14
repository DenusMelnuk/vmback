// config/multerConfig.js
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger'); // Імпорт логера

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // Шлях до папки 'uploads'

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (err) {
      logger.error(`Failed to create uploads directory: ${err.message}`);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    const error = new Error('Only JPEG and PNG images are allowed and file size must be less than 5MB');
    error.statusCode = 400; // Додаємо кастомний статус код для обробника помилок
    cb(error);
  }
});

// Функція для обробки та збереження зображення
async function processAndSaveImage(file) {
  const originalFilePath = file.path;
  const resizedFilename = `resized-${file.filename}`;
  const outputPath = path.join(UPLOADS_DIR, resizedFilename);

  try {
    await sharp(originalFilePath)
      .resize(300, 300, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .toFile(outputPath);

    await fs.unlink(originalFilePath); // Видаляємо оригінал після обробки
    logger.info(`Deleted original uploaded file: ${originalFilePath}`);

    return `/uploads/${resizedFilename}`; // Повертаємо URL для збереження в БД
  } catch (sharpError) {
    logger.error(`Image processing error for ${file.filename}: ${sharpError.message}`, sharpError);
    // Додаємо статус код для MulterErrors або інших помилок завантаження/обробки
    const error = new Error('Failed to process image.');
    error.statusCode = 500;
    throw error;
  }
}

// Функція для видалення старого зображення
async function deleteOldImage(imageUrl) {
  if (imageUrl) {
    const imagePath = path.join(__dirname, '..', imageUrl); // Шлях до файлу
    try {
      await fs.access(imagePath); // Перевіряємо, чи файл існує
      await fs.unlink(imagePath);
      logger.info(`Deleted old product image: ${imagePath}`);
    } catch (err) {
      if (err.code !== 'ENOENT') { // Ігноруємо помилку, якщо файл не знайдено
        logger.warn(`Failed to delete old image ${imagePath}: ${err.message}`);
      }
    }
  }
}

module.exports = { upload, processAndSaveImage, deleteOldImage, UPLOADS_DIR };