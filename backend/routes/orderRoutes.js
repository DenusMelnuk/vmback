const express = require('express');
const router = express.Router();
const { Order, Product, User } = require('../models');
const sequelize = require('../config/db'); // Імпорт екземпляра Sequelize для транзакцій
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');
const { sendEmail } = require('../config/nodemailerConfig'); // Функція для відправки email
const logger = require('../config/logger'); // Ваш логер

router.post('/orders', authenticateToken, async (req, res, next) => {
  // Починаємо транзакцію для атомарності операцій з базою даних
  const t = await sequelize.transaction();

  try {
    const { productId, quantity } = req.body;
    const userId = req.user.id; // ID користувача з токена

    // 1. Валідація вхідних даних
    if (!productId || !quantity || quantity <= 0) {
      await t.rollback(); // Відкат транзакції у випадку помилки валідації
      return res.status(400).json({ error: 'Product ID and a positive quantity are required.' });
    }

    // 2. Пошук товару
    const product = await Product.findByPk(productId, { transaction: t });

    if (!product) {
      await t.rollback();
      logger.warn(`Order attempt for non-existent product ID: ${productId} by user ${req.user.username}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    // 3. Перевірка наявності товару на складі
    if (product.stock < quantity) {
      await t.rollback();
      logger.warn(`Insufficient stock for product ${product.name} (ID: ${productId}). Requested: ${quantity}, Available: ${product.stock}`);
      return res.status(400).json({ error: `Insufficient stock for ${product.name}. Only ${product.stock} left.` });
    }

    // 4. Оновлення залишку товару
    await product.update({ stock: product.stock - quantity }, { transaction: t });

    // 5. Створення нового замовлення
    const order = await Order.create({
      userId: userId,
      productId: productId,
      quantity: quantity,
      status: 'reserved', // Початковий статус замовлення
      totalPrice: (product.price * quantity).toFixed(2) // Додаємо розрахунок загальної ціни
    }, { transaction: t });

    // 6. Отримання даних користувача для email (якщо потрібно більше, ніж email з токена)
    // Якщо req.user.email і req.user.username достатньо, цей запит не потрібен.
    // Залежить від того, що повертає authenticateToken.
    const user = await User.findByPk(userId, { transaction: t, attributes: ['email', 'username'] });
    if (!user) {
        // Якщо користувач не знайдений, це може бути критична помилка або проблема з даними.
        // Можливо, варто відкотити транзакцію або просто пропустити відправку листа.
        logger.error(`User with ID ${userId} not found for order ${order.id}. Email cannot be sent.`);
        // Продовжуємо, але лист не відправляємо
    }


    // --- Інтеграція мейлера ---

    // Відправка email користувачу
    if (user && user.email) {
        try {
            await sendEmail({
                from: process.env.EMAIL_USER, // Адреса відправника
                to: user.email, // Адреса отримувача
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
            // НЕ відкочуємо транзакцію, оскільки замовлення успішно створено.
            // Можливо, варто додати замовлення до черги для повторної спроби надсилання листа.
        }
    } else {
        logger.warn(`Не вдалося відправити email користувачу ${req.user.username}: адреса email не знайдена.`);
    }


    // Відправка email власнику (або адміністратору)
    if (process.env.OWNER_EMAIL) {
        try {
            await sendEmail({
                from: process.env.EMAIL_USER,
                to: process.env.OWNER_EMAIL, // Адреса власника/адміністратора
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
            // Знову ж таки, не відкочуємо транзакцію
        }
    } else {
        logger.warn('Змінна середовища OWNER_EMAIL не встановлена. Сповіщення власнику не надіслано.');
    }

    // --- Кінець інтеграції мейлера ---

    // 7. Фіксація транзакції
    await t.commit();
    logger.info(`Замовлення успішно створено: ${order.id} користувачем ${req.user.username}`);
    res.status(201).json({ message: 'Замовлення успішно оформлено', orderId: order.id, order });

  } catch (error) {
    // 8. Відкат транзакції у випадку будь-якої помилки перед коммітом
    if (t && !t.finished) {
      await t.rollback();
      logger.warn(`Транзакція для створення замовлення відкочена через помилку.`);
    }
    logger.error(`Помилка при створенні замовлення: ${error.message}`, error);
    next(error); // Прокидаємо помилку до централізованого обробника помилок
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
    logger.error(`Помилка отримання замовлень (доступ адміністратора): ${error.message}`, error);
    res.status(500).json({ error: 'Не вдалося отримати замовлення.' });
  }
});

module.exports = router;
