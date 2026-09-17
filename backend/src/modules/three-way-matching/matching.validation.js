import { z } from 'zod';

const uuidParam = z.object({ id: z.string().uuid('Invalid ID format') });
const requiredDate = (label) => z.coerce.date({
  required_error: `${label} is required`,
  invalid_type_error: `${label} must be a valid date`,
});

export const startMatchingSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid('Invalid invoice ID'),
    grnId:     z.string().uuid('Invalid GRN ID').optional(),
    deliveryChallanId: z.string().uuid('Invalid Delivery Challan ID').optional(),
  }),
});

export const matchIdSchema    = z.object({ params: uuidParam });
export const invoiceIdParam   = z.object({ params: z.object({ invoiceId: z.string().uuid() }) });
export const poIdParam        = z.object({ params: z.object({ poId:      z.string().uuid() }) });

export const adminReviewSchema = z.object({
  params: uuidParam,
  body: z.object({
    remarks: z.string().max(1000).trim().optional().default(''),
  }).optional().default({}),
});

export const adminRejectSchema = z.object({
  params: uuidParam,
  body: z.object({
    remarks: z.string().min(1, 'Remarks required for rejection').max(1000).trim(),
  }),
});

export const createGRNSchema = z.object({
  body: z.object({
    purchaseOrderId:   z.string().uuid('Invalid PO ID'),
    grnNumber:         z.string().trim().optional(),
    deliveryDate:      requiredDate('GRN Receipt Date'),
    receiptDate:       z.coerce.date().optional(),
    deliveryChallanId: z.string().uuid('Invalid Delivery Challan ID').optional(),
    deliveryChallanNo: z.string().trim().optional(),
    receiverName:      z.string().trim().min(1, 'Receiver Name is required'),
    receivedBy:        z.string().trim().optional(),
    attachmentUrl:     z.string().trim().optional(),
    attachmentName:    z.string().trim().optional(),
    deliveryAddress:   z.string().trim().optional(),
    billingAddress:    z.string().trim().optional(),
    deliveryTerms:     z.string().trim().optional(),
    paymentTerms:      z.string().trim().optional(),
    currency:          z.string().trim().optional().default('INR'),
    subtotal:          z.coerce.number().min(0).optional().default(0),
    gstAmount:         z.coerce.number().min(0).optional().default(0),
    discount:          z.coerce.number().min(0).optional().default(0),
    totalAmount:       z.coerce.number().min(0).optional().default(0),
    lineItems:         z.array(z.any()).optional(),
    remarks:           z.string().trim().optional(),
  }),
});

export const updateGRNSchema = z.object({
  params: uuidParam,
  body: z.object({
    deliveryDate:      z.coerce.date().optional(),
    receiptDate:       z.coerce.date().optional(),
    deliveryChallanId: z.string().uuid('Invalid Delivery Challan ID').optional(),
    deliveryChallanNo: z.string().trim().optional(),
    receiverName:      z.string().trim().optional(),
    receivedBy:        z.string().trim().optional(),
    attachmentUrl:     z.string().trim().optional(),
    attachmentName:    z.string().trim().optional(),
    deliveryAddress:   z.string().trim().optional(),
    billingAddress:    z.string().trim().optional(),
    deliveryTerms:     z.string().trim().optional(),
    paymentTerms:      z.string().trim().optional(),
    subtotal:          z.coerce.number().min(0).optional(),
    gstAmount:         z.coerce.number().min(0).optional(),
    discount:          z.coerce.number().min(0).optional(),
    totalAmount:       z.coerce.number().min(0).optional(),
    lineItems:         z.array(z.any()).optional(),
    remarks:           z.string().trim().optional(),
    status:            z.enum(['draft', 'verified', 'rejected']).optional(),
  }),
});

export const createDeliveryChallanSchema = z.object({
  body: z.object({
    purchaseOrderId: z.string().uuid('Invalid PO ID'),
    deliveryDate:   requiredDate('Delivery Challan Date'),
    deliveryAddress: z.string().trim().optional(),
    transporter:    z.string().trim().optional(),
    vehicleNumber:  z.string().trim().optional(),
    driverName:     z.string().trim().optional(),
    driverContact:  z.string().trim().optional(),
    deliveryStatus: z.string().trim().optional(),
    documentUrl:    z.string().trim().optional(),
    documentName:   z.string().trim().optional(),
    vehicleDetails: z.string().trim().optional(),
    currency:       z.string().trim().optional().default('INR'),
    subtotal:       z.coerce.number().min(0).optional().default(0),
    gstAmount:      z.coerce.number().min(0).optional().default(0),
    totalAmount:    z.coerce.number().min(0).optional().default(0),
    lineItems:      z.array(z.any()).optional(),
    remarks:        z.string().trim().optional(),
  }),
});

export const updateDeliveryChallanSchema = z.object({
  params: uuidParam,
  body: z.object({
    deliveryDate:   z.coerce.date().optional(),
    deliveryAddress: z.string().trim().optional(),
    transporter:    z.string().trim().optional(),
    vehicleNumber:  z.string().trim().optional(),
    driverName:     z.string().trim().optional(),
    driverContact:  z.string().trim().optional(),
    deliveryStatus: z.string().trim().optional(),
    documentUrl:    z.string().trim().optional(),
    documentName:   z.string().trim().optional(),
    vehicleDetails: z.string().trim().optional(),
    subtotal:       z.coerce.number().min(0).optional(),
    gstAmount:      z.coerce.number().min(0).optional(),
    totalAmount:    z.coerce.number().min(0).optional(),
    lineItems:      z.array(z.any()).optional(),
    remarks:        z.string().trim().optional(),
    status:         z.enum(['created', 'verified', 'cancelled']).optional(),
  }),
});

export const searchMatchesSchema = z.object({
  query: z.object({
    status:    z.enum(['PENDING', 'MATCHED', 'PARTIAL_MATCH', 'MISMATCH', 'UNMATCHED']).optional(),
    invoiceId: z.string().uuid().optional(),
    page:      z.coerce.number().int().positive().optional().default(1),
    limit:     z.coerce.number().int().positive().max(100).optional().default(20),
  }),
});

export default {
  startMatchingSchema,
  matchIdSchema,
  invoiceIdParam,
  poIdParam,
  adminReviewSchema,
  adminRejectSchema,
  createGRNSchema,
  updateGRNSchema,
  createDeliveryChallanSchema,
  updateDeliveryChallanSchema,
  searchMatchesSchema,
};
