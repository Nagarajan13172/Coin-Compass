import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Receipt, Search, X } from "lucide-react";
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
import { TransactionList } from "@/features/transactions/TransactionList";
import { useTransactions, type TxnFilters } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useUIStore } from "@/stores/ui";

const ALL = "__all__";

export default function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  const [search, setSearch] = useState(params.get("search") ?? "");
  const [type, setType] = useState<string>(ALL);
  const [account, setAccount] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);

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

  const filters: TxnFilters = useMemo(
    () => ({
      search: debounced || undefined,
      type: type === ALL ? undefined : type,
      account: account === ALL ? undefined : account,
      category: category === ALL ? undefined : category,
    }),
    [debounced, type, account, category]
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

  const hasFilters = type !== ALL || account !== ALL || category !== ALL || !!debounced;

  function clearFilters() {
    setType(ALL);
    setAccount(ALL);
    setCategory(ALL);
    setSearch("");
    setParams({});
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={total ? `${total} transaction${total === 1 ? "" : "s"}` : "All your transactions"}
        actions={
          <Button onClick={() => openTxnSheet({ type: "expense" })}>
            <Plus /> Add
          </Button>
        }
      />

      {/* filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search note, payee, tag…"
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
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts?.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X /> Clear
          </Button>
        )}
      </div>

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
              <Button onClick={() => openTxnSheet({ type: "expense" })}>
                <Plus /> Add transaction
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
