import express from 'express';
import userController from './user.controller.js';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import {
  ROLES,
  createUserSchema,
  updateUserSchema,
  deleteUserSchema,
  searchUsersSchema,
  updateUserStatusSchema,
  adminResetPasswordSchema,
  resendCredentialsSchema,
} from '../../zodSchema/index.js';
import { PERMISSIONS } from '../auth/auth.permissions.js';

const router = express.Router();

const noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache'); 
  res.setHeader('Expires', '0');
  next();
};

/**
 * All routes below are protected and require admin privileges
 */
router.use(protect, authorize(PERMISSIONS.USER.MANAGE), noCache);

router.route('/').post(validate(createUserSchema), userController.createUser).get(validate(searchUsersSchema), userController.getUsers);

router
  .route('/:id')
  .get(userController.getUserById)
  .put(validate(updateUserSchema), userController.updateUser)
  .delete(authorize(PERMISSIONS.USER.DELETE), validate(deleteUserSchema), userController.deleteUser);

router.patch('/:id/status', authorize(PERMISSIONS.USER.DEACTIVATE), validate(updateUserStatusSchema), userController.updateUserStatus);
router.post('/:id/reset-password', validate(adminResetPasswordSchema), userController.adminResetPassword);
router.post('/:id/resend-credentials', authorize(PERMISSIONS.USER.MANAGE), validate(resendCredentialsSchema), userController.resendCredentials);
router.post('/:id/restore', authorize(PERMISSIONS.USER.RESTORE), validate(deleteUserSchema), userController.restoreUser);

export default router;
