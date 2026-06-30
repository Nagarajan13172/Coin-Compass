import { useNavigate } from "react-router-dom";
import { Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { useUIStore } from "@/stores/ui";

export function TopBar() {
  const navigate = useNavigate();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      {/* mobile brand */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold">Money Tracker</span>
      </div>

      <form
        className="relative ml-auto hidden max-w-sm flex-1 sm:block lg:ml-0"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q") as string;
          navigate(`/transactions?search=${encodeURIComponent(q ?? "")}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" placeholder="Search transactions…" className="pl-9" />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <ThemeToggle />
        <Button className="hidden md:inline-flex" onClick={() => openTxnSheet({ type: "expense" })}>
          <Plus /> Add
        </Button>
      </div>
    </header>
  );
}
