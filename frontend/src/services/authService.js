import api, { refreshAccessToken } from "../api/axios";
import {
  PASSWORD_CHANGE_TOKEN_KEY,
  clearAuthSession,
  getAccessToken,
  hasAuthTokens,
  setStoredUser,
  setTokenStorage,
} from "./authSession";
const GENERIC_LOGIN_ERROR = "Login failed. Please check your email and password.";
const SERVICE_UNAVAILABLE_MESSAGE = "Service is temporarily unavailable. Please try again shortly.";
const NETWORK_ERROR_MESSAGE = "Unable to connect to the server. Check your internet connection.";
const INTERNAL_SERVER_ERROR_MESSAGE = "Internal Server Error. Please try again later.";
const INTERNAL_ERROR_PATTERNS = [
  /prisma/i,
  /users\./i,
  /deleted_by_id/i,
  /findFirst/i,
  /stack/i,
  /SQL/i,
  /P20\d{2}/i,
];

const getSafeAuthErrorMessage = (err) => {
  const responseMessage = err?.response?.data?.message;
  const responseCode = err?.response?.data?.code;
  const status = err?.response?.status;

  if (!err?.response) {
    if (err?.code === "ECONNABORTED") return SERVICE_UNAVAILABLE_MESSAGE;
    return NETWORK_ERROR_MESSAGE;
  }

  if (
    status === 503 ||
    responseCode === "DATABASE_UNAVAILABLE" ||
    responseCode === "SERVICE_TEMPORARILY_UNAVAILABLE"
  ) {
    return SERVICE_UNAVAILABLE_MESSAGE;
  }

  if (status === 401) return GENERIC_LOGIN_ERROR;
  if (status === 403) return "You do not have permission to access this page.";
  if (status === 404) return "Resource not found.";

  if (typeof responseMessage === "string" && responseMessage.trim()) {
    const safeMessage = responseMessage.trim();
    if (!INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(safeMessage))) {
      return safeMessage;
    }
  }

  if (status >= 500) return INTERNAL_SERVER_ERROR_MESSAGE;

  return "An unexpected error occurred. Please try again.";
};

export const login = async ({ email, password, rememberMe }) => {
  try {
    const res = await api.post("/v1/auth/login", { email, password });
    const { user, accessToken, requiresPasswordChange, passwordChangeToken } = res.data?.data || {};

    if (requiresPasswordChange && passwordChangeToken) {
      sessionStorage.setItem(PASSWORD_CHANGE_TOKEN_KEY, passwordChangeToken);
      return { success: true, requiresPasswordChange: true, user };
    }

    if (!accessToken || !user) {
      return { success: false, message: "Login failed" };
    }

    setTokenStorage(rememberMe, accessToken);
    setStoredUser(user);

    return { success: true, user };
  } catch (err) {
    return {
      success: false,
      message: getSafeAuthErrorMessage(err),
      code: err?.response?.data?.code,
    };
  }
};

export const completeTemporaryPasswordChange = async ({ newPassword, confirmPassword }) => {
  const passwordChangeToken = sessionStorage.getItem(PASSWORD_CHANGE_TOKEN_KEY);
  const res = await api.post("/v1/auth/complete-temporary-password", {
    passwordChangeToken,
    newPassword,
    confirmPassword,
  });
  const { user, accessToken } = res.data?.data || {};
  if (!accessToken || !user) {
    return { success: false, message: "Password changed, but login session could not be created." };
  }
  setTokenStorage(false, accessToken);
  setStoredUser(user);
  sessionStorage.removeItem(PASSWORD_CHANGE_TOKEN_KEY);
  return { success: true, user };
};

export const validateActivationToken = async (token) => {
  const res = await api.get("/v1/auth/validate-activation-token", { params: { token } });
  return res.data.data;
};

export const setActivationPassword = async ({ token, newPassword }) => {
  const res = await api.post("/v1/auth/set-password", { token, newPassword });
  return res.data;
};

export const resendActivation = async (email) => {
  const res = await api.post("/v1/auth/resend-activation", { email });
  return res.data;
};

export const forgotPassword = async ({ email }) => {
  try {
    const res = await api.post("/v1/auth/forgot-password", { email });
    return {
      success: true,
      message: res.data?.message || "If an account exists for this email address, password reset instructions have been sent.",
    };
  } catch (err) {
    return {
      success: false,
      message: getSafeAuthErrorMessage(err),
    };
  }
};

export const verifyOtp = async ({ email, otp }) => {
  try {
    const res = await api.post("/v1/auth/verify-otp", { email, otp });
    return {
      success: true,
      message: res.data?.message || "OTP verified successfully.",
    };
  } catch (err) {
    return {
      success: false,
      message: getSafeAuthErrorMessage(err),
    };
  }
};

export const resetPassword = async ({ email, otp, newPassword }) => {
  try {
    const res = await api.post("/v1/auth/reset-password", { email, otp, newPassword });
    return {
      success: true,
      message: res.data?.message || "Password reset successfully. You can now login with your new password.",
    };
  } catch (err) {
    return {
      success: false,
      message: getSafeAuthErrorMessage(err),
    };
  }
};


export const logout = async () => {
  try {
    await api.post("/v1/auth/logout");
  } catch {
    // ignore network/auth errors during logout
  } finally {
    clearAuthSession();
  }
};

export const getCurrentUser = async () => {
  const profileRequestOptions = {
    __skipAuthClear: true,
    __skipAuthRedirect: true,
    __skipAuthRefresh: true,
  };

  try {
    if (getAccessToken()) {
      console.log("[AUTH] Existing access token found");
    } else {
      console.log("[AUTH] No stored access token; attempting cookie-backed session restoration");
    }

    const res = await api.get("/v1/auth/profile", profileRequestOptions);
    const profile = res.data?.data;

    if (profile) {
      setStoredUser(profile);
      console.log("[AUTH] Session restoration successful");
    }
    return profile;
  } catch (err) {
    const status = err?.response?.status;
    const code = err?.response?.data?.code;

    if (status === 503 || code === "DATABASE_UNAVAILABLE" || !err?.response) {
      console.log("[AUTH] Authentication restoration deferred because service is unavailable");
      throw err;
    }

    if (status === 401) {
      try {
        console.log("[AUTH] Session restoration started");
        await refreshAccessToken();
        const retryRes = await api.get("/v1/auth/profile", profileRequestOptions);
        const profile = retryRes.data?.data;
        if (profile) {
          setStoredUser(profile);
          console.log("[AUTH] Session restoration successful");
        }
        return profile || null;
      } catch (refreshErr) {
        const refreshStatus = refreshErr?.response?.status;
        const refreshCode = refreshErr?.response?.data?.code;
        if (refreshStatus === 503 || refreshCode === "DATABASE_UNAVAILABLE" || !refreshErr?.response) {
          console.log("[AUTH] Authentication restoration deferred because refresh is unavailable");
          throw refreshErr;
        }
      }
    }

    console.log("[AUTH] Authentication restoration failed");
    return null;
  }
};

export const isAuthenticated = () => {
  return hasAuthTokens();
};

