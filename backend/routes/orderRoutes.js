// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { Order, Product, User } = require('../models'); // Деструктуруємо
const sequelize = require('../config/db'); // Імпорт екземпляра Sequelize для транзакцій
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');
const { sendEmail } = require('../config/nodemailerConfig');
const logger = require('../config/logger');

router.post('/orders', authenticateToken, async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { productId, quantity } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Product ID and a positive quantity are required.' });
    }

    const product = await Product.findByPk(productId, { transaction: t });

    if (!product) {
      await t.rollback();
      logger.warn(`Order attempt for non-existent product ID: ${productId} by user ${req.user.username}`);
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.stock < quantity) {
      await t.rollback();
      logger.warn(`Insufficient stock for product ${product.name} (ID: ${productId}). Requested: ${quantity}, Available: ${product.stock}`);
      return res.status(400).json({ error: `Insufficient stock for ${product.name}. Only ${product.stock} left.` });
    }

    await product.update({ stock: product.stock - quantity }, { transaction: t });

    const order = await Order.create({
      userId: req.user.id,
      productId,
      quantity,
      status: 'reserved'
    }, { transaction: t });

    // Відправка email користувачу
    await sendEmail({
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: 'Order Confirmation',
      text: `Your order for ${product.name} (Quantity: ${quantity}) has been reserved. Total price: $${(product.price * quantity).toFixed(2)}`
    });
    logger.info(`Order confirmation email sent to ${req.user.email} for order ${order.id}`);

    // Відправка email власнику
    await sendEmail({
      from: process.env.EMAIL_USER,
      to: process.env.OWNER_EMAIL,
      subject: 'New Order Placed',
      text: `New order for ${product.name} (Quantity: ${quantity}) by ${req.user.username}. Order ID: ${order.id}`
    });
    logger.info(`New order notification email sent to owner for order ${order.id}`);

    await t.commit();
    logger.info(`Order created successfully: ${order.id} by user ${req.user.username}`);
    res.status(201).json({ message: 'Order placed successfully', orderId: order.id });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
      logger.warn(`Transaction for order creation rolled back due to error.`);
    }
    next(error); // Прокидаємо помилку до централізованого обробника
  }
});

router.get('/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        { model: User, attributes: ['username', 'email'] },
        { model: Product, attributes: ['name', 'price'] }
      ]
    });
    res.json(orders);
  } catch (error) {
    logger.error(`Orders fetch error (admin access): ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

module.exports = router;