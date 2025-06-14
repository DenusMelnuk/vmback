// models/Order.js
module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('orders', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 1 } },
    status: { type: DataTypes.ENUM('reserved', 'completed', 'cancelled'), defaultValue: 'reserved' }
  });

  // Асоціації для Order
  Order.associate = (models) => {
    Order.belongsTo(models.User, { foreignKey: 'userId' });
    Order.belongsTo(models.Product, { foreignKey: 'productId' });
  };

  return Order;
};