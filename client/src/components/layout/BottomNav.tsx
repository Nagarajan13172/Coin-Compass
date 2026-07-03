import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, BOTTOM_NAV_PRIMARY, WEALTH_ONLY_PATHS } from "./nav";
import { useUIStore } from "@/stores/ui";
import { useCanSeeWealth } from "@/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function BottomNav() {
  const { t } = useTranslation(["nav", "common"]);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const canSeeWealth = useCanSeeWealth();

  const primary = BOTTOM_NAV_PRIMARY.map((to) => NAV_ITEMS.find((n) => n.to === to)!);
  const moreItems = NAV_ITEMS.filter(
    (n) =>
      !BOTTOM_NAV_PRIMARY.includes(n.to) &&
      (canSeeWealth || !WEALTH_ONLY_PATHS.includes(n.to))
  );
  const moreActive = moreItems.some((n) => n.to === location.pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 pb-[env(safe-area-inset-bottom)]">
        {primary.slice(0, 2).map((item) => (
          <BottomLink key={item.to} {...item} />
        ))}

        {/* center FAB */}
        <div className="flex justify-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => openTxnSheet({ type: "expense" })}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            aria-label={t("actions.addTransaction", { ns: "common" })}
          >
            <Plus className="h-6 w-6" />
          </motion.button>
        </div>

        {primary.slice(2).map((item) => (
          <BottomLink key={item.to} {...item} />
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium",
                moreActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              {t("more")}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <SheetHeader>
              <SheetTitle>{t("menu")}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 p-4">
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    )
                  }
                >
                  <item.icon className="h-6 w-6" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

function BottomLink({ to, labelKey, icon: Icon }: (typeof NAV_ITEMS)[number]) {
  const { t } = useTranslation("nav");
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
          isActive ? "text-primary" : "text-muted-foreground"
        )
      }
    >
      <Icon className="h-5 w-5" />
      {t(labelKey)}
    </NavLink>
  );
}
