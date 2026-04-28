import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Category name is required'],
      unique:    true,
      trim:      true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    description: {
      type:      String,
      trim:      true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
      default:   '',
    },
    color: {
      type:    String,
      default: '#6366f1', // indigo — used for UI badges
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

// Virtual: count products in this category
categorySchema.virtual('productCount', {
  ref:         'Product',
  localField:  '_id',
  foreignField: 'category',
  count:       true,
});

export default mongoose.model('Category', categorySchema);