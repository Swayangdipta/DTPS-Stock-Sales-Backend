import { Router } from 'express';
import {
  getSummary, getTopProducts,
  getDailyTrends, getMonthlyTrends,
  getLowStock, getCategoryRevenue,
} from '../controllers/analytics.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();
router.use(protect);

router.get('/summary',          getSummary);
router.get('/top-products',     getTopProducts);
router.get('/trends/daily',     getDailyTrends);
router.get('/trends/monthly',   getMonthlyTrends);
router.get('/low-stock',        getLowStock);
router.get('/category-revenue', getCategoryRevenue);

export default router;