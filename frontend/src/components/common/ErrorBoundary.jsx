import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ERROR_BOUNDARY] Caught error:", error, errorInfo);

    const errorMessage = String(error?.message || "").toLowerCase();
    const isChunkError =
      errorMessage.includes("failed to fetch dynamically imported module") ||
      errorMessage.includes("loading chunk") ||
      errorMessage.includes("chunkloaderror") ||
      errorMessage.includes("importing a module script failed");

    if (isChunkError) {
      const storageKey = "vms_chunk_reload_attempted";
      const hasReloaded = sessionStorage.getItem(storageKey);
      if (!hasReloaded) {
        sessionStorage.setItem(storageKey, "true");
        console.log("[ERROR_BOUNDARY] Dynamic chunk error detected after tab idle; reloading page...");
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    sessionStorage.removeItem("vms_chunk_reload_attempted");
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  handleReload = () => {
    sessionStorage.removeItem("vms_chunk_reload_attempted");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 ring-8 ring-amber-50/50 dark:ring-amber-950/20">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
                Session or View Desynchronized
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                The application view was updated or lost connection while the window was inactive. Please refresh to continue seamlessly.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0090B8] hover:bg-[#007799] px-4 py-3 text-xs font-bold text-white shadow-md transition cursor-pointer"
              >
                <RefreshCw size={15} />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <Home size={15} />
                <span>Go to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
