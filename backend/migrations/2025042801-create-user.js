// ... ваш код міграції
const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Правильний синтаксис для створення ENUM типу з перевіркою IF NOT EXISTS
    // Це робиться за допомогою PL/pgSQL блоку, який перевіряє існування типу
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
              CREATE TYPE "enum_users_role" AS ENUM ('admin', 'user');
          END IF;
      END
      $$ LANGUAGE plpgsql;
    `);

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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('users');
    // Для `down` методу можна залишити `DROP TYPE IF EXISTS`, це безпечно
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  }
};
