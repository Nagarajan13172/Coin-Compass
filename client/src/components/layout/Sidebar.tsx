import { useNavigate, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { ChevronsUpDown, Compass, LogOut, PanelLeft, PanelLeftClose, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { NAV_GROUPS, SETTINGS_ITEM, WEALTH_ONLY_PATHS, type NavItem } from "./nav";
import { useUIStore } from "@/stores/ui";
import { useMe, useLogout, useCanSeeWealth } from "@/hooks/useAuth";
import { WealthLockMenuItems, WealthUnlockDialog } from "@/features/settings/WealthLock";

export function Sidebar() {
  const { t } = useTranslation("nav");
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const canSeeWealth = useCanSeeWealth();
  // In the everyday (user) view the Net Worth destination is hidden entirely.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canSeeWealth || !WEALTH_ONLY_PATHS.includes(i.to)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card/40 transition-[width] duration-300 lg:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Header / top nav — brand + collapse toggle */}
      <div className="flex h-16 items-center gap-2 px-3">
        {collapsed ? (
          <button
            onClick={toggle}
            aria-label={t("expandSidebar")}
            className="group mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Compass className="h-5 w-5 group-hover:hidden" />
            <PanelLeft className="hidden h-5 w-5 group-hover:block" />
          </button>
        ) : (
          <>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Compass className="h-5 w-5" />
            </div>
            <span className="truncate text-base font-bold tracking-tight">CoinCompass</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              onClick={toggle}
              aria-label={t("collapseSidebar")}
            >
              <PanelLeftClose />
            </Button>
          </>
        )}
      </div>

      {/* Quick add */}
      <div className="px-3 pb-1">
        <Button
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => openTxnSheet({ type: "expense" })}
        >
          <Plus />
          {!collapsed && t("actions.addTransaction", { ns: "common" })}
        </Button>
      </div>

      {/* Grouped navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
        {groups.map((group, gi) => (
          <div key={group.labelKey} className={cn("space-y-1", gi > 0 && "pt-4")}>
            {collapsed
              ? gi > 0 && <div className="mx-2 mb-3 h-px bg-border/60" />
              : (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t(group.labelKey)}
                </p>
              )}
            {group.items.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer — settings + account */}
      <div className="space-y-1 border-t p-3">
        <SidebarLink item={SETTINGS_ITEM} collapsed={collapsed} />
        <SidebarUser collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation("nav");
  const label = t(item.labelKey);
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          collapsed && "justify-center px-0"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
            />
          )}
          <item.icon className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function initials(name: string, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation(["nav", "common"]);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const logout = useLogout();
  const [unlockOpen, setUnlockOpen] = useState(false);
  if (!me) return null;

  async function signOut() {
    await logout.mutateAsync();
    navigate("/login", { replace: true });
  }

  const avatar = (
    <Avatar className="h-8 w-8">
      {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
      <AvatarFallback>{initials(me.name, me.email)}</AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent",
              collapsed && "justify-center p-1.5"
            )}
            aria-label={t("accountMenu")}
          >
            {avatar}
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {me.name || t("account", { ns: "common" })}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate font-medium">{me.name || t("account", { ns: "common" })}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <WealthLockMenuItems onUnlock={() => setUnlockOpen(true)} />
          <DropdownMenuItem onClick={signOut} disabled={logout.isPending}>
            <LogOut /> {t("actions.signOut", { ns: "common" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WealthUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
    </>
  );
}
