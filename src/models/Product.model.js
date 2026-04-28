import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Product name is required'],
      trim:      true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    category: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Category',
      required: [true, 'Category is required'],
    },
    price: {
      type:     Number,
      required: [true, 'Price is required'],
      min:      [0, 'Price cannot be negative'],
    },
    baseStock: {
      type:     Number,
      required: [true, 'Base stock is required'],
      min:      [0, 'Base stock cannot be negative'],
      default:  0,
    },
    currentStock: {
      type:    Number,
      default: 0,
      min:     [0, 'Current stock cannot be negative'],
    },
    lowStockThreshold: {
      type:    Number,
      default: 10,  // alert when stock <= this value
    },
    sku: {
      type:   String,
      trim:   true,
      unique: true,
      sparse: true,  // allow multiple nulls
    },
    description: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default:   '',
    },
    unit: {
      type:    String,
      enum:    ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pack'],
      default: 'pcs',
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Virtual: is stock low?
productSchema.virtual('isLowStock').get(function () {
  return this.currentStock <= this.lowStockThreshold;
});

// Index for fast search & filtering
productSchema.index({ name: 'text', sku: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ currentStock: 1 });

export default mongoose.model('Product', productSchema);