import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthGate";
import "./styles.css";
import "./mobile.css";
import { installMobileViewport } from "./lib/mobileViewport.js";
import { registerPwa } from "./lib/registerPwa";
const stopMobileViewport = installMobileViewport();
if (import.meta.hot) import.meta.hot.dispose(stopMobileViewport);
registerPwa();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
