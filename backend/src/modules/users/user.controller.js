import userService from './user.service.js';
import { USER_MESSAGES } from './user.constants.js';
import asyncHandler from '../../middleware/asyncHandler.middleware.js';

/**
 * @class UserController
 * @description Manages HTTP requests for user-related operations like CRUD and status changes.
 */
class UserController {
  /**
   * @desc    Create a new user
   * @route   POST /api/v1/users
   * @access  Private (Admin)
   */
  createUser = asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body, req.user, req.ip, req.headers['user-agent']);
    res.status(201).json({
      success: true,
      message: USER_MESSAGES.USER_CREATED, 
      data: user,
    });
  });

  /**
   * @desc    Get all users with filtering and pagination
   * @route   GET /api/v1/users
   * @access  Private (Admin)
   */
  getUsers = asyncHandler(async (req, res) => {
    const result = await userService.searchUsers(req.query);
    res.status(200).json({ success: true, ...result });
  });

  /**
   * @desc    Get a single user by ID
   * @route   GET /api/v1/users/:id
   * @access  Private (Admin)
   */
  getUserById = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({ success: true, data: user });
  });

  /**
   * @desc    Update a user
   * @route   PUT /api/v1/users/:id
   * @access  Private (Admin)
   */
  updateUser = asyncHandler(async (req, res) => {
    const updatedUser = await userService.updateUser(req.params.id, req.body, req.user, req.ip, req.headers['user-agent']);
    res.status(200).json({
      success: true,
      message: USER_MESSAGES.USER_UPDATED,
      data: updatedUser,
    });
  });

  /**
   * @desc    Delete a user (soft delete)
   * @route   DELETE /api/v1/users/:id 
   * @access  Private (Admin)
   */
  deleteUser = asyncHandler(async (req, res) => {
    const result = await userService.deleteUser(req.params.id, req.user, req.ip, req.headers['user-agent']);
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.user,
    });
  });

  /**
   * @desc    Restore a soft-deleted user
   * @route   POST /api/v1/users/:id/restore
   * @access  Private (Admin)
   */
  restoreUser = asyncHandler(async (req, res) => {
    const restoredUser = await userService.restoreUser(req.params.id, req.user, req.ip, req.headers['user-agent']);
    res.status(200).json({ success: true, message: 'User account restored successfully.', data: restoredUser });
  });

  /**
   * @desc    Update user account status
   * @route   PATCH /api/v1/users/:id/status
   * @access  Private (Admin)
   */
  updateUserStatus = asyncHandler(async (req, res) => {
    const { status, remarks } = req.body;
    const updatedUser = await userService.updateUserStatus(
      req.params.id,
      status,
      req.user,
      remarks,
      req.ip,
      req.headers['user-agent']
    );
    res.status(200).json({ success: true, message: USER_MESSAGES.STATUS_UPDATED, data: updatedUser });
  });

  adminResetPassword = asyncHandler(async (req, res) => {
    const message = await userService.adminResetPassword(
      req.params.id,
      req.body.newPassword,
      req.user,
      req.ip,
      req.headers['user-agent']
    );
    res.status(200).json({ success: true, message });
  });

  resendCredentials = asyncHandler(async (req, res) => {
    const result = await userService.resendCredentials(
      req.params.id,
      req.body.password,
      req.user,
      req.ip,
      req.headers['user-agent']
    );
    res.status(200).json({ success: true, ...result });
  });

}

export default new UserController();
