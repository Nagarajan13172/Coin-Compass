import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { AuthUser, OAuthProviders } from "@/lib/types";

/** Current user, or null when not authenticated (a 401 resolves to null, not an error). */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return (await api.get<{ user: AuthUser }>("/auth/me")).data.user;
      } catch {
        return null;
      }
    },
  });
}

/** Which OAuth provider buttons to show (only those the server has credentials for). */
export function useOAuthProviders() {
  return useQuery({
    queryKey: ["auth", "providers"],
    staleTime: Infinity,
    queryFn: async () => (await api.get<OAuthProviders>("/auth/providers")).data,
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: async (body: { email: string; password: string; name?: string }) =>
      (await api.post<{ user: AuthUser }>("/auth/signup", body)).data.user,
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], user);
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) =>
      (await api.post<{ user: AuthUser }>("/auth/signin", body)).data.user,
    onSuccess: (user) => {
      queryClient.clear(); // never carry a previous user's cached data across a login
      queryClient.setQueryData(["me"], user);
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => (await api.post("/auth/logout")).data,
    onSuccess: () => queryClient.clear(),
  });
}

/** Confirm an email from the link's token; on success the server also signs us in. */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (token: string) =>
      (await api.post<{ user: AuthUser }>("/auth/verify-email", { token })).data.user,
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], user);
    },
  });
}

/** Ask the server to re-send the verification email to the signed-in user. */
export function useResendVerification() {
  return useMutation({
    mutationFn: async () => (await api.post("/auth/resend-verification")).data,
  });
}
