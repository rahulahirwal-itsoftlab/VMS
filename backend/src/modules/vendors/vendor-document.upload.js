import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import ApiError from '../../utils/ApiError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const VENDOR_DOCUMENT_UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/vendor-documents');

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

fs.mkdirSync(VENDOR_DOCUMENT_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VENDOR_DOCUMENT_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new ApiError(400, 'Only PDF, PNG, JPG, and JPEG files are allowed.'));
  }
  return cb(null, true);
};

export const uploadVendorDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single('file');

export const removeUploadedFile = (filePath) => {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
};
