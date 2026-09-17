import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/inter";
import "./index.css";

import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider } from "./context/SidebarContext";
import { AuthProvider } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";
import { NotificationProvider } from "./context/NotificationContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <NotificationProvider>
            <SidebarProvider>
              <App />
            </SidebarProvider>
          </NotificationProvider>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
