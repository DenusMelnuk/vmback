// config/nodemailerConfig.js
const nodemailer = require('nodemailer');
require('dotenv').config(); // Для доступу до змінних середовища

// Виберіть один з налаштувань нижче:

// --- Варіант 1: Postmark ---
const transporter = nodemailer.createTransport({
  host: 'smtp.postmarkapp.com',
  port: 587, // Або 2525, 465
  secure: false, // true for 465, false for 587 or 2525
  auth: {
    user: 'postmark', // Завжди 'postmark' для Postmark SMTP
    pass: process.env.POSTMARK_API_TOKEN // Ваш Postmark Server API Token
  }
});

// --- Варіант 2: SendGrid ---
/*
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey', // Завжди 'apikey' для SendGrid
    pass: process.env.SENDGRID_API_KEY // Ваш SendGrid API Key
  }
});
*/

// --- Варіант 3: Brevo (Sendinblue) ---
/*
const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: process.env.BREVO_SMTP_PORT,
  secure: process.env.BREVO_SMTP_SECURE === 'true',
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  }
});
*/

// --- Варіант 4: Gmail з OAuth2.0 (якщо App Passwords недоступні) ---
/*
const { google } = require('googleapis');
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'YOUR_REDIRECT_URI' // Це може бути 'urn:ietf:wg:oauth:2.0:oob' або порожній рядок для десктопних додатків
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    accessToken: oAuth2Client.getAccessToken() // Nodemailer автоматично оновлює Access Token, якщо він закінчується
  }
});
*/

// --- Функція відправки пошти ---
const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    // console.log('Message sent: %s', info.messageId);
    // console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info)); // Тільки для Ethereal
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; // Викидаємо помилку, щоб її можна було зловити у викликаючому коді
  }
};

module.exports = { sendEmail };
