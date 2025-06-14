// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { Product, Category } = require('../models'); // Деструктуруємо
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');
const { upload, processAndSaveImage, deleteOldImage } = require('../config/multerConfig');
const logger = require('../config/logger');

router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const categoryId = req.query.categoryId;

    const where = categoryId ? { categoryId } : {};

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [Category],
      limit,
      offset
    });

    res.json({
      products: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    logger.error(`Products fetch error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, { include: [Category] });
    if (!product) {
      logger.warn(`Product not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    logger.error(`Product fetch error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

router.post('/products', authenticateToken, isAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, stock, categoryId } = req.body;

    if (!name || !price || !stock || !categoryId) {
      return res.status(400).json({ error: 'Name, price, stock, and categoryId are required.' });
    }

    let imageUrl = req.body.imageUrl;

    if (req.file) {
      imageUrl = await processAndSaveImage(req.file);
    }

    const product = await Product.create({
      name,
      description,
      price,
      stock,
      imageUrl,
      categoryId
    });

    logger.info(`Product created: ${product.name} by user ${req.user.username}`);
    res.status(201).json(product);
  } catch (error) {
    // Прокидаємо помилку до централізованого обробника помилок
    next(error);
  }
});

router.put('/products/:id', authenticateToken, isAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      logger.warn(`Product not found for update with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const { name, description, price, stock, categoryId } = req.body;
    let imageUrl = product.imageUrl;

    if (req.file) {
      await deleteOldImage(product.imageUrl); // Видаляємо старе зображення
      imageUrl = await processAndSaveImage(req.file); // Зберігаємо нове
    }

    await product.update({
      name: name || product.name,
      description: description || product.description,
      price: price || product.price,
      stock: stock || product.stock,
      imageUrl: imageUrl,
      categoryId: categoryId || product.categoryId
    });

    logger.info(`Product updated: ${product.name} (ID: ${product.id}) by user ${req.user.username}`);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      logger.warn(`Product not found for deletion with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    await deleteOldImage(product.imageUrl); // Видаляємо зображення

    await product.destroy();
    logger.info(`Product deleted: ${product.name} (ID: ${product.id}) by user ${req.user.username}`);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;