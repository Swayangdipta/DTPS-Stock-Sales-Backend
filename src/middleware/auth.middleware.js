import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware.js';
import User from '../models/User.model.js';

export const protect = async (req, res, next) => {
  try {
    // backend/src/middleware/auth.middleware.js — update token extraction:
    const token =
      req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : req.query.token || null;  // ← fallback for direct download links

    if (!token) throw new AppError('No token — access denied', 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) throw new AppError('User not found', 401);

    next();
  } catch (err) {
    next(err);
  }
};