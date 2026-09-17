import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const INVOICE_UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/invoices');
fs.mkdirSync(INVOICE_UPLOAD_DIR, { recursive: true });

const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, INVOICE_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeName = `${Date.now()}-${randomUUID()}${extension}`;
    cb(null, safeName);
  },
});

export const uploadInvoiceFile = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Invoice upload must be a PDF, PNG, JPG, JPEG, or TIFF file.'));
      return;
    }
    cb(null, true);
  },
});
