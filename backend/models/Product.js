// models/Product.js
module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('products', {
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    price: { type: DataTypes.FLOAT, allowNull: false, validate: { isFloat: true, min: 0 } },
    stock: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 0 } },
    imageUrl: { type: DataTypes.STRING },
    // categoryId автоматично перетвориться на category_id завдяки underscored: true
  });

  // Асоціації для Product
  Product.associate = (models) => {
    Product.belongsTo(models.Category, { foreignKey: 'category_id' });
    Product.hasMany(models.Order, { foreignKey: 'product_id' });
  };

  return Product;
};
