import {
  LayoutDashboard,
  ArrowRightLeft,
  Wallet,
  Target,
  Trophy,
  Landmark,
  HandCoins,
  HeartHandshake,
  Coins,
  PieChart,
  CalendarDays,
  Repeat,
  Shapes,
  Bell,
  Inbox,
  Settings,
  type LucideIcon,
} from "lucide-react";
/** A key into the `nav` translation namespace; resolved to a label at render time. */
type NavLabelKey = string;

export interface NavItem {
  to: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
}

export interface NavGroup {
  labelKey: NavLabelKey;
  items: NavItem[];
}

/** Sidebar navigation, grouped into labelled sections. Labels are translation keys. */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "groups.overview",
    items: [
      { to: "/", labelKey: "items.dashboard", icon: LayoutDashboard },
      { to: "/reports", labelKey: "items.reports", icon: PieChart },
      { to: "/calendar", labelKey: "items.calendar", icon: CalendarDays },
      { to: "/notifications", labelKey: "items.notifications", icon: Bell },
    ],
  },
  {
    labelKey: "groups.money",
    items: [
      { to: "/transactions", labelKey: "items.transactions", icon: ArrowRightLeft },
      { to: "/captured", labelKey: "items.captured", icon: Inbox },
      { to: "/accounts", labelKey: "items.accounts", icon: Wallet },
      { to: "/recurring", labelKey: "items.recurring", icon: Repeat },
      { to: "/categories", labelKey: "items.categories", icon: Shapes },
    ],
  },
  {
    labelKey: "groups.planning",
    items: [
      { to: "/budgets", labelKey: "items.budgets", icon: Target },
      { to: "/goals", labelKey: "items.goals", icon: Trophy },
    ],
  },
  {
    labelKey: "groups.wealth",
    items: [
      { to: "/net-worth", labelKey: "items.netWorth", icon: Landmark },
      { to: "/loans", labelKey: "items.loans", icon: HandCoins },
      { to: "/credits", labelKey: "items.credits", icon: HeartHandshake },
      { to: "/gold", labelKey: "items.gold", icon: Coins },
    ],
  },
];

/** Settings lives in the sidebar footer, separate from the grouped nav. */
export const SETTINGS_ITEM: NavItem = { to: "/settings", labelKey: "items.settings", icon: Settings };

/**
 * Destinations that reveal net-worth figures. Hidden from the nav (and blocked
 * at the route) in the everyday "user" view when the wealth lock is engaged.
 */
export const WEALTH_ONLY_PATHS = ["/net-worth"];

/** Flat list of every destination — used by the mobile bottom nav. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** Primary items shown in the mobile bottom bar (rest go under "More"). */
export const BOTTOM_NAV_PRIMARY = ["/", "/transactions", "/reports"];
