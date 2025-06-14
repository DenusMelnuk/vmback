// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { User, Order } = require('../models'); // Додаємо Order для перевірки при видаленні
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware'); // Імпортуємо мідлвари

// --- Роут реєстрації (Create) - вже був тут ---
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required.' });
    }

    const user = await User.create({
      username,
      password,
      email
    });

    logger.info(`User registered: ${username}`);
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.error(`Registration error: Duplicate entry for ${error.fields ? Object.keys(error.fields).join(', ') : 'unknown field'}`);
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    logger.error(`Registration error: ${error.message}`, error);
    res.status(500).json({ error: 'An unexpected error occurred during registration.' });
  }
});

// --- Роут логіну - вже був тут ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await User.findOne({ where: { username } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email
    }, process.env.JWT_SECRET, { expiresIn: '24h' });

    logger.info(`User logged in: ${username}`);
    res.json({ token });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, error);
    res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// --- Роут для отримання всіх користувачів (Read All) ---
// Тільки для адміністраторів
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] } // Не повертаємо хешований пароль
    });
    res.json(users);
  } catch (error) {
    logger.error(`Users fetch error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// --- Роут для отримання користувача за ID (Read One) ---
// Доступно адміністратору або самому користувачу
router.get('/users/:id', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Перевірка прав: адміністратор або сам користувач
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      logger.warn(`Unauthorized access attempt to user data by user ${req.user.username} (ID: ${req.user.id}) for user ID: ${userId}`);
      return res.status(403).json({ error: 'Access denied: You can only view your own profile unless you are an admin.' });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] } // Не повертаємо хешований пароль
    });

    if (!user) {
      logger.warn(`User not found with ID: ${userId}`);
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    logger.error(`User fetch error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// --- Роут для оновлення користувача (Update) ---
// Доступно адміністратору або самому користувачу
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, email, password, role } = req.body;

    // Перевірка прав: адміністратор або сам користувач
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      logger.warn(`Unauthorized update attempt by user ${req.user.username} (ID: ${req.user.id}) for user ID: ${userId}`);
      return res.status(403).json({ error: 'Access denied: You can only update your own profile unless you are an admin.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      logger.warn(`User not found for update with ID: ${userId}`);
      return res.status(404).json({ error: 'User not found.' });
    }

    // Забороняємо звичайним користувачам змінювати роль
    if (req.user.role !== 'admin' && role !== undefined && role !== user.role) {
      logger.warn(`User ${req.user.username} (ID: ${req.user.id}) attempted to change role for user ID: ${userId}`);
      return res.status(403).json({ error: 'Access denied: Only administrators can change user roles.' });
    }

    // Якщо адміністратор намагається змінити роль на неіснуючу
    if (role && !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role provided. Must be "admin" or "user".' });
    }

    // Оновлюємо тільки надані поля
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined) updateData.password = password; // Хук в моделі хешує пароль
    if (role !== undefined && req.user.role === 'admin') updateData.role = role; // Дозволяємо admin змінювати роль

    await user.update(updateData);

    logger.info(`User updated: ${user.username} (ID: ${user.id}) by ${req.user.username}`);
    res.json({ message: 'User updated successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.error(`User update error: Duplicate entry for ${error.fields ? Object.keys(error.fields).join(', ') : 'unknown field'}`);
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    logger.error(`User update error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// --- Роут для видалення користувача (Delete) ---
// Тільки для адміністраторів
router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const t = await User.sequelize.transaction(); // Використовуємо транзакцію для безпечного видалення

  try {
    const userId = parseInt(req.params.id);

    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      logger.warn(`User not found for deletion with ID: ${userId}`);
      return res.status(404).json({ error: 'User not found.' });
    }

    // Забороняємо адміністратору видаляти себе (щоб уникнути втрати адмін-доступу)
    if (req.user.id === userId && req.user.role === 'admin') {
      await t.rollback();
      logger.warn(`Admin user ${req.user.username} (ID: ${req.user.id}) attempted to delete their own account.`);
      return res.status(403).json({ error: 'Admin cannot delete their own account.' });
    }

    // Перевірка на наявність пов'язаних замовлень
    const associatedOrders = await Order.count({ where: { userId: userId }, transaction: t });
    if (associatedOrders > 0) {
      await t.rollback();
      logger.warn(`Attempt to delete user ${user.username} (ID: ${userId}) with existing orders.`);
      return res.status(400).json({ error: 'Cannot delete user: existing orders are associated with this user. Please manage orders first.' });
    }

    await user.destroy({ transaction: t });
    await t.commit();

    logger.info(`User deleted: ${user.username} (ID: ${user.id}) by admin ${req.user.username}`);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    logger.error(`User deletion error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;