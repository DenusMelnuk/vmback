// ... ваш код міграції
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Змінено: Додано IF NOT EXISTS
    await queryInterface.sequelize.query(`CREATE TYPE "enum_users_role" AS ENUM ('admin', 'user') IF NOT EXISTS;`);

    await queryInterface.createTable('users', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      role: {
        type: 'enum_users_role', // Посилання на створений тип
        defaultValue: 'user'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') // Додайте це для коректної роботи
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') // Додайте це для коректної роботи
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('users');
    // Залишимо 'IF EXISTS' для `down` методу, це безпечно
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  }
};
