import { Router } from 'express';
import { register, login, getMe, changePassword } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate, registerSchema, loginSchema } from '../utils/validators.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login',    validate(loginSchema),    login);
router.get( '/me',       protect,                  getMe);
router.patch('/change-password', protect,          changePassword);

export default router;