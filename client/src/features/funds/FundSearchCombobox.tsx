import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFundSearch } from "@/hooks/useFunds";
import type { FundHit } from "@/lib/types";

interface Props {
  value: FundHit | null;
  onChange: (hit: FundHit | null) => void;
  id?: string;
}

/**
 * Search-as-you-type scheme picker, over the AMFI universe the server caches.
 * There is no free-text fallback on purpose: one fund publishes several NAVs —
 * Direct and Regular, Growth and each IDCW frequency — and a typed name can't
 * say which, so every scheme code stored here comes from a result AMFI listed.
 */
export function FundSearchCombobox({ value, onChange, id }: Props) {
  const { t } = useTranslation("funds");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce so a fast typist doesn't fire a request per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: hits, isFetching } = useFundSearch(debounced);

  // Close when focus leaves the whole control, not merely the input — otherwise
  // clicking a result dismisses the list before the click registers.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(hit: FundHit) {
    onChange(hit);
    setQuery("");
    setOpen(false);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <Check className="h-4 w-4 shrink-0 text-income" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[value.plan, value.option, value.fundHouse].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-primary hover:underline"
          onClick={() => onChange(null)}
        >
          {t("search.change")}
        </button>
      </div>
    );
  }

  const showList = open && debounced.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("search.placeholder")}
          className="pl-9"
          autoComplete="off"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showList && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {hits && hits.length > 0 ? (
            hits.map((hit) => (
              <button
                key={hit.schemeCode}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent"
                onClick={() => pick(hit)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hit.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[hit.plan, hit.option, hit.fundHouse].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {hit.nav > 0 && (
                  <Badge variant="secondary" className="shrink-0 tabular-nums text-[10px]">
                    ₹{hit.nav}
                  </Badge>
                )}
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {isFetching ? t("search.searching") : t("search.noResults")}
            </p>
          )}
        </div>
      )}
      {!showList && query.trim().length > 0 && query.trim().length < 2 && (
        <p className="mt-1 text-xs text-muted-foreground">{t("search.keepTyping")}</p>
      )}
    </div>
  );
}
