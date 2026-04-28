import AuditLog from '../models/AuditLog.model.js';

export const getAuditLogs = async (req, res, next) => {
  try {
    const { action, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (action) filter.action = action;

    const total = await AuditLog.countDocuments(filter);
    const logs  = await AuditLog.find(filter)
      .populate('user', 'username')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ success: true, total,
               pages: Math.ceil(total / limit), data: logs });
  } catch (err) { next(err); }
};