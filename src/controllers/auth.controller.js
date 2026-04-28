import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { audit } from '../services/audit.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sendAuthResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id:       user._id,
      username: user.username,
      role:     user.role,
    },
  });
};

// ── Controllers ───────────────────────────────────────────────────────────────

// POST /api/auth/register
export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const exists = await User.findOne({ username });
    if (exists) throw new AppError('Username already taken', 409);

    const user = await User.create({ username, password });
    sendAuthResponse(user, 201, res);
    audit({ action: 'REGISTER', entity: 'User', entityId: user._id,
        entityName: user.username, user, ip: req.ip });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Explicitly select password (it's excluded by default)
    const user = await User.findOne({ username }).select('+password');
    if (!user) throw new AppError('Invalid credentials', 401);

    if (!user.isActive) throw new AppError('Account is disabled', 403);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new AppError('Invalid credentials', 401);

    // Update lastLogin timestamp
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendAuthResponse(user, 200, res);
    audit({ action: 'LOGIN', entity: 'User', entityId: user._id,
        entityName: user.username, user, ip: req.ip });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/change-password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new AppError('Current password is incorrect', 401);

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};