import AuditLog from '../models/AuditLog.model.js';

/**
 * Fire-and-forget audit logger.
 * Never throws — audit failure should never break the main request.
 */
export const audit = async ({
  action, entity, entityId, entityName,
  before, after, meta, user, ip,
}) => {
  try {
    await AuditLog.create({
      action, entity, entityId, entityName,
      changes: before || after ? { before, after } : undefined,
      meta,
      user:     user?._id || user,
      username: user?.username,
      ip,
    });
  } catch (err) {
    // Silent fail — never crash the app for an audit write
    console.error('[AUDIT] Failed to write log:', err.message);
  }
};