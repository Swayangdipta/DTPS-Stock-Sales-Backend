import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'CREATE_PRODUCT',   'UPDATE_PRODUCT',   'DELETE_PRODUCT',
        'CREATE_CATEGORY',  'UPDATE_CATEGORY',  'DELETE_CATEGORY',
        'CREATE_STOCK_LOG', 'UPDATE_STOCK_LOG', 'DELETE_STOCK_LOG',
        'BULK_IMPORT',      'EXPORT',
        'LOGIN',            'REGISTER',         'CHANGE_PASSWORD',
      ],
    },
    entity:    { type: String },              // 'Product', 'Category', etc.
    entityId:  { type: mongoose.Schema.Types.ObjectId },
    entityName:{ type: String },              // human-readable name snapshot
    changes: {
      before: { type: mongoose.Schema.Types.Mixed },
      after:  { type: mongoose.Schema.Types.Mixed },
    },
    meta:    { type: mongoose.Schema.Types.Mixed },  // extra context
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
      required: true,
    },
    username: { type: String },              // snapshot so it survives user deletion
    ip:       { type: String },
  },
  { timestamps: true }
);

// Index for fast queries by user + date
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

// Auto-expire old logs after 1 year (TTL index)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.model('AuditLog', auditLogSchema);