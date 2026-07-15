import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, Receipt, Search, Trash2, X } from "lucide-react";
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
import { RecentlyDeletedDialog } from "@/features/transactions/RecentlyDeletedDialog";
import { AccountBalancesStrip } from "@/features/transactions/AccountBalancesStrip";
import { MonthSummaryRail } from "@/features/transactions/MonthSummaryRail";
import {
  PeriodNavigator,
  selectionRange,
  selectionLabel,
  thisMonth,
  type PeriodSelection,
} from "@/features/transactions/PeriodNavigator";
import { QuickAddTemplates } from "@/features/templates/QuickAddTemplates";
import {
  useTransactions,
  useTags,
  useDeletedTransactions,
  useLedgerBalance,
  type TxnFilters,
} from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/i18nLabels";
import type { TxnType } from "@/lib/types";

const ALL = "__all__";

/**
 * Resolve the initial period from the URL. A specific month is the everyday
 * default, but a deep link can pin an exact month (`?month=2026-07`), year
 * (`?year=2026`), rolling range (`?period=30d|all`), or explicit span
 * (`?from&to`). A link that only narrows by a filter (e.g. the dashboard's
 * "spending by category" → `?category=…`) keeps showing all history for that
 * filter rather than silently scoping it to this month.
 */
function parseSelection(params: URLSearchParams): PeriodSelection {
  const month = params.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return { kind: "month", anchor: new Date(y, m - 1, 1).toISOString() };
  }
  const year = params.get("year");
  if (year && /^\d{4}$/.test(year)) {
    return { kind: "year", anchor: new Date(Number(year), 0, 1).toISOString() };
  }
  const from = params.get("from");
  const to = params.get("to");
  if (from && to) return { kind: "custom", from, to };
  const period = params.get("period");
  if (period === "all") return { kind: "all" };
  if (period === "30d") return { kind: "last30" };
  if (period === "year") return { kind: "year", anchor: new Date(new Date().getFullYear(), 0, 1).toISOString() };
  if (period === "month") return thisMonth();
  const narrowing =
    params.get("type") || params.get("account") || params.get("category") || params.get("tag") || params.get("search");
  if (narrowing) return { kind: "all" };
  return thisMonth();
}

/** Whether a selection is exactly the current calendar month (the default view). */
function isCurrentMonth(sel: PeriodSelection): boolean {
  if (sel.kind !== "month") return false;
  const a = new Date(sel.anchor);
  const now = new Date();
  return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth();
}

