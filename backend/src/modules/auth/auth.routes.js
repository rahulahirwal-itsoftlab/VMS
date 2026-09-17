import express from 'express';
import authController from './auth.controller.js';
import { protect } from '../../middleware/auth.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import {
  activateAccountSchema,
  activationTokenSchema,
  changePasswordSchema,
  completeTemporaryPasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  resendActivationSchema,
  resetPasswordSchema,
  setPasswordSchema,
  verifyOtpSchema,
} from '../../zodSchema/auth.schema.js';
import authorize from '../../middleware/authorize.middleware.js';
import { PERMISSIONS } from './auth.permissions.js';


const router = express.Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Authenticate a user
 *     tags: [Auth]
 *     # ... (Swagger docs can be added here)
 */
router.post('/login', validate(loginSchema), authController.login);

// --- Password Recovery Routes ---
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
router.get('/validate-activation-token', validate(activationTokenSchema), authController.validateActivationToken);
router.post('/set-password', validate(setPasswordSchema), authController.setPassword);
router.post('/activate-account', validate(activateAccountSchema), authController.activateAccount);
router.post('/resend-activation', validate(resendActivationSchema), authController.resendActivation);
router.post('/complete-temporary-password', validate(completeTemporaryPasswordSchema), authController.completeTemporaryPasswordChange);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

// --- Protected Routes ---
router.post('/logout', protect, authorize(PERMISSIONS.AUTH.LOGOUT), authController.logout);
router.get('/profile', protect, authorize(PERMISSIONS.AUTH.GET_PROFILE), authController.getProfile);
router.put('/password', protect, authorize(PERMISSIONS.AUTH.CHANGE_PASSWORD), validate(changePasswordSchema), authController.changePassword);

export default router;
