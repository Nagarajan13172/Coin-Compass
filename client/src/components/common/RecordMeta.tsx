import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  createdAt?: string | null;
  updatedAt?: string | null;
  className?: string;
}

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "d MMM yyyy, h:mm a");
}

/**
 * A subtle "Added … · Updated …" line for detail/edit views. The "Updated" stamp
 * only appears when it meaningfully differs from "Added" (more than a minute
 * apart), so freshly-created records don't show a redundant duplicate.
 */
export function RecordMeta({ createdAt, updatedAt, className }: Props) {
  const created = fmt(createdAt);
  const updated = fmt(updatedAt);
  if (!created && !updated) return null;

  const edited =
    !!createdAt &&
    !!updatedAt &&
    Math.abs(new Date(updatedAt).getTime() - new Date(createdAt).getTime()) > 60_000;

  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground", className)}>
      {created && <span>Added {created}</span>}
      {edited && <span aria-hidden>·</span>}
      {edited && <span>Updated {updated}</span>}
    </p>
  );
}
