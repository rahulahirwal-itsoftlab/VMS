import authService from "./auth.service.js";
import { AUTH_MESSAGES } from "./auth.constants.js";
import asyncHandler from "../../middleware/asyncHandler.middleware.js";

const getCookieOptions = (maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
};

/**
 * @class AuthController
 * @description Handles HTTP requests for authentication, such as login, logout, and token refreshing.
 */
class AuthController {
  /**
   * @desc    Authenticate user & get token
   * @route   POST /api/v1/auth/login
   * @access  Public
   */
  login = asyncHandler(async (req, res) => {
    console.log("[AUTH] Login request received");
    const { email, password } = req.body;
    const result = await authService.login(
      email,
      password,
      {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    );
    if (result.requiresPasswordChange) {
      return res.status(200).json({
        success: true,
        message: 'Password change required before accessing VMS.',
        data: result,
      });
    }

    res.cookie('vms_access_token', result.accessToken, getCookieOptions(15 * 60 * 1000));

    if (result.refreshToken) {
      res.cookie('vms_refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    const safeData = {
      user: result.user,
      accessToken: result.accessToken,
    };

    console.log("[AUTH] Login successful");
    res.status(200).json({
      success: true,
      message: AUTH_MESSAGES.LOGIN_SUCCESS,
      data: safeData,
    });
  });

  /**
   * @desc    Log user out
   * @route   POST /api/v1/auth/logout
   * @access  Private
   */
  logout = asyncHandler(async (req, res) => {
    console.log("[AUTH] Explicit logout requested");
    const refreshToken = req.cookies?.vms_refresh_token || req.body?.refreshToken;
    const message = await authService.logout(req.user.id, refreshToken);
    const clearOpts = getCookieOptions(0);
    res.clearCookie('vms_access_token', clearOpts);
    res.clearCookie('vms_refresh_token', clearOpts);
    console.log("[AUTH] Logout completed");
    res.status(200).json({ success: true, message });
  });

  /**
   * @desc    Refresh access token
   * @route   POST /api/v1/auth/refresh-token
   * @access  Public
   */
  refreshToken = asyncHandler(async (req, res) => {
    console.log("[AUTH] Refresh request received");
    const oldRefreshToken = req.cookies?.vms_refresh_token || req.body?.refreshToken;
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };

    const { accessToken, refreshToken, user } =
      await authService.refreshToken(oldRefreshToken, meta);

    res.cookie('vms_access_token', accessToken, getCookieOptions(15 * 60 * 1000));

    if (refreshToken) {
      res.cookie('vms_refresh_token', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    res.status(200).json({
      success: true,
      message: AUTH_MESSAGES.REFRESH_SUCCESS,
      data: { accessToken, user },
    });
  });

  /**
   * @desc    Get current user profile
   * @route   GET /api/v1/auth/profile
   * @access  Private
   */
  getProfile = asyncHandler(async (req, res) => {
    // Assuming userId is available from an authentication middleware
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json({ success: true, data: profile });
  });

  /**
   * @desc    Change user password
   * @route   PUT /api/v1/auth/password
   * @access  Private
   */
  changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    // Assuming userId is available from an authentication middleware
    const message = await authService.changePassword(
      req.user.id,
      oldPassword,
      newPassword,
    );
    res.status(200).json({ success: true, message });
  });

  /**
   * @desc    Initiate password reset process
   * @route   POST /api/v1/auth/forgot-password
   * @access  Public
   */
  /**
   * @desc    Initiate password reset process
   * @route   POST /api/v1/auth/forgot-password
   * @access  Public
   */
  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    console.log(`\n[HTTP ROUTE] 👉 POST /api/v1/auth/forgot-password - Incoming request for email: ${email || 'none'}`);

    const message = await authService.forgotPassword(email);

    console.log(`[HTTP ROUTE] ✅ POST /api/v1/auth/forgot-password - Responding 200 OK`);
    return res.status(200).json({
      success: true,
      message: message || "OTP sent successfully",
    });
  });

  /**
   * @desc    Verify password reset OTP
   * @route   POST /api/v1/auth/verify-otp
   * @access  Public
   */
  verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    console.log(`\n[HTTP ROUTE] 👉 POST /api/v1/auth/verify-otp - Incoming request for email: ${email || 'none'}`);

    const message = await authService.verifyOtp(email, otp);

    console.log(`[HTTP ROUTE] ✅ POST /api/v1/auth/verify-otp - Responding 200 OK`);
    res.status(200).json({ success: true, message });
  });

  /**
   * @desc    Reset password using OTP
   * @route   POST /api/v1/auth/reset-password
   * @access  Public
   */
  resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    console.log(`\n[HTTP ROUTE] 👉 POST /api/v1/auth/reset-password - Incoming request for email: ${email || 'none'}`);

    const message = await authService.resetPassword(
      email,
      otp,
      newPassword,
    );

    console.log(`[HTTP ROUTE] ✅ POST /api/v1/auth/reset-password - Responding 200 OK`);
    res.status(200).json({ success: true, message });
  });

  completeTemporaryPasswordChange = asyncHandler(async (req, res) => {
    const { passwordChangeToken, newPassword } = req.body;
    const result = await authService.completeTemporaryPasswordChange(passwordChangeToken, newPassword);
    res.cookie('vms_access_token', result.accessToken, getCookieOptions(15 * 60 * 1000));

    if (result.refreshToken) {
      res.cookie('vms_refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  validateActivationToken = asyncHandler(async (req, res) => {
    const data = await authService.validateActivationToken(req.query.token);
    res.status(200).json({ success: true, data });
  });

  setPassword = asyncHandler(async (req, res) => {
    const user = await authService.setPassword(req.body.token, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password set successfully. You can now log in.', data: user });
  });

  activateAccount = asyncHandler(async (req, res) => {
    const user = await authService.activateAccount(req.body.token, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Account activated successfully.', data: user });
  });

  resendActivation = asyncHandler(async (req, res) => {
    const message = await authService.resendActivation(
      req.body.email,
      req.user || null,
      req.ip,
      req.headers['user-agent'],
    );
    res.status(200).json({ success: true, message });
  });

}

export default new AuthController();
