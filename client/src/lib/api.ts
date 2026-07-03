import axios from "axios";

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
    const message =
      error?.response?.data?.error ??
      error?.response?.data?.message ??
      error?.message ??
      "Something went wrong";
    // Preserve the HTTP status and any rate-limit retry hint so callers (e.g. the
    // login form's countdown) can react to them, not just show the text.
    const wrapped = new Error(message) as Error & { status?: number; retryAfterSeconds?: number };
    wrapped.status = error?.response?.status;
    const retryAfter = error?.response?.data?.retryAfterSeconds;
    if (typeof retryAfter === "number") wrapped.retryAfterSeconds = retryAfter;
    return Promise.reject(wrapped);
  }
);
