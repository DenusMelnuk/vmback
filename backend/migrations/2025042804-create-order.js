const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    // Створюємо ENUM тип окремо
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_orders_status" AS ENUM ('reserved', 'completed', 'cancelled');
    `);

    await queryInterface.createTable('orders', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: 'enum_orders_status',
        defaultValue: 'reserved',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('orders');
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_orders_status";`);
  },
};
