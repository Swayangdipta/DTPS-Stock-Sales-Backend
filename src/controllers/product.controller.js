import Product  from '../models/Product.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { audit } from '../services/audit.service.js';

// GET /api/products  — search + filter + paginate
export const getProducts = async (req, res, next) => {
  try {
    const {
      search, category, lowStock,
      page = 1, limit = 20, sortBy = 'name', order = 'asc',
    } = req.query;

    const query = { isActive: true };

    // Full-text search
    if (search) query.$text = { $search: search };

    // Filter by category
    if (category) query.category = category;

    // Only low-stock items
    if (lowStock === 'true')
      query.$expr = { $lte: ['$currentStock', '$lowStockThreshold'] };

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = search ? { score: { $meta: 'textScore' } } : { [sortBy]: sortOrder };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate('category', 'name color')
      .sort(sortField)
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      count:   products.length,
      total,
      pages:   Math.ceil(total / limit),
      page:    Number(page),
      data:    products,
    });
  } catch (err) { next(err); }
};

// GET /api/products/:id
export const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name color');
    if (!product) throw new AppError('Product not found', 404);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

// POST /api/products
export const createProduct = async (req, res, next) => {
  try {
    // currentStock starts equal to baseStock
    const product = await Product.create({
      ...req.body,
      currentStock: req.body.baseStock,
      createdBy:    req.user._id,
    });

    audit({ action: 'CREATE_PRODUCT', entity: 'Product',
        entityId: product._id, entityName: product.name,
        after: product.toObject(), user: req.user, ip: req.ip });

    await product.populate('category', 'name color');
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError('SKU already exists', 409));
    next(err);
  }
};

// PUT /api/products/:id
export const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError('Product not found', 404);

    // If baseStock changed, adjust currentStock by the delta
    if (req.body.baseStock !== undefined && req.body.baseStock !== product.baseStock) {
      const delta = req.body.baseStock - product.baseStock;
      req.body.currentStock = Math.max(0, product.currentStock + delta);
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    ).populate('category', 'name color');

    const before = product.toObject();
    audit({ action: 'UPDATE_PRODUCT', entity: 'Product',
            entityId: updated._id, entityName: updated.name,
            changes: { before, after: updated.toObject() },
            user: req.user, ip: req.ip });

    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError('SKU already exists', 409));
    next(err);
  }
};

// DELETE /api/products/:id  (soft delete)
export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!product) throw new AppError('Product not found', 404);
    audit({ action: 'DELETE_PRODUCT', entity: 'Product',
        entityId: product._id, entityName: product.name,
        user: req.user, ip: req.ip }); 
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
};

// GET /api/products/low-stock  — quick alert feed
export const getLowStockProducts = async (req, res, next) => {
  try {
    const products = await Product.find({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    }).populate('category', 'name color').sort({ currentStock: 1 });

    res.json({ success: true, count: products.length, data: products });
  } catch (err) { next(err); }
};