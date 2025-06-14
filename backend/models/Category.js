// models/Category.js
module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define('categories', {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.TEXT }
  });

  // Асоціації для Category
  Category.associate = (models) => {
    Category.hasMany(models.Product, { foreignKey: 'categoryId' });
  };

  return Category;
};