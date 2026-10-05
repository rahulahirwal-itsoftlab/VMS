import axios from "axios";
import {
  AUTH_EVENTS,
  broadcastAuthEvent,
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  updateStoredTokens,
} from "../services/authSession";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000/api"
    : "https://vms-5rht.onrender.com/api");

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required. Redirecting to login.") {
    super(message);
    this.name = "AuthRequiredError";
    this.code = "AUTH_REQUIRED";
    this.isAuthRequired = true;
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let refreshPromise = null;

const PUBLIC_AUTH_PATHS = [
  "/v1/auth/login",
  "/v1/auth/refresh-token",
  "/v1/auth/forgot-password",
  "/v1/auth/verify-otp",
  "/v1/auth/reset-password",
  "/v1/auth/validate-activation-token",
  "/v1/auth/set-password",
  "/v1/auth/activate-account",
  "/v1/auth/resend-activation",
  "/v1/auth/complete-temporary-password",
];

const isSkippedAuthPath = (url = "") =>
  PUBLIC_AUTH_PATHS.some((path) => url.includes(path)) ||
  url.includes("/health");

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/login") return;

  const isInvalid =
    path === "/404" ||
    path === "/403" ||
    path === "/login" ||
    path === "/" ||
    !path;

  if (isInvalid) {
    window.location.replace("/login");
  } else {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }
};

export const refreshAccessToken = async () => {
  if (refreshPromise) {
    console.log("[AUTH] Access token refresh already running; waiting");
    return refreshPromise;
  }

  refreshPromise = (async () => {
    console.log("[AUTH] Access token refresh started");

    const storedRefreshToken = getRefreshToken();
    const response = await axios.post(
      `${API_BASE_URL}/v1/auth/refresh-token`,
      { refreshToken: storedRefreshToken },
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      }
    );
    const { accessToken, refreshToken: newRefreshToken } = response.data?.data || {};
    if (!accessToken) {
      throw new Error("Refresh did not return an access token");
    }
    updateStoredTokens(accessToken, newRefreshToken);
    broadcastAuthEvent(AUTH_EVENTS.SESSION_UPDATED);
    console.log("[AUTH] Access token refresh successful");
    return accessToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const requestUrl = config.url || "";
  if (isSkippedAuthPath(requestUrl)) {
    return config;
  }

  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (
      status !== 401 ||
      originalRequest.__isRetryRequest ||
      originalRequest.__skipAuthRefresh ||
      isSkippedAuthPath(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    console.log("[AUTH] Access token expired");

    try {
      const token = await refreshAccessToken();
      originalRequest.__isRetryRequest = true;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${token}`;
      console.log("[AUTH] Original request retrying");
      return api(originalRequest);
    } catch (refreshError) {
      const refreshStatus = refreshError.response?.status;
      const refreshCode = refreshError.response?.data?.code;

      if (
        refreshStatus === 503 ||
        refreshCode === "DATABASE_UNAVAILABLE" ||
        !refreshError.response
      ) {
        console.log("[AUTH] Refresh failed due to network/server unavailability; preserving session");
        return Promise.reject(refreshError);
      }

      if (refreshStatus === 401 || refreshStatus === 403) {
        console.log("[AUTH] Refresh failed with 401/403: Session expired or invalid");
        if (!originalRequest.__skipAuthClear) {
          clearAuthSession();
        }
        if (!originalRequest.__skipAuthRedirect) {
          redirectToLogin();
        }
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;

