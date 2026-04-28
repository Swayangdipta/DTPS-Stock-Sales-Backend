import { Router } from 'express';
import {
  getStockLogs, getStockLogByDate,
  createStockLog, updateStockLog, deleteStockLog,
  getTodaySummary,
} from '../controllers/stockLog.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate, stockLogCreateSchema, stockLogUpdateSchema } from '../utils/validators.js';

const router = Router();
router.use(protect);

router.get('/summary/today', getTodaySummary);

router.route('/')
  .get(getStockLogs)
  .post(validate(stockLogCreateSchema), createStockLog);

router.route('/:date')
  .get(getStockLogByDate)
  .put(validate(stockLogUpdateSchema), updateStockLog)
  .delete(deleteStockLog);

export default router;