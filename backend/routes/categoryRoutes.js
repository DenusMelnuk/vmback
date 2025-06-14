// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const { Category } = require('../models');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware'); // Переконайтеся, що імпортовано
const logger = require('../config/logger');

// Отримання всіх категорій
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.json(categories);
  } catch (error) {
    logger.error(`Categories fetch error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// Створення нової категорії (потрібні права адміністратора)
router.post('/categories', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    const category = await Category.create({ name, description });
    logger.info(`Category created: ${category.name} by user ${req.user.username}`);
    res.status(201).json(category);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.error(`Category creation error: Category with name '${req.body.name}' already exists.`);
      return res.status(409).json({ error: `Category with name '${req.body.name}' already exists.` });
    }
    logger.error(`Category creation error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

// --- ОНОВЛЕННЯ КАТЕГОРІЇ (PUT) ---
router.put('/categories/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) { // Назва категорії обов'язкова для оновлення
      return res.status(400).json({ error: 'Category name is required for update.' });
    }

    const category = await Category.findByPk(req.params.id);
    if (!category) {
      logger.warn(`Category not found for update with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Category not found.' });
    }

    await category.update({
      name: name || category.name, // Оновлюємо, тільки якщо надано нове ім'я
      description: description !== undefined ? description : category.description // Дозволяємо очищати опис
    });

    logger.info(`Category updated: ${category.name} (ID: ${category.id}) by user ${req.user.username}`);
    res.json(category);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.error(`Category update error: Category with name '${req.body.name}' already exists.`);
      return res.status(409).json({ error: `Category with name '${req.body.name}' already exists.` });
    }
    logger.error(`Category update error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

// --- ВИДАЛЕННЯ КАТЕГОРІЇ (DELETE) ---
router.delete('/categories/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findByPk(categoryId);

    if (!category) {
      logger.warn(`Category not found for deletion with ID: ${categoryId}`);
      return res.status(404).json({ error: 'Category not found.' });
    }

    // Перевірка на наявність пов'язаних продуктів
    const associatedProducts = await category.getProducts(); // Метод getProducts генерується Sequelize
    if (associatedProducts && associatedProducts.length > 0) {
      logger.warn(`Attempt to delete category ${category.name} (ID: ${categoryId}) with existing products.`);
      return res.status(400).json({ error: 'Cannot delete category: products are associated with it. Please reassign or delete products first.' });
    }

    await category.destroy();
    logger.info(`Category deleted: ${category.name} (ID: ${category.id}) by user ${req.user.username}`);
    res.json({ message: 'Category deleted successfully.' });
  } catch (error) {
    logger.error(`Category deletion error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

module.exports = router;