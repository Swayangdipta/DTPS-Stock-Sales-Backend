import mongoose from 'mongoose';
import dayjs from 'dayjs';
import StockLog from '../models/StockLog.model.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  validateAndEnrichItems,
  applyStockChanges,
  reverseStockChanges,
} from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

// ── GET /api/stock-logs ───────────────────────────────────────────────────────
// Query params: month (YYYY-MM), startDate, endDate, page, limit
export const getStockLogs = async (req, res, next) => {
  try {
    const { month, startDate, endDate, page = 1, limit = 31 } = req.query;
    const filter = {};

    if (month) {
      // All logs for a given month
      filter.date = {
        $gte: `${month}-01`,
        $lte: `${month}-31`,
      };
    } else if (startDate && endDate) {
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const logs = await StockLog.find(filter)
      .populate('soldItems.product',      'name price unit category')
      .populate('restockedItems.product', 'name unit')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await StockLog.countDocuments(filter);

    res.json({ success: true, total, data: logs });
  } catch (err) { next(err); }
};

// ── GET /api/stock-logs/:date ─────────────────────────────────────────────────
export const getStockLogByDate = async (req, res, next) => {
  try {
    const log = await StockLog.findOne({ date: req.params.date })
      .populate({
        path:     'soldItems.product',
        select:   'name price unit category',
        populate: { path: 'category', select: 'name color' },
      })
      .populate('restockedItems.product', 'name unit')
      .populate('createdBy',              'username');

    // Return empty structure if no log exists yet for this date
    if (!log) {
      return res.json({
        success: true,
        data:    null,
        message: 'No entry for this date',
      });
    }

    res.json({ success: true, data: log });
  } catch (err) { next(err); }
};

// ── POST /api/stock-logs ──────────────────────────────────────────────────────
export const createStockLog = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { date, soldItems = [], restockedItems = [], notes } = req.body;

    // Prevent duplicate date
    const existing = await StockLog.findOne({ date });
    if (existing) {
      throw new AppError(
        `A log for ${date} already exists. Use PUT to update it.`, 409
      );
    }

    const { enrichedSold, netChange } =
      await validateAndEnrichItems(soldItems, restockedItems);

    // Create the log
    const [log] = await StockLog.create(
      [{ date, soldItems: enrichedSold, restockedItems, notes, createdBy: req.user._id }],
      { session }
    );

    // Update product stocks
    await applyStockChanges(netChange);

    await session.commitTransaction();
    await log.populate([
      { path: 'soldItems.product',      select: 'name price unit' },
      { path: 'restockedItems.product', select: 'name unit' },
    ]);

    audit({ action: 'CREATE_STOCK_LOG', entity: 'StockLog',
        entityId: log._id, entityName: log.date,
        after: { date: log.date, totalRevenue: log.totalRevenue,
                 soldItems: log.soldItems.length },
        user: req.user, ip: req.ip });

    res.status(201).json({ success: true, data: log });
  } catch (err) {
    console.log('typeof next:', typeof next);
    console.error(err);

    await session.abortTransaction();

    if (typeof next === 'function') {
      return next(err);
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};

// ── PUT /api/stock-logs/:date ─────────────────────────────────────────────────
// Replaces the entire log for that date and recalculates all stock
export const updateStockLog = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { soldItems = [], restockedItems = [], notes } = req.body;
    const { date } = req.params;

    const existing = await StockLog.findOne({ date });
    if (!existing) throw new AppError('Log not found for this date', 404);

    // Step 1: reverse previous stock changes
    await reverseStockChanges(existing);

    // Step 2: validate + enrich new items
    const { enrichedSold, netChange } =
      await validateAndEnrichItems(soldItems, restockedItems);

    // Step 3: apply new changes
    await applyStockChanges(netChange);

    // Step 4: update the log document
    existing.soldItems      = enrichedSold;
    existing.restockedItems = restockedItems;
    existing.notes          = notes || '';
    await existing.save({ session });

    await session.commitTransaction();
    await existing.populate([
      { path: 'soldItems.product',      select: 'name price unit' },
      { path: 'restockedItems.product', select: 'name unit' },
    ]);

    res.json({ success: true, data: existing });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE /api/stock-logs/:date ──────────────────────────────────────────────
export const deleteStockLog = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const log = await StockLog.findOne({ date: req.params.date });
    if (!log) throw new AppError('Log not found', 404);

    // Reverse all stock changes before deleting
    await reverseStockChanges(log);
    await StockLog.deleteOne({ date: req.params.date }, { session });

    await session.commitTransaction();
    res.json({ success: true, message: 'Stock log deleted and stock restored' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ── GET /api/stock-logs/summary/today ────────────────────────────────────────
export const getTodaySummary = async (req, res, next) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const log   = await StockLog.findOne({ date: today })
      .populate('soldItems.product', 'name price unit');

    res.json({
      success: true,
      data: log || {
        date: today, soldItems: [], restockedItems: [],
        totalRevenue: 0, totalItemsSold: 0, totalRestocked: 0,
      },
    });
  } catch (err) { next(err); }
};