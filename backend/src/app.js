import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Module Routes
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import vendorRoutes from './modules/vendors/vendor.routes.js';
import purchaseOrderRoutes from './modules/purchase-orders/po.routes.js';
import invoiceRoutes from './modules/invoices/invoice.routes.js';
import invoiceOcrRoutes from './modules/invoices/invoice.ocr.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import approvalRoutes from './modules/approvals/approval.routes.js';
import paymentApprovalRoutes from './modules/payment-approvals/payment-approval.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import auditRoutes from './modules/audit-logs/audit.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import matchingRoutes from './modules/three-way-matching/matching.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import lookupRoutes from './modules/lookups/lookup.routes.js';
import healthRoutes from './modules/health/health.routes.js';

import ApiError from './utils/ApiError.js';
import sanitizeObject from './utils/logSanitizer.js';
import errorHandler from './middleware/error.middleware.js';

const app = express();
app.set('etag', false);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const getRequestId = (req) => req.headers['x-request-id'] || randomUUID();

// ─── 1. Security & Global Middleware ─────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

const cleanOrigin = (url) => (url ? url.trim().replace(/\/$/, '') : null);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5173/',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5173/',
  process.env.FRONTEND_URL ? cleanOrigin(process.env.FRONTEND_URL) : null,
  process.env.FRONTEND_URL ? `${cleanOrigin(process.env.FRONTEND_URL)}/` : null,
  'https://vms-ten-zeta.vercel.app',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5173',
  'http://localhost:5176',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl/postman/mobile)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.trim().replace(/\/$/, '');
    const isDev = (process.env.NODE_ENV || 'development') !== 'production';
    const isLocalHost = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(normalizedOrigin);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes(normalizedOrigin) || (isDev && isLocalHost)) {
      return callback(null, origin);
    }
    return callback(null, false);
  },
  credentials:     true,
  methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-request-id'],
  optionsSuccessStatus: 200,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── 2. Body Parsers ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const contentType = req.headers['content-type'] || '';
  const methodCanCarryBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  if (contentType.includes('text/plain') || (!contentType && methodCanCarryBody)) {
    req.headers['content-type'] = 'application/json';
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads/vendor-documents', express.static(path.resolve(__dirname, '../uploads/vendor-documents')));
app.use('/uploads/invoices', express.static(path.resolve(__dirname, '../uploads/invoices')));

app.use('/api/v1', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// ─── 3. Request Logger (development only) ─────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    const sanitizedBody = sanitizeObject(req.body) ?? {};
    const sanitizedQuery = sanitizeObject(req.query) ?? {};
    const sanitizedParams = sanitizeObject(req.params) ?? {};
    const sanitizedHeaders = sanitizeObject(req.headers) ?? {};

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[Request] ${req.method} ${req.originalUrl}`);
    console.log(`  Content-Type : ${req.headers['content-type'] || 'NOT SET'}`);
    console.log(`  Headers      :`, JSON.stringify(sanitizedHeaders, null, 2));
    if (req.method !== 'GET' && Object.keys(sanitizedBody).length > 0) {
      console.log('  Body         :', JSON.stringify(sanitizedBody, null, 2));
    }
    if (Object.keys(sanitizedQuery).length > 0) {
      console.log('  Query        :', sanitizedQuery);
    }
    if (Object.keys(sanitizedParams).length > 0) {
      console.log('  Params       :', sanitizedParams);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    next();
  });
}

// ─── 4. Health Check Routes ───────────────────────────────────────────────────
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);

// ─── 5. API Routes ────────────────────────────────────────────────────────────

app.use('/api/v1/auth',               authRoutes);
app.use('/api/v1/users',              userRoutes);
app.use('/api/v1/vendors',            vendorRoutes);
app.use('/api/v1/purchase-orders',    purchaseOrderRoutes);
app.use('/api/v1/invoices',           invoiceRoutes);
app.use('/api/v1/ocr',                invoiceOcrRoutes);
app.use('/api/v1/payments',           paymentRoutes);
app.use('/api/v1/approvals',          approvalRoutes);
app.use('/api/v1/payment-approvals',  paymentApprovalRoutes);
app.use('/api/v1/dashboard',          dashboardRoutes);
app.use('/api/v1/audit-logs',         auditRoutes);
app.use('/api/v1/notifications',      notificationRoutes);
app.use('/api/v1/three-way-matching', matchingRoutes);
app.use('/api/v1/reports',           reportRoutes);
app.use('/api/v1/lookups',           lookupRoutes);

// ─── 6. 404 Handler ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
});

// ─── 7. Centralized Error Handler ─────────────────────────────────────────────
app.use(errorHandler);

export default app;
