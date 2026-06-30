import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error?.response?.data?.error ??
      error?.response?.data?.message ??
      error?.message ??
      "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
