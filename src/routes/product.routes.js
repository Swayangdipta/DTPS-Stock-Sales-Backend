import { Router } from 'express';
import {
  getProducts, getProduct,
  createProduct, updateProduct, deleteProduct,
  getLowStockProducts,
} from '../controllers/product.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate, productSchema, productUpdateSchema } from '../utils/validators.js';

const router = Router();
router.use(protect);

router.get('/low-stock', getLowStockProducts);

router.route('/')
  .get(getProducts)
  .post(validate(productSchema), createProduct);

router.route('/:id')
  .get(getProduct)
  .put(validate(productUpdateSchema), updateProduct)
  .delete(deleteProduct);

export default router;