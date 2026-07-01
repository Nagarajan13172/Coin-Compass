import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getIcon, ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function IconPicker({
  value,
  color = "#64748B",
  onChange,
}: {
  value: string;
  color?: string;
  onChange: (icon: string) => void;
}) {
  const [query, setQuery] = useState("");

  const names = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.includes(q));
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="pl-9"
        />
      </div>
      <ScrollArea className="h-48 rounded-lg border p-2">
        {names.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No icons found</p>
        ) : (
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {names.map((name) => {
              const Icon = getIcon(name);
              const active = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg border transition-colors",
                    active ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent"
                  )}
                  style={active ? { color } : undefined}
                  aria-label={name}
                  title={name}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
