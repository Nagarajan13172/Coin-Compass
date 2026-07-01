import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
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
      path !== "/signup"
    ) {
      window.location.assign("/login");
    }
    const message =
      error?.response?.data?.error ??
      error?.response?.data?.message ??
      error?.message ??
      "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
