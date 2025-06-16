// config/db.js
const { Sequelize } = require('sequelize');
const logger = require('./logger'); // Логер вже буде налаштований

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: (msg) => logger.debug(msg), // Використовуємо наш логер
    dialectOptions: {
      ...(process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1' ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {
        ssl: true
      })
    },
    define: {
      underscored: true,
      freezeTableName: true
    }
  }
);

module.exports = sequelize;
