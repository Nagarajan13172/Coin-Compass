import { getIcon, ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";
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
  return (
    <ScrollArea className="h-40 rounded-lg border p-2">
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        {ICON_NAMES.map((name) => {
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
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
