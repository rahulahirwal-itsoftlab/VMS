import AppRoutes from "./routes/AppRoutes";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { Toaster } from "sonner";

function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
      <Toaster richColors closeButton position="top-right" />
    </ErrorBoundary>
  );
}

export default App;
