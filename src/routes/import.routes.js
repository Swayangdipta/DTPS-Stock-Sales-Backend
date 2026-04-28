import { Router } from 'express';
import { bulkImportProducts, getImportTemplate }
  from '../controllers/bulkImport.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.get( '/template',  protect, getImportTemplate);
router.post('/products',  protect, bulkImportProducts);

export default router;