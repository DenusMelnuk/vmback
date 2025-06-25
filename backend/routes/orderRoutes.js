const express = require('express');
const router = express.Router();
const { Order, Product, User } = require('../models');
const sequelize = require('../config/db');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');
const { sendEmail } = require('../config/nodemailerConfig');
const logger = require('../config/logger');

// ... (Ваш POST /orders маршрут залишається без змін)
router.post('/orders', authenticateToken, async (req, res, next) => {
    const t = await sequelize.transaction();

    try {
        const { productId, quantity } = req.body;
        const userId = req.user.id;

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

        const totalPrice = (product.price * quantity).toFixed(2);

        const order = await Order.create({
            userId: userId,
            productId,
            quantity,
            status: 'reserved',
            totalPrice: totalPrice
        }, { transaction: t });

        const user = await User.findByPk(userId, { transaction: t, attributes: ['email', 'username'] });

        if (user && user.email) {
            try {
                await sendEmail({
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Підтвердження вашого замовлення',
                    html: `
                        <p>Шановний(а) ${user.username || 'клієнт'}!</p>
                        <p>Дякуємо за ваше замовлення №<strong>${order.id}</strong>.</p>
                        <p>Ваше замовлення для <strong>${product.name}</strong> (Кількість: ${quantity}) було успішно оформлено.</p>
                        <p>Загальна вартість: <strong>$${order.totalPrice}</strong></p>
                        <p>Статус замовлення: ${order.status}</p>
                        <p>Ми зв'яжемося з вами найближчим часом для уточнення деталей.</p>
                        <p>З повагою,<br>Ваш магазин</p>
                    `
                });
                logger.info(`Підтвердження замовлення email надіслано до ${user.email} для замовлення ${order.id}`);
            } catch (emailError) {
                logger.error(`Помилка надсилання email підтвердження замовлення до ${user.email} для замовлення ${order.id}: ${emailError.message}`, emailError);
            }
        } else {
            logger.warn(`Не вдалося відправити email користувачу ${req.user.username}: адреса email не знайдена.`);
        }

        if (process.env.OWNER_EMAIL) {
            try {
                await sendEmail({
                    from: process.env.EMAIL_USER,
                    to: process.env.OWNER_EMAIL,
                    subject: `Нове замовлення №${order.id}`,
                    html: `
                        <p>Вітаємо!</p>
                        <p>Отримано нове замовлення:</p>
                        <ul>
                            <li><strong>ID Замовлення:</strong> ${order.id}</li>
                            <li><strong>Користувач:</strong> ${user ? user.username : 'N/A'} (ID: ${userId})</li>
                            <li><strong>Email користувача:</strong> ${user ? user.email : 'N/A'}</li>
                            <li><strong>Товар:</strong> ${product.name} (ID: ${productId})</li>
                            <li><strong>Кількість:</strong> ${quantity}</li>
                            <li><strong>Загальна вартість:</strong> $${order.totalPrice}</li>
                            <li><strong>Статус:</strong> ${order.status}</li>
                        </ul>
                        <p>Будь ласка, перевірте деталі замовлення в адмін-панелі.</p>
                    `
                });
                logger.info(`Сповіщення про нове замовлення email надіслано власнику для замовлення ${order.id}`);
            } catch (emailError) {
                logger.error(`Помилка надсилання email сповіщення власнику для замовлення ${order.id}: ${emailError.message}`, emailError);
            }
        } else {
            logger.warn('Змінна середовища OWNER_EMAIL не встановлена. Сповіщення власнику не надіслано.');
        }

        await t.commit();
        logger.info(`Замовлення успішно створено: ${order.id} користувачем ${req.user.username}`);
        res.status(201).json({ message: 'Замовлення успішно оформлено', orderId: order.id, order });

    } catch (error) {
        if (t && !t.finished) {
            await t.rollback();
            logger.warn(`Транзакція для створення замовлення відкочена через помилку.`);
        }
        logger.error(`Помилка при створенні замовлення: ${error.message}`, error);
        next(error);
    }
});

// Маршрут для отримання замовлень поточного користувача
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await Order.findAll({
      where: { userId: userId },
      include: [
        { model: User, attributes: ['username', 'email'] },
        { model: Product, attributes: ['name', 'price', 'imageUrl'] }
      ]
    });
    res.json(orders);
  } catch (error) {
    logger.error(`Orders fetch error for user ${req.user.username}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// Маршрут для оновлення статусу замовлення (для оформлення)
// Захищено authenticateToken, але може бути доповнений isAdmin, якщо це адмін-дія
router.patch('/orders/:orderId/status', authenticateToken, async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body; // Очікуємо новий статус, наприклад 'completed' або 'processed'

    // Перелік дозволених статусів, щоб уникнути довільних змін
    const allowedStatuses = ['processed', 'completed', 'cancelled']; // Додайте свої статуси

    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid or missing status.' });
    }

    try {
        const order = await Order.findOne({
            where: {
                id: orderId,
                userId: req.user.id // Переконайтеся, що користувач володіє замовленням
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found or you do not have permission to update it.' });
        }

        // Оновити статус замовлення
        await order.update({ status: status });
        logger.info(`Order ${orderId} status updated to ${status} by user ${req.user.username}`);

        // Можливо, тут також можна відправити email-сповіщення про зміну статусу
        // наприклад, якщо статус став 'completed'

        res.status(200).json({ message: `Order ${orderId} status updated to ${status}.`, order });
    } catch (error) {
        logger.error(`Failed to update status for order ${orderId}: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to update order status.' });
    }
});


// Маршрут для адміністратора, якщо він вам потрібен для перегляду всіх замовлень
router.get('/admin/orders', authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await Order.findAll({
            include: [
                { model: User, attributes: ['username', 'email'] },
                { model: Product, attributes: ['name', 'price', 'imageUrl'] }
            ]
        });
        res.json(orders);
    } catch (error) {
        logger.error(`Admin orders fetch error: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to fetch all orders.' });
    }
});

// Додайте маршрут для видалення замовлення
router.delete('/orders/:orderId', authenticateToken, async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findOne({
            where: {
                id: orderId,
                userId: req.user.id
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found or you do not have permission to delete it.' });
        }

        // Перед видаленням замовлення, поверніть кількість товару на склад
        const product = await Product.findByPk(order.productId);
        if (product) {
            await product.update({ stock: product.stock + order.quantity });
        }

        await order.destroy();

        res.status(200).json({ message: 'Order successfully removed.' });
    } catch (error) {
        logger.error(`Failed to delete order ${orderId} by user ${req.user.username}: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to remove order.' });
    }
});

module.exports = router;
