import { createContext, useContext, useEffect, useState } from "react";
import {
  login as loginService,
  logout as logoutService,
  getCurrentUser,
  completeTemporaryPasswordChange,
} from "../services/authService";
import {
  AUTH_EVENTS,
  AUTH_SESSION_CLEARED_EVENT,
  broadcastAuthEvent,
  clearAuthSession,
  getAccessToken,
  getStoredUser,
  isTokenExpiringSoon,
  subscribeToAuthEvents,
} from "../services/authSession";
import { refreshAccessToken } from "../api/axios";

export const AUTH_STATUS = {
  INITIALIZING: "INITIALIZING",
  AUTHENTICATED: "AUTHENTICATED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(AUTH_STATUS.INITIALIZING);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        console.log("[AUTH] App authentication initialization started");
        setStatus(AUTH_STATUS.INITIALIZING);
        const cachedUser = getStoredUser();
        const hasAccessToken = Boolean(getAccessToken());
        console.log("[AUTH] Existing authentication state detected", {
          hasCachedUser: Boolean(cachedUser),
          hasAccessToken,
        });
        console.log("[AUTH] Session restoration started");
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setStatus(AUTH_STATUS.AUTHENTICATED);
        } else {
          clearAuthSession({ notify: false });
          setUser(null);
          setStatus(AUTH_STATUS.UNAUTHENTICATED);
        }
      } catch {
        const cachedUser = getStoredUser();
        if (cachedUser && getAccessToken()) {
          console.log("[AUTH] Session restoration deferred; keeping cached authenticated state");
          setUser(cachedUser);
          setStatus(AUTH_STATUS.AUTHENTICATED);
          return;
        }
        console.log("[AUTH] Authentication restoration failed");
        clearAuthSession({ notify: false });
        setUser(null);
        setStatus(AUTH_STATUS.UNAUTHENTICATED);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const handleSessionCleared = () => {
      setUser(null);
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    return () => window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthEvents(async (event) => {
      if (
        event?.type === AUTH_EVENTS.LOGIN ||
        event?.type === AUTH_EVENTS.SESSION_UPDATED
      ) {
        try {
          const refreshedUser = await getCurrentUser();
          if (refreshedUser) {
            setUser(refreshedUser);
            setStatus(AUTH_STATUS.AUTHENTICATED);
          }
        } catch {
          // Another tab may refresh while the backend is temporarily unavailable.
        }
      } else if (event?.type === AUTH_EVENTS.LOGOUT) {
        setUser(null);
        setStatus(AUTH_STATUS.UNAUTHENTICATED);
      }
    });

    return () => unsubscribe();
  }, []);

  // Proactive background silent refresh loop (runs every 45s while authenticated)
  useEffect(() => {
    if (status !== AUTH_STATUS.AUTHENTICATED) return;

    const checkAndRefresh = async () => {
      const token = getAccessToken();
      if (token && isTokenExpiringSoon(token, 300)) {
        console.log("[AUTH] Access token expiring within threshold; performing proactive silent refresh");
        try {
          await refreshAccessToken();
        } catch (err) {
          console.log("[AUTH] Proactive silent refresh deferred:", err?.message || err);
        }
      }
    };

    const interval = setInterval(checkAndRefresh, 45000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && status === AUTH_STATUS.AUTHENTICATED) {
        const token = getAccessToken();
        if (!token || isTokenExpiringSoon(token, 300)) {
          console.log("[AUTH] Tab became active and token is expiring/expired; performing proactive refresh");
          try {
            await refreshAccessToken();
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
              setStatus(AUTH_STATUS.AUTHENTICATED);
            }
          } catch {
            // Preserve state if network reconnecting
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [status]);

  const login = async (credentials) => {
    const result = await loginService(credentials);
    if (result.success && !result.requiresPasswordChange) {
      setUser(result.user);
      setStatus(AUTH_STATUS.AUTHENTICATED);
      broadcastAuthEvent(AUTH_EVENTS.LOGIN, result.user);
    }
    return result;
  };

  const completeLogin = (nextUser) => {
    setUser(nextUser);
    setStatus(AUTH_STATUS.AUTHENTICATED);
    broadcastAuthEvent(AUTH_EVENTS.LOGIN, nextUser);
  };

  const completeRequiredPasswordChange = async (payload) => {
    const result = await completeTemporaryPasswordChange(payload);
    if (result.success) {
      setUser(result.user);
      setStatus(AUTH_STATUS.AUTHENTICATED);
      broadcastAuthEvent(AUTH_EVENTS.LOGIN, result.user);
    }
    return result;
  };

  const logout = async () => {
    console.log("[AUTH] Logging out");
    try {
      await logoutService();
    } catch {
      // Ignore network / backend errors during logout so local state is cleared cleanly
    } finally {
      setUser(null);
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
      clearAuthSession();
      broadcastAuthEvent(AUTH_EVENTS.LOGOUT);
    }
  };

  const clearSession = () => {
    clearAuthSession();
    setUser(null);
    setStatus(AUTH_STATUS.UNAUTHENTICATED);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        login,
        completeLogin,
        completeRequiredPasswordChange,
        logout,
        clearSession,
        isAuthenticated: status === AUTH_STATUS.AUTHENTICATED && Boolean(user),
        bootstrapping: status === AUTH_STATUS.INITIALIZING,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
