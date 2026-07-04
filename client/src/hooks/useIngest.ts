import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient, invalidateMoney } from "@/lib/queryClient";
import type { IngestInbox, IngestCommitEdits } from "@/lib/types";

/** The auto-capture review inbox (pending payments + recent auto-committed).
 *  Polls so captures pushed by the webhook surface without a reload. */
export function useIngestInbox() {
  return useQuery({
    queryKey: ["ingest", "inbox"],
    queryFn: async () => (await api.get<IngestInbox>("/ingest/inbox")).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function invalidateInbox() {
  queryClient.invalidateQueries({ queryKey: ["ingest"] });
}

/** Confirm a pending capture (with optional edits) → creates the real transaction. */
export function useCommitCapture() {
  return useMutation({
    mutationFn: async ({ id, edits }: { id: string; edits: IngestCommitEdits }) =>
      (await api.post(`/ingest/${id}/commit`, edits)).data,
    onSuccess: () => {
      invalidateInbox();
      invalidateMoney();
    },
  });
}

/** Dismiss a pending capture without creating a transaction. */
export function useDismissCapture() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/ingest/${id}`)).data,
    onSuccess: invalidateInbox,
  });
}

/** Generate (or rotate) the ingest token and turn auto-capture on. Returns the
 *  raw token ONCE — surface it to the user immediately; it isn't retrievable later. */
export function useRegenerateIngestToken() {
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ token: string; hint: string; enabled: boolean }>("/settings/ingest-token")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}

/** Turn auto-capture off and revoke the token. */
export function useDisableIngestToken() {
  return useMutation({
    mutationFn: async () => (await api.delete("/settings/ingest-token")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}
