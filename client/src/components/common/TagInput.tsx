import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTags } from "@/hooks/useTransactions";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
}

type Option = { kind: "tag"; tag: string; count: number } | { kind: "create"; tag: string };

/**
 * A tag field that both accepts free-typed tags AND suggests the user's existing
 * tags (from useTags) in a dropdown as they type — so the same tag is reused, not
 * re-typed with slight variations. Pending text is committed on blur, so a tag
 * typed but not Enter-ed still counts when the surrounding form is saved.
 * The suggestion list is portalled (Popover) so it never clips inside a sheet.
 */
export function TagInput({ value, onChange, placeholder, id }: TagInputProps) {
  const { t } = useTranslation("common");
  const { data: allTags } = useTags();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const q = input.trim().toLowerCase();

  const options = useMemo<Option[]>(() => {
    const selected = new Set(value.map((v) => v.toLowerCase()));
    const pool = (allTags ?? []).filter((tg) => !selected.has(tg.tag.toLowerCase()));
    const matches = (q ? pool.filter((tg) => tg.tag.toLowerCase().includes(q)) : pool).slice(0, 8);
    const opts: Option[] = matches.map((m) => ({ kind: "tag", tag: m.tag, count: m.count }));
    // Offer "Create X" when the typed text isn't already selected or an exact match.
    const exact = value.some((v) => v.toLowerCase() === q) || matches.some((m) => m.tag.toLowerCase() === q);
    if (q && !exact) opts.push({ kind: "create", tag: input.trim() });
    return opts;
  }, [allTags, value, q, input]);

  const showList = open && options.length > 0;

  function add(raw: string, keepFocus = true) {
    const tag = raw.trim().replace(/,+$/, "").trim();
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setInput("");
    setActive(0);
    if (keepFocus) inputRef.current?.focus();
  }
  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (showList && options[active]) add(options[active].tag);
      else if (input.trim()) add(input);
    } else if (e.key === "Backspace" && !input && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === "ArrowDown" && showList) {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          onMouseDown={(e) => {
            // Clicks on the empty part of the field focus the input, but don't steal
            // a click meant for a tag's remove button.
            if (e.target === e.currentTarget) inputRef.current?.focus();
          }}
          className="flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring"
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={t("tags.removeAria", { tag })}
                className="text-secondary-foreground/70 transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              if (input.trim()) add(input, false);
              setOpen(false);
            }}
            onKeyDown={onKeyDown}
            placeholder={value.length === 0 ? placeholder ?? t("tags.placeholder") : undefined}
            autoComplete="off"
            className="min-w-[6rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Interacting with the input/chips shouldn't close the list.
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="max-h-56 w-[var(--radix-popover-trigger-width)] min-w-[10rem] overflow-y-auto p-1"
      >
        {options.map((opt, i) => (
          <button
            key={`${opt.kind}-${opt.tag}`}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus in the input
              add(opt.tag);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
              i === active ? "bg-accent" : "hover:bg-accent"
            )}
          >
            {opt.kind === "create" ? (
              <span className="truncate">{t("tags.create", { tag: opt.tag })}</span>
            ) : (
              <>
                <span className="truncate">{opt.tag}</span>
                <span className="tnum shrink-0 text-xs text-muted-foreground">{opt.count}</span>
              </>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
