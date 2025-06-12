const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface) => {
    // Додаємо користувача
    await queryInterface.bulkInsert('users', [{
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      email: 'admin@example.com',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    // Додаємо категорії
    await queryInterface.bulkInsert('categories', [
      {
        name: 'Футболки',
        description: 'Спортивні футболки для тренувань',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Шорти',
        description: 'Спортивні шорти для бігу та тренувань',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Отримуємо ID створених категорій (важливо для зовнішніх ключів у products)
    const categories = await queryInterface.sequelize.query(
      `SELECT id, name FROM categories WHERE name IN ('Футболки', 'Шорти');`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const categoryMap = {};
    categories.forEach(cat => categoryMap[cat.name] = cat.id);

    // Додаємо продукти
    await queryInterface.bulkInsert('products', [
      {
        name: 'Футболка Nike Pro',
        description: 'Дихаюча футболка для інтенсивних тренувань',
        price: 29.99,
        stock: 100,
        imageUrl: '/uploads/nike-pro.jpg',
        categoryId: categoryMap['Футболки'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Шорти Adidas Run',
        description: 'Легкі шорти для бігу',
        price: 24.99,
        stock: 50,
        imageUrl: '/uploads/adidas-run.jpg',
        categoryId: categoryMap['Шорти'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('orders', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('categories', null, {});
    await queryInterface.bulkDelete('users', null, {});
  }
};
