import { z } from 'zod';

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid purchase order ID - must be a valid UUID'),
});

const numberInput = (schema) => z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}, schema);

const quantitySchema = numberInput(
  z.number({ invalid_type_error: 'Quantity must be a valid number' })
    .positive('Quantity must be greater than 0'),
);

const unitPriceSchema = numberInput(
  z.number({ invalid_type_error: 'Unit price must be a valid number' })
    .nonnegative('Unit price cannot be negative')
    .optional(),
);

const gstRateSchema = numberInput(
  z.number({ invalid_type_error: 'GST rate must be a valid number' })
    .min(0, 'GST rate cannot be negative')
    .max(100, 'GST rate cannot exceed 100')
    .optional()
    .default(0),
);

const otherChargesSchema = numberInput(
  z.number({ invalid_type_error: 'Other charges must be a valid number' })
    .nonnegative('Other charges cannot be negative')
    .optional()
    .default(0),
);

const stringOptional = z.preprocess(
  (val) => (val === null || val === '' ? undefined : val),
  z.string().trim().optional(),
);

const poItemSchema = z.object({
  itemName: z.string({ required_error: 'Item name is required' }).trim().min(1, 'Item name is required'),
  description: z.preprocess((val) => (val === null ? '' : val), z.string().trim().optional().default('')),
  unit: stringOptional,
  itemCode: stringOptional,
  quantity: quantitySchema,
  unitPrice: unitPriceSchema,
  rate: unitPriceSchema,
  gstRate: gstRateSchema,
}).refine((item) => item.unitPrice !== undefined || item.rate !== undefined, {
  message: 'Unit price or rate is required',
  path: ['unitPrice'],
});

// Permissive item schema used only for the calculate-tax endpoint.
// Item name, unit, and item code can be empty while the form is being typed.
const taxCalcItemSchema = z.object({
  itemName: z.string().trim().nullish().optional(),
  description: z.preprocess((val) => (val === null ? '' : val), z.string().trim().nullish().optional()),
  unit: stringOptional,
  itemCode: stringOptional,
  quantity: quantitySchema,
  unitPrice: unitPriceSchema,
  rate: unitPriceSchema,
  gstRate: gstRateSchema,
}).refine((item) => item.unitPrice !== undefined || item.rate !== undefined, {
  message: 'Unit price or rate is required',
  path: ['unitPrice'],
});

const purchaseOrderTaxPayloadSchema = z.object({
  vendorId: z
    .string({ required_error: 'Vendor ID is required' })
    .uuid('Invalid vendor ID - must be a valid UUID'),
  items: z.array(poItemSchema).min(1, 'At least one line item is required'),
  otherCharges: otherChargesSchema,
});

const calculateTaxPayloadSchema = z.object({
  vendorId: z
    .string({ required_error: 'Vendor ID is required' })
    .uuid('Invalid vendor ID - must be a valid UUID'),
  items: z.array(taxCalcItemSchema).min(1, 'At least one line item is required'),
  otherCharges: otherChargesSchema,
});

const requiredDate = (label) => z.preprocess(
  (val) => (val ? new Date(val) : undefined),
  z.date({
    required_error: `${label} is required`,
    invalid_type_error: `${label} must be a valid ISO date`,
  }),
);

const installmentItemSchema = z.object({
  installmentNumber: numberInput(
    z.number({ invalid_type_error: 'Installment number must be a valid number' })
      .int()
      .positive('Installment number must be a positive integer'),
  ),
  amount: numberInput(
    z.number({ invalid_type_error: 'Installment amount must be a valid number' })
      .positive('Installment amount must be greater than zero'),
  ),
  dueDate: z.preprocess(
    (val) => (val ? new Date(val) : undefined),
    z.date({
      required_error: 'Installment due date is required',
      invalid_type_error: 'Installment due date must be a valid ISO date',
    }),
  ),
  remarks: stringOptional,
});

export const createPurchaseOrderSchema = z.object({
  body: purchaseOrderTaxPayloadSchema.extend({
    currency: z.enum(['INR', 'USD', 'EUR']).optional().default('INR'),
    description: z.string().trim().optional(),
    billingAddress: z.string().trim().optional().default(''),
    deliveryAddress: z.string().trim().optional().default(''),
    orderDate: requiredDate('Purchase Order Date').optional().default(() => new Date()),
    expectedDeliveryDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ invalid_type_error: 'Expected delivery date must be a valid ISO date' }).optional(),
    ),
    items: z.array(poItemSchema).min(1, 'At least one line item is required'),
    otherCharges: otherChargesSchema,
    paymentTerms: z.string().trim().optional().default('Net 30'),
    paymentType: z.enum(['ONE_TIME', 'INSTALLMENT']).optional().default('ONE_TIME'),
    installmentDurationMonths: numberInput(
      z.number({ invalid_type_error: 'Installment duration must be a valid number' })
        .int()
        .positive('Installment duration must be a positive integer'),
    ).optional(),
    installments: z.array(installmentItemSchema).optional().default([]),
    poType: z.enum(['STANDARD', 'URGENT', 'DIRECT', 'BLANKET']).optional().default('STANDARD'),
    purchaseRequisitionNumber: z.string().trim().optional(),
    department: z.string().trim().optional(),
    costCenter: z.string().trim().optional(),
    requester: z.string().trim().optional(),
    buyer: z.string().trim().optional(),
    quotationDate: z.preprocess((val) => (val ? new Date(val) : undefined), z.date().optional()),
  }),
});

export const updatePurchaseOrderSchema = z.object({
  params: uuidParamSchema,
  body: purchaseOrderTaxPayloadSchema.extend({
    currency: z.enum(['INR', 'USD', 'EUR']).optional().default('INR'),
    description: z.string().trim().optional(),
    billingAddress: z.string().trim().optional(),
    deliveryAddress: z.string().trim().optional(),
    orderDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ invalid_type_error: 'Order date must be a valid ISO date' }).optional(),
    ),
    expectedDeliveryDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ invalid_type_error: 'Expected delivery date must be a valid ISO date' }).optional(),
    ),
    paymentTerms: z.string().optional(),
    paymentType: z.enum(['ONE_TIME', 'INSTALLMENT']).optional().default('ONE_TIME'),
    installmentDurationMonths: numberInput(
      z.number({ invalid_type_error: 'Installment duration must be a valid number' })
        .int()
        .positive('Installment duration must be a positive integer'),
    ).optional(),
    installments: z.array(installmentItemSchema).optional().default([]),
    reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
    poType: z.enum(['STANDARD', 'URGENT', 'DIRECT', 'BLANKET']).optional(),
    purchaseRequisitionNumber: z.string().trim().optional(),
    department: z.string().trim().optional(),
    costCenter: z.string().trim().optional(),
    requester: z.string().trim().optional(),
    buyer: z.string().trim().optional(),
    quotationDate: z.preprocess((val) => (val ? new Date(val) : undefined), z.date().optional()),
  }),
});

export const deletePurchaseOrderSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    deleteReason: z.string().trim().min(1, 'Delete reason is required.').max(500, 'Delete reason cannot exceed 500 characters'),
  }),
});

export const calculatePurchaseOrderTaxSchema = z.object({
  body: calculateTaxPayloadSchema,
});

export const purchaseOrderIdSchema = z.object({
  params: uuidParamSchema,
});

export const searchPurchaseOrdersSchema = z.object({
  query: z.object({
    status: z.enum(['created', 'closed', 'cancelled']).optional(),
    vendorId: z.string().uuid('Invalid vendor ID format').optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
  }),
});
