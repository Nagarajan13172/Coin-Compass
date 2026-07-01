import {
  LayoutDashboard,
  ArrowRightLeft,
  Wallet,
  Target,
  Trophy,
  Landmark,
  HandCoins,
  Coins,
  PieChart,
  CalendarDays,
  Repeat,
  Shapes,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar navigation, grouped into labelled sections. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/reports", label: "Reports", icon: PieChart },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/transactions", label: "Transactions", icon: ArrowRightLeft },
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/recurring", label: "Recurring", icon: Repeat },
      { to: "/categories", label: "Categories", icon: Shapes },
    ],
  },
  {
    label: "Planning",
    items: [
      { to: "/budgets", label: "Budgets", icon: Target },
      { to: "/goals", label: "Goals", icon: Trophy },
    ],
  },
  {
    label: "Wealth",
    items: [
      { to: "/net-worth", label: "Net Worth", icon: Landmark },
      { to: "/loans", label: "Loans", icon: HandCoins },
      { to: "/gold", label: "Gold", icon: Coins },
    ],
  },
];

/** Settings lives in the sidebar footer, separate from the grouped nav. */
export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

/** Flat list of every destination — used by the mobile bottom nav. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** Primary items shown in the mobile bottom bar (rest go under "More"). */
export const BOTTOM_NAV_PRIMARY = ["/", "/transactions", "/reports"];
