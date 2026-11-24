import { z } from 'zod';
import { ROLES } from './auth.model.js';
import { passwordSchema } from './auth.schema.js';
import { USER_ACCOUNT_STATUS_FILTER_VALUES } from '../modules/users/user-status.constants.js';

const userSortFields = ['created_at', 'employee_id', 'first_name', 'last_name', 'email', 'role', 'status'];
const accountStatusFilterSchema = z.enum(USER_ACCOUNT_STATUS_FILTER_VALUES, {
  errorMap: () => ({ message: `Status must be one of: ${USER_ACCOUNT_STATUS_FILTER_VALUES.join(', ')}` }),
});
const optionalText = (field, max = 100) => z.string()
  .trim()
  .max(max, `${field} must be ${max} characters or less`)
  .optional()
  .or(z.literal(''));

export const validateIndianPhoneString = (raw) => {
  if (raw === undefined || raw === null) return { isValid: true, value: undefined };
  const str = String(raw).trim();
  if (str === '') return { isValid: true, value: '' };

  // Remove spaces, hyphens, parentheses, dots
  const cleaned = str.replace(/[\s\-\(\)\.]/g, '');
  let nationalNumber = cleaned;
  let formatted = cleaned;

  if (cleaned.startsWith('+91')) {
    nationalNumber = cleaned.slice(3);
    formatted = '+91' + nationalNumber;
  } else if (cleaned.startsWith('+')) {
    return { isValid: false, message: 'Invalid Phone Number' };
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    nationalNumber = cleaned.slice(2);
    formatted = '+91' + nationalNumber;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    nationalNumber = cleaned.slice(1);
    formatted = nationalNumber;
  }

  // Indian mobile: exactly 10 digits starting with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(nationalNumber)) {
    return { isValid: false, message: 'Invalid Phone Number' };
  }
  return { isValid: true, value: formatted, nationalNumber };
};

const phoneSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    const res = validateIndianPhoneString(trimmed);
    if (res.isValid) return res.value;
  }
  return val;
}, z.string()
  .refine((val) => {
    if (!val) return true;
    return validateIndianPhoneString(val).isValid;
  }, { message: 'Invalid Phone Number' })
  .optional()
  .or(z.literal('')));

const profilePhoneRules = (data) => {
  if (!data.phone || !data.alternatePhone) return true;
  const p1 = String(data.phone).replace(/\D/g, '').slice(-10);
  const p2 = String(data.alternatePhone).replace(/\D/g, '').slice(-10);
  return p1 !== p2;
};

export const createUserSchema = z.object({
  body: z.object({
    email:     z.string().email('Invalid email address').trim().toLowerCase(),
    firstName: z.string().min(1, 'First name is required').trim(),
    lastName:  z.string().min(1, 'Last name is required').trim(),
    phone: phoneSchema,
    alternatePhone: phoneSchema,
    designation: optionalText('Designation', 100),
    branch: optionalText('Branch', 100),
    region: optionalText('Region', 100),
    role: z.nativeEnum(ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${Object.values(ROLES).join(', ')}` }),
    }),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  }).refine(profilePhoneRules, {
    message: 'Alternate phone must be different from phone',
    path: ['alternatePhone'],
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email:     z.string().email('Invalid email address').trim().toLowerCase().optional(),
    firstName: z.string().min(1, 'First name cannot be empty').trim().optional(),
    lastName:  z.string().min(1, 'Last name cannot be empty').trim().optional(),
    phone: phoneSchema,
    alternatePhone: phoneSchema,
    designation: optionalText('Designation', 100),
    branch: optionalText('Branch', 100),
    region: optionalText('Region', 100),
    role: z.nativeEnum(ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${Object.values(ROLES).join(', ')}` }),
    }).optional(),
  }).refine(profilePhoneRules, {
    message: 'Alternate phone must be different from phone',
    path: ['alternatePhone'],
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
    path:    ['body'],
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export const deleteUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export const assignRoleSchema = z.object({
  body: z.object({
    role: z.nativeEnum(ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${Object.values(ROLES).join(', ')}` }),
    }),
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export const searchUsersSchema = z.object({
  query: z.object({
    search:   z.string().trim().optional(),
    role:     z.nativeEnum(ROLES).optional(),
    status:   accountStatusFilterSchema.optional(),
    branch:   z.string().trim().max(100).optional(),
    region:   z.string().trim().max(100).optional(),
    designation: z.string().trim().max(100).optional(),
    page:     z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
    limit:    z.string().regex(/^\d+$/).transform(Number).optional().default('10'),
    sortField: z.enum(userSortFields).optional().default('created_at'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    newPassword: passwordSchema,
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export const resendCredentialsSchema = z.object({
  body: z.object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export const updateUserStatusSchema = z.object({
  body: z.object({
    status: accountStatusFilterSchema,
    remarks: z.string().trim().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

export default {
  createUserSchema,
  updateUserSchema,
  deleteUserSchema,
  assignRoleSchema,
  searchUsersSchema,
  resetPasswordSchema,
  resendCredentialsSchema,
  updateUserStatusSchema,
};
