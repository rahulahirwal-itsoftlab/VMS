import { z } from 'zod';

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid payment ID format'),
});

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid('Invalid invoice ID format'),
    installmentId: z.string().uuid('Invalid installment ID format').optional(),
    amount: z.coerce.number().positive('Payment amount must be greater than 0'),
    currency: z.string().trim().optional().default('INR'),
    paymentMethod: z.enum([
      'NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 
      'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'WALLET', 
      'ACH', 'WIRE_TRANSFER'
    ], { required_error: 'Payment method is required' }),
    paymentType: z.enum([
      'FULL', 'PARTIAL', 'ADVANCE', 'FINAL', 'SCHEDULED', 
      'RECURRING', 'REFUND', 'ADJUSTMENT'
    ]).optional().default('FULL'),
    paymentProvider: z.enum([
      'RAZORPAY', 'STRIPE', 'PAYPAL', 'CASHFREE', 
      'PHONEPE', 'PAYU', 'BANK_API', 'MANUAL'
    ]).optional().default('MANUAL'),
    providerTransactionId: z.string().trim().optional(),
    referenceNo: z.string().trim().optional(),
    gatewayReference: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
    dueDate: z.coerce.date().optional(),
    paymentDate: z.coerce.date().optional(),
  }),
});

export const paymentApproveSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().min(1, 'Remarks are required to approve this payment request.').max(1000).trim(),
    referenceNo: z.string().min(1, 'Transaction Reference Number / UTR is required.').trim(),
  }),
});

export const updatePaymentSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    amount: z.coerce.number().positive('Payment amount must be greater than 0').optional(),
    paymentMethod: z.string().trim().optional(),
    paymentType: z.string().trim().optional(),
    paymentProvider: z.string().trim().optional(),
    providerTransactionId: z.string().trim().optional(),
    gatewayReference: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
    dueDate: z.coerce.date().optional(),
    paymentDate: z.coerce.date().optional(),
  }),
});

export const paymentIdSchema = z.object({
  params: uuidParamSchema,
});

export const paymentStoreInvoiceSchema = z.object({
  params: z.object({
    invoiceId: z.string().uuid('Invalid invoice ID format'),
  }),
});

export const paymentActionSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().trim().optional(),
    referenceNo: z.string().trim().optional(),
  }).optional().default({}),
});

export const searchPaymentsSchema = z.object({
  query: z.object({
    status: z.enum([
      'PENDING', 'INITIATED', 'PROCESSING', 'SUCCESS', 'FAILED', 
      'CANCELLED', 'RETURNED', 'REFUNDED', 'PARTIALLY_PAID', 'COMPLETED'
    ]).optional(),
    invoiceId: z.string().uuid('Invalid invoice ID format').optional(),
    vendorId: z.string().uuid('Invalid vendor ID format').optional(),
    purchaseOrderId: z.string().uuid('Invalid purchase order ID format').optional(),
    paymentMethod: z.string().trim().optional(),
    paymentType: z.string().trim().optional(),
    paymentProvider: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    search: z.string().trim().optional(),
  }),
});
