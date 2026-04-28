import { Router } from 'express';
import {
  getCategories, getCategory,
  createCategory, updateCategory, deleteCategory,
} from '../controllers/category.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate, categorySchema } from '../utils/validators.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(getCategories)
  .post(validate(categorySchema), createCategory);

router.route('/:id')
  .get(getCategory)
  .put(validate(categorySchema), updateCategory)
  .delete(deleteCategory);

export default router;