import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import paymentController from './payment.controller.js';
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentActionSchema,
  paymentApproveSchema,
  paymentIdSchema,
  paymentStoreInvoiceSchema,
  searchPaymentsSchema,
} from './payment.validation.js';
import { PERMISSION_KEYS } from '../auth/role-permissions.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

const READ_ACCESS = [PERMISSION_KEYS.VIEW_PAYMENTS];
const CREATE_ACCESS = [PERMISSION_KEYS.CREATE_PAYMENT_REQUEST, ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN];
const REVIEW_ACCESS = [PERMISSION_KEYS.EXECUTE_PAYMENT, ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN];

router.use(protect);

router.get('/stats', authorize(READ_ACCESS), paymentController.getPaymentStats);
router.get('/creation-stats', authorize(CREATE_ACCESS), paymentController.getPaymentCreationStats);
router.get('/eligible-invoices', authorize(CREATE_ACCESS), paymentController.getEligibleInvoices);
router.get('/payment-store/:invoiceId', authorize(CREATE_ACCESS), validate(paymentStoreInvoiceSchema), paymentController.getPaymentStoreData);
router.get('/pending', authorize(REVIEW_ACCESS), validate(searchPaymentsSchema), paymentController.getPendingPayments);
router.get('/completed', authorize(READ_ACCESS), validate(searchPaymentsSchema), paymentController.getCompletedPayments);

router
  .route('/')
  .post(authorize(CREATE_ACCESS), validate(createPaymentSchema), paymentController.createPayment)
  .get(authorize(READ_ACCESS), validate(searchPaymentsSchema), paymentController.getPayments);

router
  .route('/:id')
  .get(authorize(READ_ACCESS), validate(paymentIdSchema), paymentController.getPaymentById)
  .put(authorize(CREATE_ACCESS), validate(updatePaymentSchema), paymentController.updatePayment)
  .delete(authorize([ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD]), validate(paymentIdSchema), paymentController.deletePayment);

router.get('/:id/history', authorize(READ_ACCESS), validate(paymentIdSchema), paymentController.getPaymentHistory);

router.patch('/:id/approve', authorize(REVIEW_ACCESS), validate(paymentApproveSchema), paymentController.approvePayment);
router.patch('/:id/reject', authorize(REVIEW_ACCESS), validate(paymentActionSchema), paymentController.rejectPayment);
router.patch('/:id/return', authorize(REVIEW_ACCESS), validate(paymentActionSchema), paymentController.returnPayment);
router.patch('/:id/cancel', authorize(READ_ACCESS), validate(paymentActionSchema), paymentController.cancelPayment);
router.patch('/:id/refund', authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]), validate(paymentActionSchema), paymentController.refundPayment);
router.post('/:id/retry', authorize(REVIEW_ACCESS), validate(paymentIdSchema), paymentController.retryPayment);

export default router;
