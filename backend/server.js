const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const winston = require('winston');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises; // Використовуємо проміси для всіх файлових операцій
const dotenv = require('dotenv');
dotenv.config();

// --- Ініціалізація логування ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ // Додаємо консольний лог для розробки та Render
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
  exceptionHandlers: [ // Додаємо обробку неперехоплених винятків
    new winston.transports.File({ filename: 'exceptions.log' })
  ],
  rejectionHandlers: [ // Додаємо обробку неперехоплених відхилень промісів
    new winston.transports.File({ filename: 'rejections.log' })
  ]
});

// --- Ініціалізація додатку ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Налаштування статичної папки для зображень ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Налаштування Multer для завантаження файлів ---
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true }); // Створення папки рекурсивно
      cb(null, UPLOADS_DIR);
    } catch (err) {
      logger.error(`Failed to create uploads directory: ${err.message}`);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Зберігаємо оригінальне розширення файлу
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Обмеження розміру файлу 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    const error = new Error('Only JPEG and PNG images are allowed and file size must be less than 5MB');
    error.statusCode = 400; // Додаємо статус код для кращої обробки помилок
    cb(error);
  }
});

// --- Налаштування Sequelize ---
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432, // Забезпечте, що DB_PORT є числом, якщо він встановлений
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: (msg) => logger.debug(msg), // Використовуйте debug для логів Sequelize
    dialectOptions: { // Додайте SSL для Render PostgreSQL
      ssl: {
        require: true,
        rejectUnauthorized: false // Може знадобитися для деяких хостингів, але краще уникнути, якщо можливо
      }
    }
  }
);

// --- Налаштування Nodemailer ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Використовуйте змінні оточення
    pass: process.env.EMAIL_PASS // Використовуйте змінні оточення
  }
});

// --- Моделі ---
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } }, // Додано валідацію
  role: { type: DataTypes.ENUM('admin', 'user'), defaultValue: 'user' }
});

const Category = sequelize.define('Category', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true }, // Категорії мають бути унікальними
  description: { type: DataTypes.TEXT }
});

const Product = sequelize.define('Product', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  price: { type: DataTypes.FLOAT, allowNull: false, validate: { isFloat: true, min: 0 } }, // Додано валідацію
  stock: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 0 } }, // Додано валідацію
  imageUrl: { type: DataTypes.STRING }
});

const Order = sequelize.define('Order', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 1 } }, // Додано валідацію
  status: { type: DataTypes.ENUM('reserved', 'completed', 'cancelled'), defaultValue: 'reserved' }
});

// --- Асоціації ---
Category.hasMany(Product, { foreignKey: 'categoryId' }); // Додано explicit foreign key
Product.belongsTo(Category, { foreignKey: 'categoryId' }); // Додано explicit foreign key
User.hasMany(Order, { foreignKey: 'userId' });
Product.hasMany(Order, { foreignKey: 'productId' }); // Замовлення може містити багато продуктів, але поточна модель передбачає 1 продукт на 1 замовлення. Це може бути змінено на Many-to-Many через проміжну таблицю.
Order.belongsTo(User, { foreignKey: 'userId' });
Order.belongsTo(Product, { foreignKey: 'productId' });

