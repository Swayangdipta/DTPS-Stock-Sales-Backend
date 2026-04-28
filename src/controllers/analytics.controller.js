import dayjs from 'dayjs';
import StockLog from '../models/StockLog.model.js';
import Product  from '../models/Product.model.js';
import { AppError } from '../middleware/error.middleware.js';

// ── Helper: date range strings ────────────────────────────────────────────────
const ranges = () => {
  const today     = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const yearStart  = dayjs().startOf('year').format('YYYY-MM-DD');
  return { today, monthStart, yearStart };
};

// ── GET /api/analytics/summary ────────────────────────────────────────────────
export const getSummary = async (req, res, next) => {
  try {
    const { today, monthStart, yearStart } = ranges();

    // Single aggregation pipeline — one DB round trip
    const [result] = await StockLog.aggregate([
      {
        $facet: {
          todayData: [
            { $match: { date: today } },
            { $project: { totalRevenue: 1, totalItemsSold: 1 } },
          ],
          monthData: [
            { $match: { date: { $gte: monthStart, $lte: today } } },
            {
              $group: {
                _id:          null,
                revenue:      { $sum: '$totalRevenue'   },
                itemsSold:    { $sum: '$totalItemsSold' },
                activeDays:   { $sum: 1 },
              },
            },
          ],
          yearData: [
            { $match: { date: { $gte: yearStart, $lte: today } } },
            {
              $group: {
                _id:       null,
                revenue:   { $sum: '$totalRevenue'   },
                itemsSold: { $sum: '$totalItemsSold' },
              },
            },
          ],
        },
      },
    ]);

    const todayLog   = result.todayData[0]  || {};
    const monthStats = result.monthData[0]  || {};
    const yearStats  = result.yearData[0]   || {};

    // Low stock count
    const lowStockCount = await Product.countDocuments({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    });

    // Total active products
    const totalProducts = await Product.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: {
        today: {
          revenue:   todayLog.totalRevenue   || 0,
          itemsSold: todayLog.totalItemsSold || 0,
        },
        month: {
          revenue:    monthStats.revenue    || 0,
          itemsSold:  monthStats.itemsSold  || 0,
          activeDays: monthStats.activeDays || 0,
        },
        year: {
          revenue:   yearStats.revenue   || 0,
          itemsSold: yearStats.itemsSold || 0,
        },
        overview: {
          totalProducts,
          lowStockCount,
        },
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/top-products ──────────────────────────────────────────
// Query: period=week|month|year, limit=5
export const getTopProducts = async (req, res, next) => {
  try {
    const { period = 'month', limit = 8 } = req.query;
    const { today } = ranges();

    const periodMap = {
      week:  dayjs().subtract(7,  'day').format('YYYY-MM-DD'),
      month: dayjs().startOf('month').format('YYYY-MM-DD'),
      year:  dayjs().startOf('year').format('YYYY-MM-DD'),
    };
    const startDate = periodMap[period] || periodMap.month;

    const topProducts = await StockLog.aggregate([
      { $match: { date: { $gte: startDate, $lte: today } } },
      { $unwind: '$soldItems' },
      {
        $group: {
          _id:      '$soldItems.product',
          totalQty: { $sum: '$soldItems.quantity' },
          revenue:  { $sum: '$soldItems.subtotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: Number(limit) },
      {
        $lookup: {
          from:         'products',
          localField:   '_id',
          foreignField: '_id',
          as:           'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from:         'categories',
          localField:   'product.category',
          foreignField: '_id',
          as:           'category',
        },
      },
      {
        $project: {
          name:         '$product.name',
          categoryName: { $arrayElemAt: ['$category.name',  0] },
          categoryColor:{ $arrayElemAt: ['$category.color', 0] },
          currentStock: '$product.currentStock',
          price:        '$product.price',
          totalQty:     1,
          revenue:      1,
        },
      },
    ]);

    res.json({ success: true, data: topProducts });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/trends/daily ──────────────────────────────────────────
// Last N days of revenue + qty sold
export const getDailyTrends = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = dayjs().subtract(Number(days) - 1, 'day').format('YYYY-MM-DD');
    const today     = dayjs().format('YYYY-MM-DD');

    const logs = await StockLog.find({
      date: { $gte: startDate, $lte: today },
    })
    .select('date totalRevenue totalItemsSold totalRestocked')
    .sort({ date: 1 });

    // Fill in missing dates with zeros
    const logMap = new Map(logs.map((l) => [l.date, l]));
    const filled = [];
    for (let i = 0; i < Number(days); i++) {
      const date = dayjs().subtract(Number(days) - 1 - i, 'day').format('YYYY-MM-DD');
      const log  = logMap.get(date);
      filled.push({
        date,
        label:     dayjs(date).format('DD MMM'),
        revenue:   log?.totalRevenue   || 0,
        itemsSold: log?.totalItemsSold || 0,
        restocked: log?.totalRestocked || 0,
      });
    }

    res.json({ success: true, data: filled });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/trends/monthly ────────────────────────────────────────
export const getMonthlyTrends = async (req, res, next) => {
  try {
    const { months = 12 } = req.query;

    const trends = await StockLog.aggregate([
      {
        $match: {
          date: {
            $gte: dayjs().subtract(Number(months) - 1, 'month')
                          .startOf('month').format('YYYY-MM-DD'),
          },
        },
      },
      {
        $group: {
          _id:       { $substr: ['$date', 0, 7] }, // 'YYYY-MM'
          revenue:   { $sum: '$totalRevenue'   },
          itemsSold: { $sum: '$totalItemsSold' },
          days:      { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month:     '$_id',
          label:     '$_id',
          revenue:   1,
          itemsSold: 1,
          days:      1,
          _id:       0,
        },
      },
    ]);

    // Fill missing months with zeros
    const filled = [];
    for (let i = Number(months) - 1; i >= 0; i--) {
      const month = dayjs().subtract(i, 'month').format('YYYY-MM');
      const found = trends.find((t) => t.month === month);
      filled.push(
        found || {
          month,
          label:     dayjs(month).format('MMM YY'),
          revenue:   0,
          itemsSold: 0,
          days:      0,
        }
      );
    }

    // Format labels
    filled.forEach((f) => {
      f.label = dayjs(f.month).format('MMM YY');
    });

    res.json({ success: true, data: filled });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/low-stock ─────────────────────────────────────────────
export const getLowStock = async (req, res, next) => {
  try {
    const products = await Product.find({
      isActive: true,
      $expr:    { $lte: ['$currentStock', '$lowStockThreshold'] },
    })
    .populate('category', 'name color')
    .sort({ currentStock: 1 })
    .limit(20);

    res.json({ success: true, count: products.length, data: products });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/category-revenue ──────────────────────────────────────
export const getCategoryRevenue = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const periodMap = {
      week:  dayjs().subtract(7,  'day').format('YYYY-MM-DD'),
      month: dayjs().startOf('month').format('YYYY-MM-DD'),
      year:  dayjs().startOf('year').format('YYYY-MM-DD'),
    };
    const startDate = periodMap[period] || periodMap.month;
    const today     = dayjs().format('YYYY-MM-DD');

    const data = await StockLog.aggregate([
      { $match: { date: { $gte: startDate, $lte: today } } },
      { $unwind: '$soldItems' },
      {
        $lookup: {
          from:         'products',
          localField:   'soldItems.product',
          foreignField: '_id',
          as:           'productDoc',
        },
      },
      { $unwind: '$productDoc' },
      {
        $lookup: {
          from:         'categories',
          localField:   'productDoc.category',
          foreignField: '_id',
          as:           'categoryDoc',
        },
      },
      { $unwind: '$categoryDoc' },
      {
        $group: {
          _id:     '$categoryDoc._id',
          name:    { $first: '$categoryDoc.name'  },
          color:   { $first: '$categoryDoc.color' },
          revenue: { $sum: '$soldItems.subtotal'  },
          qty:     { $sum: '$soldItems.quantity'  },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) { next(err); }
};