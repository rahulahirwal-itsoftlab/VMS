import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import invoiceController from './invoice.controller.js';
import { uploadInvoiceFile } from './invoice.upload.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

router.use(protect);

router.post(
  '/invoice',
  authorize([
    ROLES.CASE_MANAGER,
    ROLES.SUPER_ADMIN,
  ]),
  uploadInvoiceFile.single('invoiceFile'),
  invoiceController.processInvoiceOcr,
);

router.get(
  '/invoice/:ocrId/enrichment',
  authorize([
    ROLES.CASE_MANAGER,
    ROLES.FINANCE_HEAD,
    ROLES.SUPER_ADMIN,
  ]),
  invoiceController.getOcrInvoiceEnrichment,
);

export default router;
