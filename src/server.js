import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/error.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import stockLogRoutes from './routes/stockLog.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import exportRoutes from './routes/export.routes.js';
import importRoutes from './routes/import.routes.js';
import { Router }     from 'express';
import { getAuditLogs } from './controllers/auditLog.controller.js';
import { protect }    from './middleware/auth.middleware.js';

dotenv.config();

connectDB();

const app = express();

// Security & Parsing
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// Routes
app.use('/api/auth',      authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/stock-logs', stockLogRoutes);
app.use('/api/analytics',  analyticsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);

const auditRouter = Router();
auditRouter.get('/', protect, getAuditLogs);
app.use('/api/audit', auditRouter);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Global error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));