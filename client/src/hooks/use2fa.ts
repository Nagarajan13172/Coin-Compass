import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { TwoFactorMethod, TwoFactorPending, TwoFactorSetup, TwoFactorStatus } from "@/lib/types";

const STATUS_KEY = ["2fa", "status"];

/** The in-progress login challenge (from the pending cookie). Null when there is none. */
export function useTwoFactorPending() {
  return useQuery({
    queryKey: ["2fa", "pending"],
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<TwoFactorPending | null> => {
      try {
        return (await api.get<TwoFactorPending>("/auth/2fa/pending")).data;
      } catch {
        return null;
      }
    },
  });
}

/** Current 2FA configuration for the signed-in account. */
export function useTwoFactorStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => (await api.get<TwoFactorStatus>("/auth/2fa/status")).data,
  });
}

function invalidateStatus() {
  queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  queryClient.invalidateQueries({ queryKey: ["me"] });
}

/** Begin enrollment: returns the otpauth URL + QR to scan. */
export function useSetup2fa() {
  return useMutation({
    mutationFn: async () => (await api.post<TwoFactorSetup>("/auth/2fa/setup")).data,
  });
}

/** Confirm the first code and turn 2FA on. Returns the one-time backup codes. */
export function useEnable2fa() {
  return useMutation({
    mutationFn: async (code: string) =>
      (await api.post<{ backupCodes: string[] }>("/auth/2fa/enable", { code })).data.backupCodes,
    onSuccess: invalidateStatus,
  });
}

/** Turn 2FA off (password re-entry, or a live code for OAuth-only accounts). */
export function useDisable2fa() {
  return useMutation({
    mutationFn: async (body: { currentPassword?: string; code?: string }) =>
      (await api.post("/auth/2fa/disable", body)).data,
    onSuccess: invalidateStatus,
  });
}

/** Toggle the emailed-OTP fallback. */
export function useSetEmailFallback() {
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      (await api.post<TwoFactorStatus>("/auth/2fa/email-fallback", { enabled })).data,
    onSuccess: invalidateStatus,
  });
}

/** Regenerate backup codes (requires a live code). Returns the new codes once. */
export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: async (code: string) =>
      (await api.post<{ backupCodes: string[] }>("/auth/2fa/backup-codes", { code })).data.backupCodes,
    onSuccess: invalidateStatus,
  });
}

export type { TwoFactorMethod };
