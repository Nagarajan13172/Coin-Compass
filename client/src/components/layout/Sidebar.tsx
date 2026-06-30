import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft, Plus, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "./nav";
import { useUIStore } from "@/stores/ui";

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card/40 transition-[width] duration-300 lg:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="h-5 w-5" />
        </div>
        {!collapsed && (
          <span className="truncate text-base font-bold tracking-tight">Money Tracker</span>
        )}
      </div>

      <div className="px-3 pb-2">
        <Button
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => openTxnSheet({ type: "expense" })}
        >
          <Plus />
          {!collapsed && "Add transaction"}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 no-scrollbar">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-0"
              )
            }
            title={collapsed ? item.label : undefined}
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
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full justify-start text-muted-foreground", collapsed && "justify-center px-0")}
          onClick={toggle}
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className={cn("transition-transform", collapsed && "rotate-180")} />
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
