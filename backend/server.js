// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const logger = require('./config/logger');
const sequelize = require('./config/db');
const models = require('./models'); // <-- Змінено: імпортуємо вже ініціалізовані моделі
const errorHandler = require('./middleware/errorHandler');

// --- Імпорт роутів (тепер вони отримуватимуть моделі через замикання або напряму) ---
// Якщо роути самі імпортують models, то тут зміни не потрібні.
//const authRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');

// --- Ініціалізація додатку ---
const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Підключення роутів ---
app.use('/api', userRoutes);
app.use('/api', categoryRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);

// --- Обробник помилок ---
app.use(errorHandler);

// --- Ініціалізація бази даних та запуск сервера ---
const PORT = process.env.PORT || 3000;

sequelize.authenticate()
  .then(() => {
    logger.info('Database connection has been established successfully.');
    // Тут більше не потрібно викликати initializeModels, оскільки вони вже ініціалізовані в models/index.js
    // Асоціації теж вже встановлені.
    // Залишаємо цей блок, щоб підтвердити з'єднання з БД
  })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server is running on port ${PORT}`);
      console.log(`Server is running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(error => {
    logger.error(`Failed to connect to database or initialize server: ${error.message}`, error);
    console.error('Failed to connect to database or initialize server:', error);
    process.exit(1);
  });