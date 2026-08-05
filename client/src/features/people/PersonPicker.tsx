import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePeople } from "@/hooks/usePeople";
import { enumLabel } from "@/lib/i18nLabels";
import { matchPeople, isExactPersonMatch } from "@/lib/people";

/**
 * What the picker reports upstream: an id when someone was chosen from the list,
 * otherwise just the typed name. The server accepts either — a bare name
 * find-or-creates the Person — so "type someone who isn't in the list yet" needs
 * no separate create step.
 */
export interface PersonSelection {
  name: string;
  personId: string | null;
}

interface Props {
  value: PersonSelection;
  onChange: (v: PersonSelection) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Choose a person, or name a new one.
 *
 * Built on Popover + a filtered list rather than a combobox library, since the
 * project has no cmdk dependency and this needs only search, pick, and "use what
 * I typed". Typing always stays authoritative: whatever is in the box is what
 * gets submitted if the user never picks from the list.
 */
export function PersonPicker({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const { t } = useTranslation("people");
  const { data: people } = usePeople();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => matchPeople(people ?? [], query), [people, query]);
  // Offer "add <name>" only for a name that isn't already an exact match, so the
  // list never shows a create row for someone who plainly exists.
  const canCreate = query.trim().length > 0 && !isExactPersonMatch(people ?? [], query);

  function pick(name: string, personId: string | null) {
    onChange({ name, personId });
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setQuery(value.name);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className={cn("w-full justify-between font-normal", !value.name && "text-muted-foreground", className)}
        >
          <span className="truncate">{value.name || placeholder || t("picker.placeholder")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Enter takes the first match, else the typed name as a new person.
              if (matches.length) pick(matches[0].name, matches[0]._id);
              else if (query.trim()) pick(query.trim(), null);
            }}
            placeholder={t("picker.searchPlaceholder")}
            aria-label={t("picker.searchPlaceholder")}
          />
        </div>

        <div className="max-h-56 overflow-y-auto p-1">
          {matches.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => pick(p.name, p._id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Check
                className={cn("h-4 w-4 shrink-0", value.personId === p._id ? "opacity-100" : "opacity-0")}
              />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {enumLabel("relation", p.relation)}
              </span>
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              onClick={() => pick(query.trim(), null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{t("picker.addNamed", { name: query.trim() })}</span>
            </button>
          )}

          {!matches.length && !canCreate && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("picker.empty")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
