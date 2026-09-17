import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AUTH_STATUS, useAuth } from "../../context/AuthContext";
import { canAccessPath } from "../../config/permissions";

import LoadingSpinner from "../common/LoadingSpinner";

const ProtectedRoute = ({ children }) => {
  const {
    user,
    status,
    isAuthenticated,
    bootstrapping,
  } = useAuth();

  const location = useLocation();

  if (status === AUTH_STATUS.INITIALIZING || bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" text="Checking session..." />
      </div>
    );
  }

  if (status === AUTH_STATUS.UNAUTHENTICATED || !isAuthenticated || !user) {
    const rawPath = `${location.pathname}${location.search}${location.hash}`;
    const isInvalid =
      location.pathname === "/404" ||
      location.pathname === "/403" ||
      location.pathname === "/login" ||
      location.pathname === "/";
    const redirectQuery = isInvalid ? "" : `?redirect=${encodeURIComponent(rawPath)}`;
    return (
      <Navigate
        to={`/login${redirectQuery}`}
        state={isInvalid ? undefined : { from: { pathname: rawPath } }}
        replace
      />
    );
  }

  if (!canAccessPath(user, location.pathname)) {
    return <Navigate to="/403" replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
