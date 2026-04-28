import mongoose from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const soldItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity:    { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
  priceAtSale: { type: Number, required: true, min: 0 }, // snapshot of price at time of sale
  subtotal:    { type: Number, required: true, min: 0 }, // quantity × priceAtSale
}, { _id: false });

const restockedItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
}, { _id: false });

// ── Main Schema ───────────────────────────────────────────────────────────────

const stockLogSchema = new mongoose.Schema(
  {
    date: {
      type:     String,           // stored as 'YYYY-MM-DD' for easy querying
      required: [true, 'Date is required'],
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },
    soldItems:      { type: [soldItemSchema],      default: [] },
    restockedItems: { type: [restockedItemSchema], default: [] },

    totalRevenue:   { type: Number, default: 0 },
    totalItemsSold: { type: Number, default: 0 },
    totalRestocked: { type: Number, default: 0 },

    notes: {
      type:      String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default:   '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);

// One log entry per date — enforce at DB level
stockLogSchema.index({ date: 1 }, { unique: true });

// Pre-save: recalculate totals automatically
stockLogSchema.pre('save', function (next) {
  this.totalRevenue   = this.soldItems.reduce((sum, i) => sum + i.subtotal,  0);
  this.totalItemsSold = this.soldItems.reduce((sum, i) => sum + i.quantity,  0);
  this.totalRestocked = this.restockedItems.reduce((sum, i) => sum + i.quantity, 0);
  next();
});

export default mongoose.model('StockLog', stockLogSchema);