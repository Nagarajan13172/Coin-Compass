import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";
import { App } from "./App";
import { initNative, hideSplash } from "@/lib/native";
import "@/i18n";
import "./index.css";

// Configure the native shell (no-op on web) before first paint.
void initNative();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Dismiss the native splash once the app has mounted (no-op on web).
void hideSplash();