// --- Мідлвар для перевірки JWT ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    logger.warn('Authentication attempt without token');
    return res.status(401).json({ error: 'Access denied: No token provided' });
  }
  
  // Використовуйте process.env.JWT_SECRET
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.error(`Token verification failed: ${err.message}`);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// --- Мідлвар для перевірки адмін-прав ---
function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') { // Перевірка на існування req.user
    logger.warn(`Unauthorized admin access attempt by user: ${req.user ? req.user.username : 'unknown'}`);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// --- Роути автентифікації ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // Валідація вхідних даних
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required.' });
    }
    // Додайте перевірку на унікальність email, якщо модель не робить це автоматично (Sequelize робить)

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      email
    });
    
    logger.info(`User registered: ${username}`);
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    // Розрізнення помилок валідації/унікальності
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.error(`Registration error: Duplicate entry for ${error.fields ? Object.keys(error.fields).join(', ') : 'unknown field'}`);
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    logger.error(`Registration error: ${error.message}`, error); // Логування повного об'єкта помилки
    res.status(500).json({ error: 'An unexpected error occurred during registration.' }); // Загальна помилка для клієнта
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    // Валідація
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
    }, process.env.JWT_SECRET, { expiresIn: '24h' }); // Використовуємо JWT_SECRET
    
    logger.info(`User logged in: ${username}`);
    res.json({ token });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, error);
    res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// --- Роути для категорій ---
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.json(categories);
  } catch (error) {
    logger.error(`Categories fetch error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => {
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

// --- Роути для товарів ---
app.get('/api/products', async (req, res) => {
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

app.get('/api/products/:id', async (req, res) => {
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

app.post('/api/products', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, stock, categoryId } = req.body;
    
    if (!name || !price || !stock || !categoryId) {
      return res.status(400).json({ error: 'Name, price, stock, and categoryId are required.' });
    }

    let imageUrl = req.body.imageUrl; // Можливість передати URL вручну
    
    if (req.file) {
      const originalFilePath = req.file.path;
      const resizedFilename = `resized-${req.file.filename}`;
      const outputPath = path.join(UPLOADS_DIR, resizedFilename);
      
      try {
        await sharp(originalFilePath)
          .resize(300, 300, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .toFile(outputPath);
        
        imageUrl = `/uploads/${resizedFilename}`; // Переконайтеся, що шлях правильний для фронтенду
      } catch (sharpError) {
        logger.error(`Image processing error for ${req.file.filename}: ${sharpError.message}`, sharpError);
        return res.status(500).json({ error: 'Failed to process image.' });
      } finally {
        // Видалення оригінального файлу після обробки
        try {
          await fs.unlink(originalFilePath);
          logger.info(`Deleted original uploaded file: ${originalFilePath}`);
        } catch (unlinkError) {
          logger.warn(`Failed to delete original file ${originalFilePath}: ${unlinkError.message}`);
        }
      }
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
    // Перевірка на помилки Multer або валідації
    if (error instanceof multer.MulterError) {
      logger.error(`Multer error during product creation: ${error.message}`);
      return res.status(400).json({ error: `File upload error: ${error.message}` });
    }
    if (error.statusCode === 400) { // Кастомна помилка з Multer fileFilter
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error(`Product creation error: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

app.put('/api/products/:id', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      logger.warn(`Product not found for update with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const { name, description, price, stock, categoryId } = req.body;
    let imageUrl = product.imageUrl;

    if (req.file) {
      const originalFilePath = req.file.path;
      const resizedFilename = `resized-${req.file.filename}`;
      const outputPath = path.join(UPLOADS_DIR, resizedFilename);
      
      try {
        await sharp(originalFilePath)
          .resize(300, 300, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .toFile(outputPath);
        
        // Видаляємо старе зображення, якщо воно існує
        if (product.imageUrl) {
          const oldImagePath = path.join(__dirname, product.imageUrl);
          try {
            await fs.access(oldImagePath); // Перевіряємо, чи існує файл
            await fs.unlink(oldImagePath);
            logger.info(`Deleted old product image: ${oldImagePath}`);
          } catch (err) {
            if (err.code !== 'ENOENT') { // Ігноруємо, якщо файл не існує
              logger.warn(`Failed to delete old image ${oldImagePath}: ${err.message}`);
            }
          }
        }
        imageUrl = `/uploads/${resizedFilename}`;
      } catch (sharpError) {
        logger.error(`Image processing error during product update for ${req.file.filename}: ${sharpError.message}`, sharpError);
        return res.status(500).json({ error: 'Failed to process new image.' });
      } finally {
        // Видалення оригінального файлу після обробки
        try {
          await fs.unlink(originalFilePath);
          logger.info(`Deleted original uploaded file: ${originalFilePath}`);
        } catch (unlinkError) {
          logger.warn(`Failed to delete original file ${originalFilePath}: ${unlinkError.message}`);
        }
      }
    }

    await product.update({
      name: name || product.name, // Оновлюємо лише якщо надано
      description: description || product.description,
      price: price || product.price,
      stock: stock || product.stock,
      imageUrl: imageUrl,
      categoryId: categoryId || product.categoryId
    });

    logger.info(`Product updated: ${product.name} (ID: ${product.id}) by user ${req.user.username}`);
    res.json(product);
  } catch (error) {
    if (error instanceof multer.MulterError) {
      logger.error(`Multer error during product update: ${error.message}`);
      return res.status(400).json({ error: `File upload error: ${error.message}` });
    }
     if (error.statusCode === 400) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error(`Product update error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      logger.warn(`Product not found for deletion with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Видаляємо зображення, якщо воно існує
    if (product.imageUrl) {
      const imagePath = path.join(__dirname, product.imageUrl);
      try {
        await fs.access(imagePath); // Перевіряємо, чи існує файл
        await fs.unlink(imagePath);
        logger.info(`Deleted product image: ${imagePath}`);
      } catch (err) {
        if (err.code !== 'ENOENT') { // Ігноруємо, якщо файл не існує
          logger.warn(`Failed to delete image ${imagePath}: ${err.message}`);
        }
      }
    }

    await product.destroy();
    logger.info(`Product deleted: ${product.name} (ID: ${product.id}) by user ${req.user.username}`);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    logger.error(`Product deletion error for ID ${req.params.id}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// --- Роути для замовлень ---
app.post('/api/orders', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction(); // Починаємо транзакцію

  try {
    const { productId, quantity } = req.body;
    
    if (!productId || !quantity || quantity <= 0) {
      await t.rollback(); // Відкат транзакції
      return res.status(400).json({ error: 'Product ID and a positive quantity are required.' });
    }

    const product = await Product.findByPk(productId, { transaction: t }); // Використовуємо транзакцію
    
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
    
    await product.update({ stock: product.stock - quantity }, { transaction: t }); // Оновлюємо в транзакції
    
    const order = await Order.create({
      userId: req.user.id,
      productId,
      quantity,
      status: 'reserved'
    }, { transaction: t }); // Створюємо в транзакції
    
    // Відправка email
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: req.user.email,
        subject: 'Order Confirmation',
        text: `Your order for ${product.name} (Quantity: ${quantity}) has been reserved. Total price: $${(product.price * quantity).toFixed(2)}`
      });
      logger.info(`Order confirmation email sent to ${req.user.email} for order ${order.id}`);
    } catch (emailError) {
      logger.error(`Failed to send order confirmation email to ${req.user.email}: ${emailError.message}`);
      // Не відкатуємо транзакцію, оскільки замовлення все одно створено
    }

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.OWNER_EMAIL, // Використовуємо змінну оточення
        subject: 'New Order Placed',
        text: `New order for ${product.name} (Quantity: ${quantity}) by ${req.user.username}. Order ID: ${order.id}`
      });
      logger.info(`New order notification email sent to owner for order ${order.id}`);
    } catch (emailError) {
      logger.error(`Failed to send new order notification email to owner: ${emailError.message}`);
    }
    
    await t.commit(); // Завершуємо транзакцію
    logger.info(`Order created successfully: ${order.id} by user ${req.user.username}`);
    res.status(201).json({ message: 'Order placed successfully', orderId: order.id });
  } catch (error) {
    if (t && !t.finished) { // Перевірка, чи транзакція ще активна
      await t.rollback(); // Відкат транзакції у випадку помилки
      logger.warn(`Transaction for order creation rolled back due to error.`);
    }
    logger.error(`Order creation error for user ${req.user ? req.user.username : 'unknown'}: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

app.get('/api/orders', authenticateToken, isAdmin, async (req, res) => {
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

// --- Обробник помилок (повинен бути в кінці) ---
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err.stack);
  res.status(err.statusCode || 500).json({
    error: 'An unexpected error occurred.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined // Показуємо деталі лише в dev
  });
});

// --- Ініціалізація бази даних та запуск сервера ---
const PORT = process.env.PORT || 3000; // Використовуйте змінну оточення PORT

sequelize.authenticate()
  .then(() => {
    logger.info('Database connection has been established successfully.');
    return sequelize.sync({ force: false }); // `force: true` ТІЛЬКИ для розробки, щоб очистити БД
  })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => { // Слухаємо на 0.0.0.0 для зовнішніх підключень
      logger.info(`Server is running on port ${PORT}`);
      console.log(`Server is running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(error => {
    logger.error(`Failed to connect to database or initialize server: ${error.message}`, error);
    console.error('Failed to connect to database or initialize server:', error);
    process.exit(1); // Завершити процес, якщо сервер не може запуститися
  });
