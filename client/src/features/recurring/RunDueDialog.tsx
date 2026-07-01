import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useRunRecurringOne } from "@/hooks/useRecurring";
import { dueDates, ruleTitle } from "@/lib/recurring";
import type { Recurring } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rules: Recurring[] | undefined;
}

/**
 * Preview-and-confirm dialog for "Run due". Lists every rule with occurrences due
 * right now, lets the user pick which to post, and shows the net cash impact before
 * anything is written — so a burst of transactions is never posted by accident.
 */
export function RunDueDialog({ open, onOpenChange, rules }: Props) {
  const navigate = useNavigate();
  const runOne = useRunRecurringOne();
  const [running, setRunning] = useState(false);

  // Freeze "now" while the dialog is open so the preview and the eventual post agree.
  const now = useMemo(() => new Date(), [open]);

  const due = useMemo(
    () =>
      (rules ?? [])
        .map((rule) => {
          const dates = dueDates(rule, now);
          return { rule, dates, total: rule.amount * dates.length };
        })
        .filter((d) => d.dates.length > 0),
    [rules, now]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelected(new Set(due.map((d) => d.rule._id)));
  }, [open, due]);

  const chosen = due.filter((d) => selected.has(d.rule._id));
  const count = chosen.reduce((s, d) => s + d.dates.length, 0);
  const income = chosen
    .filter((d) => d.rule.type === "income")
    .reduce((s, d) => s + d.total, 0);
  const expense = chosen
    .filter((d) => d.rule.type === "expense")
    .reduce((s, d) => s + d.total, 0);
  const net = income - expense;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (chosen.length === 0) return;
    setRunning(true);
    try {
      let created = 0;
      // Each per-rule run catches up all of that rule's due occurrences server-side.
      for (const d of chosen) {
        const res = await runOne.mutateAsync(d.rule._id);
        created += res.created;
      }
      onOpenChange(false);
      if (created > 0) {
        toast.success(`Posted ${created} recurring transaction${created === 1 ? "" : "s"}`, {
          action: { label: "View", onClick: () => navigate("/transactions") },
        });
      } else {
        toast.success("Nothing was due");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run due recurring</DialogTitle>
          <DialogDescription>
            {due.length > 0
              ? "Choose which rules to post now. Each posts every occurrence due up to today."
              : "You're all caught up — nothing is due right now."}
          </DialogDescription>
        </DialogHeader>

        {due.length > 0 && (
          <>
            <ScrollArea className="-mx-1 max-h-[46dvh] px-1">
              <div className="space-y-2">
                {due.map(({ rule, dates, total }) => {
                  const on = selected.has(rule._id);
                  return (
                    <button
                      key={rule._id}
                      type="button"
                      onClick={() => toggle(rule._id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        on ? "border-primary/50 bg-primary/5" : "hover:bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <CategoryIcon
                        icon={rule.type === "transfer" ? "repeat" : rule.category?.icon}
                        color={rule.type === "transfer" ? "#3B82F6" : rule.category?.color}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{ruleTitle(rule)}</p>
                          {dates.length > 1 && (
                            <span className="shrink-0 rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                              ×{dates.length}
                            </span>
                          )}
                        </div>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {rule.account?.name}
                          {rule.type === "transfer" && rule.toAccount && (
                            <>
                              <ArrowRight className="h-3 w-3" /> {rule.toAccount.name}
                            </>
                          )}
                          <span aria-hidden>·</span>
                          {format(dates[0], "dd MMM")}
                          {dates.length > 1 && ` – ${format(dates[dates.length - 1], "dd MMM")}`}
                        </p>
                      </div>
                      <Money amount={total} type={rule.type} signed className="shrink-0 text-sm" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Posting {count} transaction{count === 1 ? "" : "s"}
                </span>
                <span
                  className={cn(
                    "font-semibold tnum",
                    net > 0 ? "text-income" : net < 0 ? "text-expense" : "text-muted-foreground"
                  )}
                >
                  Net {formatMoney(net, { signed: true })}
                </span>
              </div>
              {(income > 0 || expense > 0) && (
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  {expense > 0 && <span>Expenses −{formatMoney(expense)}</span>}
                  {income > 0 && <span>Income +{formatMoney(income)}</span>}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {due.length > 0 ? "Cancel" : "Close"}
          </Button>
          {due.length > 0 && (
            <Button onClick={run} disabled={running || chosen.length === 0}>
              {running
                ? "Posting…"
                : `Post ${count} transaction${count === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
