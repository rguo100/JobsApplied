import React from "react";
import ReactDOM from "react-dom/client";
import { WebAuthProvider } from "../context/WebAuthContext";
import { DashboardApp } from "../dashboard/DashboardApp";
import "../index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <WebAuthProvider>
        <DashboardApp />
      </WebAuthProvider>
    </React.StrictMode>
  );
}
