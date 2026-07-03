import axios from "axios";
import i18n from "@/i18n";

export const api = axios.create({
  // Same-origin "/api" by default (routed through the Vite dev proxy / same host in
  // prod). Override with VITE_API_BASE_URL to point at a separately-hosted API.
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send/receive the session cookie
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Session expired mid-session → bounce to login. The /auth/* probes (e.g. useMe)
    // handle their own 401s, and we never redirect away from the auth pages themselves.
    const url: string = error?.config?.url ?? "";
    const path = window.location.pathname;
    if (
      error?.response?.status === 401 &&
      !url.startsWith("/auth/") &&
      path !== "/login" &&
      path !== "/signup" &&
      path !== "/forgot-password" &&
      path !== "/reset-password"
    ) {
      window.location.assign("/login");
    }
    // The server sends a stable `code` (+ optional params) plus an English `error`.
    // Prefer a translated message for the code; fall back to the server's English
    // text for any code we haven't translated yet, so nothing shows blank.
    const serverMessage =
      error?.response?.data?.error ??
      error?.response?.data?.message ??
      error?.message ??
      i18n.t("errors:UNKNOWN", { defaultValue: "Something went wrong" });
    const code: string | undefined = error?.response?.data?.code;
    const params = error?.response?.data?.params ?? {};
    const message = code
      ? i18n.t(`errors:${code}`, { defaultValue: serverMessage, ...params })
      : serverMessage;
    // Preserve the HTTP status, the error code, and any rate-limit retry hint so
    // callers (e.g. the login form's countdown) can react to them, not just show text.
    const wrapped = new Error(message) as Error & {
      status?: number;
      code?: string;
      retryAfterSeconds?: number;
    };
    wrapped.status = error?.response?.status;
    wrapped.code = code;
    const retryAfter = error?.response?.data?.retryAfterSeconds;
    if (typeof retryAfter === "number") wrapped.retryAfterSeconds = retryAfter;
    return Promise.reject(wrapped);
  }
);
