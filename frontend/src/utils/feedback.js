import { toast } from "sonner";

export const getErrorMessage = (error, fallback = "Something went wrong. Please try again.") => {
  if (error?.isAuthRequired || error?.code === "AUTH_REQUIRED") {
    return "Your session has expired. Please sign in again.";
  }

  const data = error?.response?.data;
  const status = error?.response?.status;

  if (!error?.response) {
    if (error?.code === "ECONNABORTED") {
      return "Server is temporarily unavailable.";
    }
    return "Unable to connect to the server. Check your internet connection.";
  }

  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (status === 403) {
    return "You do not have permission to access this page.";
  }

  if (status === 404) {
    return "Resource not found.";
  }

  if (status >= 500) {
    return "Internal Server Error. Please try again later.";
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (Array.isArray(data?.errors)) {
    return data.errors.filter(Boolean).join(" ");
  }

  if (data?.errors && typeof data.errors === "object") {
    const messages = Object.values(data.errors).flat().filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

export const notify = {
  success: (message, options) => toast.success(message, options),
  error: (message, options) => toast.error(message, options),
  warning: (message, options) => toast.warning(message, options),
  info: (message, options) => toast.info(message, options),
};
