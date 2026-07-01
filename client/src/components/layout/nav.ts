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

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/goals", label: "Goals", icon: Trophy },
  { to: "/net-worth", label: "Net Worth", icon: Landmark },
  { to: "/loans", label: "Loans", icon: HandCoins },
  { to: "/gold", label: "Gold", icon: Coins },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/categories", label: "Categories", icon: Shapes },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Primary items shown in the mobile bottom bar (rest go under "More"). */
export const BOTTOM_NAV_PRIMARY = ["/", "/transactions", "/reports"];
