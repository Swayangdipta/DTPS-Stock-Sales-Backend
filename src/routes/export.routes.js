import { Router } from 'express';
import { exportCSV, exportExcel, exportPDF, getExportPreview }
  from '../controllers/export.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();
router.use(protect);

router.get('/preview', getExportPreview);
router.get('/csv',     exportCSV);
router.get('/excel',   exportExcel);
router.get('/pdf',     exportPDF);

export default router;