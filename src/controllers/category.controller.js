import Category from '../models/Category.model.js';
import Product  from '../models/Product.model.js';
import { AppError } from '../middleware/error.middleware.js';

// GET /api/categories
export const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true })
      .populate('productCount')
      .sort({ name: 1 });

    res.json({ success: true, count: categories.length, data: categories });
  } catch (err) { next(err); }
};

// GET /api/categories/:id
export const getCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).populate('productCount');
    if (!category) throw new AppError('Category not found', 404);
    res.json({ success: true, data: category });
  } catch (err) { next(err); }
};

// POST /api/categories
export const createCategory = async (req, res, next) => {
  try {
    const category = await Category.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError('Category name already exists', 409));
    next(err);
  }
};

// PUT /api/categories/:id
export const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) throw new AppError('Category not found', 404);
    res.json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError('Category name already exists', 409));
    next(err);
  }
};

// DELETE /api/categories/:id
export const deleteCategory = async (req, res, next) => {
  try {
    // Prevent deletion if products exist
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0)
      throw new AppError(
        `Cannot delete — ${productCount} product(s) use this category`, 400
      );

    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) throw new AppError('Category not found', 404);

    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
};