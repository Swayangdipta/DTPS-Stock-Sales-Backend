import Joi from 'joi';

// ── Reusable middleware factory ────────────────────────────────────────────────
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const messages = error.details.map((d) => d.message).join(', ');
    return res.status(422).json({ success: false, message: messages });
  }
  next();
};

// ── Auth ──────────────────────────────────────────────────────────────────────
export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.alphanum': 'Username can only contain letters and numbers',
    'string.min':      'Username must be at least 3 characters',
    'any.required':    'Username is required',
  }),
  password: Joi.string().min(6).max(72).required().messages({
    'string.min':   'Password must be at least 6 characters',
    'any.required': 'Password is required',
  }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});

export const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

// ── Category ──────────────────────────────────────────────────────────────────
export const categorySchema = Joi.object({
  name:        Joi.string().min(2).max(50).required(),
  description: Joi.string().max(200).allow('').optional(),
  color:       Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive:    Joi.boolean().optional(),
});

// ── Product ───────────────────────────────────────────────────────────────────
export const productSchema = Joi.object({
  name:              Joi.string().min(2).max(100).required(),
  category:          Joi.string().hex().length(24).required(),
  price:             Joi.number().min(0).required(),
  baseStock:         Joi.number().integer().min(0).required(),
  lowStockThreshold: Joi.number().integer().min(0).optional(),
  sku:               Joi.string().max(50).allow('', null).optional(),
  description:       Joi.string().max(500).allow('').optional(),
  unit:              Joi.string().valid('pcs','kg','g','ltr','ml','box','pack').optional(),
  isActive:          Joi.boolean().optional(),
});

export const productUpdateSchema = productSchema.fork(
  ['name', 'category', 'price', 'baseStock'],
  (field) => field.optional()
);

// ── StockLog ──────────────────────────────────────────────────────────────────
const stockItemSchema = Joi.object({
  product:  Joi.string().hex().length(24).required(),
  quantity: Joi.number().integer().min(1).required(),
});

export const stockLogCreateSchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({ 'string.pattern.base': 'Date must be YYYY-MM-DD' }),
  soldItems:      Joi.array().items(stockItemSchema).default([]),
  restockedItems: Joi.array().items(stockItemSchema).default([]),
  notes:          Joi.string().max(500).allow('').optional(),
});

export const stockLogUpdateSchema = stockLogCreateSchema.fork(
  ['date'],
  (f) => f.optional()
);