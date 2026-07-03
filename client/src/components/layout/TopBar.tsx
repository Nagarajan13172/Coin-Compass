import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Compass,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useUIStore } from "@/stores/ui";
import { useMe, useLogout } from "@/hooks/useAuth";
import { useState } from "react";
import { WealthLockMenuItems, WealthUnlockDialog } from "@/features/settings/WealthLock";
import type { TxnType } from "@/lib/types";

function initials(name: string, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

function UserMenu() {
  const { t } = useTranslation(["common", "nav"]);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const logout = useLogout();
  const [unlockOpen, setUnlockOpen] = useState(false);
  if (!me) return null;

  async function signOut() {
    await logout.mutateAsync();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("accountMenu", { ns: "nav" })}>
            <Avatar className="h-8 w-8">
              {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
              <AvatarFallback>{initials(me.name, me.email)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate font-medium">{me.name || t("account")}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <WealthLockMenuItems onUnlock={() => setUnlockOpen(true)} />
          <DropdownMenuItem onClick={signOut} disabled={logout.isPending}>
            <LogOut /> {t("actions.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WealthUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
    </>
  );
}

/** Add-transaction menu: pick the type up front instead of always defaulting to
 *  an expense. Shared by the desktop button (the mobile FAB stays expense-first).
 *  Labels come from the `common:txnType` catalog at render time. */
const ADD_TYPES: { type: TxnType; icon: React.ReactNode }[] = [
  { type: "expense", icon: <ArrowUpRight className="text-expense" /> },
  { type: "income", icon: <ArrowDownLeft className="text-income" /> },
  { type: "transfer", icon: <ArrowLeftRight /> },
];

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [searchOpen, setSearchOpen] = useState(false);

  function runSearch(q: string) {
    navigate(`/transactions?search=${encodeURIComponent(q.trim())}`);
    setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      {/* mobile brand */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Compass className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold">CoinCompass</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="hidden md:inline-flex">
            <Plus /> {t("actions.add")} <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {ADD_TYPES.map((opt) => (
            <DropdownMenuItem key={opt.type} onClick={() => openTxnSheet({ type: opt.type })}>
              {opt.icon} {t(`txnType.${opt.type}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* desktop / tablet inline search */}
      <form
        className="relative hidden max-w-sm flex-1 sm:block"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch((new FormData(e.currentTarget).get("q") as string) ?? "");
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" type="search" aria-label={t("search.ariaLabel")} placeholder={t("search.placeholder")} className="pl-9" />
      </form>

      <div className="ml-auto flex items-center gap-1">
        {/* mobile search — the inline form is hidden below sm, so give phones a way in */}
        <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label={t("search.title")}>
              <Search className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="top" className="p-4">
            <SheetHeader className="sr-only">
              <SheetTitle>{t("search.title")}</SheetTitle>
            </SheetHeader>
            <form
              className="relative mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch((new FormData(e.currentTarget).get("q") as string) ?? "");
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                autoFocus
                aria-label={t("search.ariaLabel")}
                placeholder={t("search.placeholder")}
                className="pl-9"
              />
            </form>
          </SheetContent>
        </Sheet>
        <LanguageToggle />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
