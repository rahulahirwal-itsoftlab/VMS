import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import vendorController from './vendor.controller.js';
import { VENDOR_PERMISSIONS } from './vendor.permissions.js';
import {
  createVendorSchema,
  searchVendorsSchema,
  vendorActionSchema,
  vendorDocumentIdSchema,
  vendorDocumentSchema,
  vendorIdSchema,
} from './vendor.validation.js';
import { updateVendorSchema } from '../../zodSchema/vendor.schema.js';
import { uploadVendorDocument } from './vendor-document.upload.js';

const router = express.Router();

router.use(protect); 

router
  .route('/')
  .post(authorize(VENDOR_PERMISSIONS.CREATE), validate(createVendorSchema), vendorController.createVendor)
  .get(authorize(VENDOR_PERMISSIONS.READ), validate(searchVendorsSchema), vendorController.getVendors);

router
  .route('/:id')
  .get(authorize(VENDOR_PERMISSIONS.READ), validate(vendorIdSchema), vendorController.getVendorById)
  .put(authorize([...VENDOR_PERMISSIONS.CREATE, ...VENDOR_PERMISSIONS.REVIEW]), validate(updateVendorSchema), vendorController.updateVendor);

router
  .route('/:id/documents')
  .get(authorize(VENDOR_PERMISSIONS.READ), validate(vendorIdSchema), vendorController.listVendorDocuments)
  .post(authorize([...VENDOR_PERMISSIONS.CREATE, ...VENDOR_PERMISSIONS.REVIEW]), uploadVendorDocument, validate(vendorDocumentSchema), vendorController.uploadVendorDocument);

router
  .route('/:id/documents/:documentId')
  .put(authorize([...VENDOR_PERMISSIONS.CREATE, ...VENDOR_PERMISSIONS.REVIEW]), uploadVendorDocument, validate(vendorDocumentIdSchema), vendorController.replaceVendorDocument)
  .delete(authorize([...VENDOR_PERMISSIONS.CREATE, ...VENDOR_PERMISSIONS.REVIEW]), validate(vendorDocumentIdSchema), vendorController.deleteVendorDocument);

router.get('/:id/documents/:documentId/download', authorize(VENDOR_PERMISSIONS.READ), validate(vendorDocumentIdSchema), vendorController.downloadVendorDocument);

router.get('/:id/history', authorize(VENDOR_PERMISSIONS.READ), validate(vendorIdSchema), vendorController.getVendorHistory);
router.patch('/:id/approve', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.approveVendor);
router.patch('/:id/reject', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.rejectVendor);
router.patch('/:id/hold', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.holdVendor);
router.patch('/:id/block', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.blockVendor);
router.patch('/:id/unblock', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.unblockVendor);
router.patch('/:id/pending', authorize(VENDOR_PERMISSIONS.REVIEW), validate(vendorActionSchema), vendorController.returnVendorToPending);

export default router;

