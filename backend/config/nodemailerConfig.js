// config/nodemailerConfig.js
const nodemailer = require('nodemailer');
const logger = require('./logger'); // Імпорт логера

const transporter = nodemailer.createTransport({
  service: 'gmail', // Або інші налаштування SMTP
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Функція для відправки листа
async function sendEmail(mailOptions) {
  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${mailOptions.to}`);
  } catch (error) {
    logger.error(`Failed to send email to ${mailOptions.to}: ${error.message}`, error);
    throw new Error('Failed to send email'); // Прокидаємо помилку далі
  }
}

module.exports = { sendEmail };