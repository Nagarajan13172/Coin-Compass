import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, addMonths, addYears, format, startOfDay, startOfMonth, startOfYear, subDays } from "date-fns";
import { ChevronDown, Plus, Receipt, Search, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransactionList } from "@/features/transactions/TransactionList";
import { useTransactions, type TxnFilters } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useUIStore } from "@/stores/ui";
import type { TxnType } from "@/lib/types";

const ALL = "__all__";

type PeriodKey = "all" | "month" | "30d" | "year" | "custom";
const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
];
const PERIOD_KEYS = PERIODS.map((p) => p.value);

function initialPeriod(raw: string | null): PeriodKey {
  return raw && (PERIOD_KEYS as string[]).includes(raw) ? (raw as PeriodKey) : "all";
}

/** Human label for an explicit from/to range (single day, else a span). */
function rangeLabel(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const oneDay = to.getTime() - from.getTime() <= 25 * 3600 * 1000; // ~a single day (DST-safe)
  if (oneDay) return format(from, "dd MMM yyyy");
  return `${format(from, "dd MMM")} – ${format(new Date(to.getTime() - 1), "dd MMM yyyy")}`;
}
const TYPE_LABELS: Record<string, string> = { expense: "Expense", income: "Income", transfer: "Transfer" };

/** Resolve a period key to an inclusive-from / exclusive-to date range (server uses $gte / $lt). */
function periodRange(p: PeriodKey): { from?: string; to?: string } {
  if (p === "all") return {};
  const now = new Date();
  if (p === "month") return { from: startOfMonth(now).toISOString(), to: startOfMonth(addMonths(now, 1)).toISOString() };
  if (p === "year") return { from: startOfYear(now).toISOString(), to: startOfYear(addYears(now, 1)).toISOString() };
  // last 30 days, including today
  return { from: startOfDay(subDays(now, 29)).toISOString(), to: startOfDay(addDays(now, 1)).toISOString() };
}

export default function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  // Initial filters can be deep-linked (e.g. dashboard "Spending by category" → a
  // category's transactions, or the global search box → ?search=).
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [type, setType] = useState<string>(params.get("type") ?? ALL);
  const [accountIds, setAccountIds] = useState<string[]>(params.get("account") ? [params.get("account")!] : []);
  const [category, setCategory] = useState<string>(params.get("category") ?? ALL);
  // An explicit ?from=&to= range (e.g. deep-link from the Calendar) becomes a "Custom" period.
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(() => {
    const from = params.get("from");
    const to = params.get("to");
    return from && to ? { from, to } : null;
  });
  const [period, setPeriod] = useState<PeriodKey>(
    customRange ? "custom" : initialPeriod(params.get("period"))
  );

  function changePeriod(v: PeriodKey) {
    setPeriod(v);
    if (v !== "custom") setCustomRange(null);
  }

  // debounce the search input
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const incoming = params.get("search");
    if (incoming != null && incoming !== search) setSearch(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();

  const range = useMemo(
    () => (period === "custom" && customRange ? customRange : periodRange(period)),
    [period, customRange]
  );
  const filters: TxnFilters = useMemo(
    () => ({
      search: debounced || undefined,
      type: type === ALL ? undefined : type,
      account: accountIds.length ? accountIds.join(",") : undefined,
      category: category === ALL ? undefined : category,
      from: range.from,
      to: range.to,
    }),
    [debounced, type, accountIds, category, range]
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactions(filters);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // infinite scroll sentinel
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const accountName = (id: string) => accounts?.find((a) => a._id === id)?.name ?? "Account";
  const categoryName =
    category !== ALL ? categories?.find((c) => c._id === category)?.name ?? "Category" : "";

  const hasFilters =
    type !== ALL || accountIds.length > 0 || category !== ALL || !!debounced || period !== "all";

  function toggleAccount(id: string) {
    setAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function clearFilters() {
    setType(ALL);
    setAccountIds([]);
    setCategory(ALL);
    setSearch("");
    setCustomRange(null);
    setPeriod("all");
    setParams({});
  }

  // Context-aware Add: prefill the sheet from whatever is currently filtered.
  function addTransaction() {
    openTxnSheet({
      type: type !== ALL ? (type as TxnType) : undefined,
      prefill: {
        account: accountIds.length === 1 ? accountIds[0] : undefined,
        category: category !== ALL ? category : undefined,
      },
    });
  }

  // Removable pills for the active fine-grained filters (period lives in its own select + summary).
  const pills: { key: string; label: string; onRemove: () => void }[] = [];
  if (type !== ALL) pills.push({ key: "type", label: TYPE_LABELS[type] ?? type, onRemove: () => setType(ALL) });
  accountIds.forEach((id) =>
    pills.push({ key: `acc-${id}`, label: accountName(id), onRemove: () => toggleAccount(id) })
  );
  if (category !== ALL) pills.push({ key: "cat", label: categoryName, onRemove: () => setCategory(ALL) });
  if (debounced) pills.push({ key: "search", label: `“${debounced}”`, onRemove: () => setSearch("") });

  const periodLabel =
    period === "custom" && customRange
      ? rangeLabel(customRange.from, customRange.to)
      : PERIODS.find((p) => p.value === period)?.label ?? "All time";
  const summary = total
    ? `${total} transaction${total === 1 ? "" : "s"}${period !== "all" ? ` · ${periodLabel}` : ""}`
    : hasFilters
      ? "No transactions match these filters"
      : "All your transactions";

  const accountTriggerLabel =
    accountIds.length === 0
      ? "All accounts"
      : accountIds.length === 1
        ? accountName(accountIds[0])
        : `${accountIds.length} accounts`;

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={summary}
        actions={
          <Button onClick={addTransaction}>
            <Plus /> Add
          </Button>
        }
      />

      {/* filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter this list by note, payee, or tag"
            placeholder="Filter this list by note, payee, or tag…"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        {/* multi-select accounts */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[150px] justify-between font-normal">
              <span className="truncate">{accountTriggerLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Filter by account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accounts?.map((a) => (
              <DropdownMenuCheckboxItem
                key={a._id}
                checked={accountIds.includes(a._id)}
                onCheckedChange={() => toggleAccount(a._id)}
                onSelect={(e) => e.preventDefault()}
              >
                {a.name}
              </DropdownMenuCheckboxItem>
            ))}
            {accountIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAccountIds([])}>Clear accounts</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={(v) => changePeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
            {period === "custom" && customRange && (
              <SelectItem value="custom">{rangeLabel(customRange.from, customRange.to)}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* active filter pills */}
      {pills.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">Filters:</span>
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={p.onRemove}
              aria-label={`Remove filter ${p.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
            >
              {p.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
            Reset all
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : items.length ? (
        <>
          <TransactionList transactions={items} />
          <div ref={sentinel} className="h-10" />
          {isFetchingNextPage && (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading more…</p>
          )}
        </>
      ) : (
        <EmptyState
          icon={Receipt}
          title={hasFilters ? "No matching transactions" : "No transactions yet"}
          description={
            hasFilters
              ? "Try adjusting or clearing your filters."
              : "Add your first transaction to get started."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={addTransaction}>
                <Plus /> Add transaction
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
