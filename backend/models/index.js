// models/index.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Імпортуємо налаштований екземпляр Sequelize

const User = require('./User')(sequelize, DataTypes);
const Category = require('./Category')(sequelize, DataTypes);
const Product = require('./Product')(sequelize, DataTypes);
const Order = require('./Order')(sequelize, DataTypes);

// Встановлення асоціацій
// Важливо: передаємо об'єкт з усіма моделями для коректної роботи .associate
const models = { User, Category, Product, Order };

Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = models; // Експортуємо об'єкт з усіма ініціалізованими моделями