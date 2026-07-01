import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMoney, queryClient } from "@/lib/queryClient";
import type { ImportResult } from "@/lib/types";

/**
 * Upload a transactions file (.csv or .xlsx). The raw bytes are posted as-is; the
 * server detects the format, parses it, and creates any missing categories/accounts.
 */
export function useImportFile() {
  return useMutation({
    mutationFn: async (file: File) =>
      (
        await api.post<ImportResult>("/import", file, {
          headers: { "Content-Type": file.type || "application/octet-stream" },
        })
      ).data,
    onSuccess: () => {
      invalidateMoney();
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
