export const ACCESS_TOKEN_KEY = "vms_access_token";
export const REFRESH_TOKEN_KEY = "vms_refresh_token";
export const USER_KEY = "vms_user";
export const PASSWORD_CHANGE_TOKEN_KEY = "vms_password_change_token";
export const AUTH_SESSION_CLEARED_EVENT = "vms:auth-session-cleared";

export const AUTH_EVENTS = {
  LOGIN: "AUTH_LOGIN",
  LOGOUT: "AUTH_LOGOUT",
  SESSION_UPDATED: "AUTH_SESSION_UPDATED",
};

const AUTH_CHANNEL_NAME = "vms_auth_channel";

let authChannel = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  } catch {
    authChannel = null;
  }
}

export const broadcastAuthEvent = (eventType, data = null) => {
  if (authChannel) {
    try {
      authChannel.postMessage({ type: eventType, data, timestamp: Date.now() });
    } catch {
      // Fallback
    }
  }
  try {
    localStorage.setItem("vms_auth_event", JSON.stringify({ type: eventType, timestamp: Date.now() }));
    localStorage.removeItem("vms_auth_event");
  } catch {
    // ignore
  }
};

export const subscribeToAuthEvents = (callback) => {
  if (typeof window === "undefined") return () => {};

  const handleBroadcast = (event) => {
    if (event?.data?.type) {
      callback(event.data);
    }
  };

  const handleStorage = (event) => {
    if (event.key === "vms_auth_event" && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        if (data?.type) {
          callback(data);
        }
      } catch {
        // ignore
      }
    }
  };

  if (authChannel) {
    authChannel.addEventListener("message", handleBroadcast);
  }
  window.addEventListener("storage", handleStorage);

  return () => {
    if (authChannel) {
      authChannel.removeEventListener("message", handleBroadcast);
    }
    window.removeEventListener("storage", handleStorage);
  };
};

const getStorageWithAccessToken = () =>
  localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage;

const normalizeToken = (token) => (typeof token === "string" && token.trim() ? token.trim() : null);

export const getAccessToken = () => {
  try {
    return normalizeToken(localStorage.getItem(ACCESS_TOKEN_KEY)) || normalizeToken(sessionStorage.getItem(ACCESS_TOKEN_KEY));
  } catch {
    return null;
  }
};

export const getStoredUser = () => {
  try {
    const cached = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user) => {
  const storage = getStorageWithAccessToken();
  storage.setItem(USER_KEY, JSON.stringify(user));
};

export const setTokenStorage = (rememberMe, accessToken) => {
  const storage = rememberMe ? localStorage : sessionStorage;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);

  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
};

export const updateStoredTokens = (accessToken) => {
  const storage = getStorageWithAccessToken();
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
};

export const clearAuthSession = ({ notify = true } = {}) => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(PASSWORD_CHANGE_TOKEN_KEY);
    sessionStorage.removeItem("vms_profile");
    localStorage.removeItem("vms_profile");
    if (notify) {
      window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
      broadcastAuthEvent(AUTH_EVENTS.LOGOUT);
    }
  } catch {
    // Browser storage can be unavailable in restricted modes. Treat as cleared.
  }
};

export const hasAuthTokens = () => Boolean(getAccessToken());