export default function TransactionsPage() {
  const { t } = useTranslation("transactions");
  const [params, setParams] = useSearchParams();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  // Initial filters can be deep-linked (e.g. dashboard "Spending by category" → a
  // category's transactions, or the global search box → ?search=).
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [type, setType] = useState<string>(params.get("type") ?? ALL);
  const [accountIds, setAccountIds] = useState<string[]>(params.get("account") ? [params.get("account")!] : []);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    params.get("tag") ? params.get("tag")!.split(",").filter(Boolean) : []
  );
  const [category, setCategory] = useState<string>(params.get("category") ?? ALL);
  // The visible period: a specific month by default, or a wider range / explicit
  // span deep-linked via the URL (see parseSelection).
  const [selection, setSelection] = useState<PeriodSelection>(() => parseSelection(params));

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

  const [trashOpen, setTrashOpen] = useState(false);

  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: tagOptions } = useTags();
  const { data: deleted } = useDeletedTransactions();

  const range = useMemo(() => selectionRange(selection), [selection]);
  const filters: TxnFilters = useMemo(
    () => ({
      search: debounced || undefined,
      type: type === ALL ? undefined : type,
      account: accountIds.length ? accountIds.join(",") : undefined,
      category: category === ALL ? undefined : category,
      tag: selectedTags.length ? selectedTags.join(",") : undefined,
      from: range.from,
      to: range.to,
    }),
    [debounced, type, accountIds, category, selectedTags, range]
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactions(filters);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // A filter that narrows the ledger to a subset (account/category/type/tag/search)
  // makes a running total meaningless — so the per-day end-of-day balance and the
  // period summary rail only appear on the whole-ledger period views.
  const hasNarrowingFilters =
    type !== ALL ||
    accountIds.length > 0 ||
    selectedTags.length > 0 ||
    category !== ALL ||
    !!debounced;
  const showRunningBalance = !!accounts && !hasNarrowingFilters;

  // Anchor for the per-day end-of-day balance: the grand total as of the window's
  // end (exclusive `to`), or the present total for an open-ended "all time" view.
  // Using the window's own `to` keeps a *past* month correct — it reads the total
  // as it stood then, not today's balance.
  const { data: ledgerBalance } = useLedgerBalance(range.to, showRunningBalance);

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

  const accountName = (id: string) =>
    accounts?.find((a) => a._id === id)?.name ?? t("account", { ns: "common" });
  const categoryName =
    category !== ALL
      ? (() => {
          const c = categories?.find((c) => c._id === category);
          return c ? categoryLabel(c.name) : t("labels.category", { ns: "common" });
        })()
      : "";

  // "Filtered" for the empty-state / reset affordances = any narrowing filter, or a
  // period other than the default current month.
  const hasFilters = hasNarrowingFilters || !isCurrentMonth(selection);

  function toggleAccount(id: string) {
    setAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }
  function clearFilters() {
    setType(ALL);
    setAccountIds([]);
    setSelectedTags([]);
    setCategory(ALL);
    setSearch("");
    setSelection(thisMonth());
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

  // Removable pills for the active fine-grained filters (the period lives in its own navigator).
  const pills: { key: string; label: string; onRemove: () => void }[] = [];
  if (type !== ALL)
    pills.push({ key: "type", label: t(`txnType.${type}`, { ns: "common" }), onRemove: () => setType(ALL) });
  accountIds.forEach((id) =>
    pills.push({ key: `acc-${id}`, label: accountName(id), onRemove: () => toggleAccount(id) })
  );
  selectedTags.forEach((tag) =>
    pills.push({ key: `tag-${tag}`, label: `#${tag}`, onRemove: () => toggleTag(tag) })
  );
  if (category !== ALL) pills.push({ key: "cat", label: categoryName, onRemove: () => setCategory(ALL) });
  if (debounced) pills.push({ key: "search", label: `“${debounced}”`, onRemove: () => setSearch("") });

  const periodLabel = selectionLabel(selection, t);
  const summary = total
    ? `${t("summary.count", { count: total })} · ${periodLabel}`
    : hasFilters
      ? t("summary.noMatch")
      : t("summary.all");

  // The summary rail earns the wide-screen blank space; it reflects the same
  // whole-ledger period the running balance uses, so hide it when filtering to a
  // subset (the /reports summary can't honour those narrowing filters).
  const showRail = !hasNarrowingFilters;

  const accountTriggerLabel =
    accountIds.length === 0
      ? t("filters.allAccounts")
      : accountIds.length === 1
        ? accountName(accountIds[0])
        : t("filters.accountsCount", { count: accountIds.length });

  const showTagFilter = (tagOptions?.length ?? 0) > 0;
  const tagTriggerLabel =
    selectedTags.length === 0
      ? t("filters.allTags")
      : selectedTags.length === 1
        ? `#${selectedTags[0]}`
        : t("filters.tagsCount", { count: selectedTags.length });

  return (
    <div className={cn("mx-auto transition-[max-width]", showRail ? "max-w-6xl" : "max-w-3xl")}>
      <PageHeader
        title={t("title")}
        description={summary}
        actions={
          <div className="flex gap-2">
            {deleted && deleted.length > 0 && (
              <Button variant="outline" onClick={() => setTrashOpen(true)}>
                <Trash2 /> {t("trash.recentlyDeleted", { count: deleted.length })}
              </Button>
            )}
            <Button onClick={addTransaction}>
              <Plus /> {t("actions.add", { ns: "common" })}
            </Button>
          </div>
        }
      />

      {/* live per-account balances — so the running balance is visible here
          without hopping to Dashboard/Accounts; each chip also filters the list */}
      <AccountBalancesStrip selectedIds={accountIds} onToggle={toggleAccount} />

      {/* one-tap "quick add" templates for frequent spends (tea, snacks, …) */}
      <QuickAddTemplates />

      {/* filters — the month navigator leads (primary control), then search, then
          a row of the fine-grained dropdowns */}
      <div className="mb-3 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <PeriodNavigator value={selection} onChange={setSelection} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("filters.searchAria")}
              placeholder={t("filters.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>
        <div
          className={cn(
            "grid grid-cols-2 gap-2",
            showTagFilter ? "sm:grid-cols-4" : "sm:grid-cols-3"
          )}
        >
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allTypes")}</SelectItem>
              <SelectItem value="expense">{t("txnType.expense", { ns: "common" })}</SelectItem>
              <SelectItem value="income">{t("txnType.income", { ns: "common" })}</SelectItem>
              <SelectItem value="transfer">{t("txnType.transfer", { ns: "common" })}</SelectItem>
            </SelectContent>
          </Select>

          {/* multi-select accounts */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                <span className="truncate">{accountTriggerLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{t("filters.filterByAccount")}</DropdownMenuLabel>
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
                  <DropdownMenuItem onClick={() => setAccountIds([])}>{t("filters.clearAccounts")}</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("labels.category", { ns: "common" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allCategories")}</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {categoryLabel(c.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* multi-select tags — only shown once the user has tagged anything */}
          {showTagFilter && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">{tagTriggerLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuLabel>{t("filters.filterByTag")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {tagOptions?.map((tg) => (
                  <DropdownMenuCheckboxItem
                    key={tg.tag}
                    checked={selectedTags.includes(tg.tag)}
                    onCheckedChange={() => toggleTag(tg.tag)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex-1 truncate">{tg.tag}</span>
                    <span className="ml-2 shrink-0 tnum text-xs text-muted-foreground">{tg.count}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                {selectedTags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSelectedTags([])}>
                      {t("filters.clearTags")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* active filter pills */}
      {pills.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">{t("filters.label")}</span>
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={p.onRemove}
              aria-label={t("filters.remove", { label: p.label })}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
            >
              {p.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
            {t("filters.resetAll")}
          </Button>
        </div>
      )}

      <div className={cn("grid gap-6", showRail && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div className="min-w-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : items.length ? (
            <>
              <TransactionList
                transactions={items}
                endingBalance={showRunningBalance ? ledgerBalance : undefined}
              />
              <div ref={sentinel} className="h-10" />
              {isFetchingNextPage && (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("loadingMore")}</p>
              )}
            </>
          ) : (
            <EmptyState
              icon={Receipt}
              title={hasFilters ? t("empty.matchTitle") : t("empty.title")}
              description={hasFilters ? t("empty.matchDescription") : t("empty.description")}
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    {t("filters.clear")}
                  </Button>
                ) : (
                  <Button onClick={addTransaction}>
                    <Plus /> {t("actions.addTransaction", { ns: "common" })}
                  </Button>
                )
              }
            />
          )}
        </div>

        {showRail && (
          <aside className="hidden lg:block">
            <MonthSummaryRail range={range} label={periodLabel} />
          </aside>
        )}
      </div>

      <RecentlyDeletedDialog open={trashOpen} onOpenChange={setTrashOpen} />
    </div>
  );
}
