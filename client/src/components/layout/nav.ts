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
  Lightbulb,
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

/**
 * Sidebar navigation, grouped into labelled sections. Labels are translation keys.
 *
 * Ordered by how often a destination is actually reached for, heaviest first.
 * Transactions leads the top group because it is the only page written to on most
 * days; Planning sits second because a budget you don't pass is a budget that
 * changes nothing. Read-only analysis (Insights) and the notification list — which
 * already has a bell in the header — sit last so they don't outrank pages that
 * carry balances.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "groups.overview",
    items: [
      { to: "/", labelKey: "items.dashboard", icon: LayoutDashboard },
      { to: "/transactions", labelKey: "items.transactions", icon: ArrowRightLeft },
      { to: "/reports", labelKey: "items.reports", icon: PieChart },
      { to: "/calendar", labelKey: "items.calendar", icon: CalendarDays },
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
    labelKey: "groups.money",
    items: [
      { to: "/accounts", labelKey: "items.accounts", icon: Wallet },
      { to: "/credits", labelKey: "items.credits", icon: HeartHandshake },
      { to: "/recurring", labelKey: "items.recurring", icon: Repeat },
      { to: "/categories", labelKey: "items.categories", icon: Shapes },
    ],
  },
  {
    labelKey: "groups.wealth",
    items: [
      { to: "/net-worth", labelKey: "items.netWorth", icon: Landmark },
      { to: "/loans", labelKey: "items.loans", icon: HandCoins },
      { to: "/gold", labelKey: "items.gold", icon: Coins },
    ],
  },
  {
    labelKey: "groups.more",
    items: [
      { to: "/insights", labelKey: "items.insights", icon: Lightbulb },
      { to: "/notifications", labelKey: "items.notifications", icon: Bell },
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
