import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().lowercase(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1).optional() }).optional().default({}),
});
export const forgotPasswordSchema = z.object({ body: z.object({ email: z.string().email() }) });
export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().lowercase(),
    otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
  }),
});
export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().lowercase(),
    otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
    newPassword: passwordSchema,
  }),
});
export const activationTokenSchema = z.object({
  query: z.object({
    token: z.string().min(32, 'Activation token is required'),
  }),
});
export const setPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(32, 'Activation token is required'),
    newPassword: passwordSchema,
  }),
});
export const activateAccountSchema = setPasswordSchema;
export const resendActivationSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').trim().lowercase(),
  }),
});
export const logoutSchema = z.object({ body: z.object({ refreshToken: z.string().optional() }) }); 
export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1),
    newPassword: passwordSchema,
  }),
});

export const completeTemporaryPasswordSchema = z.object({
  body: z.object({
    passwordChangeToken: z.string().min(20, 'Password change token is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});
