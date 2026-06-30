import {
  Wallet, Landmark, CreditCard, PiggyBank, Banknote, Utensils, ShoppingCart, Car, ShoppingBag,
  Receipt, Home, Clapperboard, HeartPulse, GraduationCap, Plane, Fuel, Repeat, Sparkles, Gift,
  Ellipsis, Briefcase, Laptop, TrendingUp, Percent, RotateCcw, Tag, Coffee, Bus, Smartphone,
  Dumbbell, Baby, PawPrint, Wrench, Shirt, BookOpen, Music, Gamepad2, Pizza, Bike, type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  wallet: Wallet, landmark: Landmark, "credit-card": CreditCard, "piggy-bank": PiggyBank,
  banknote: Banknote, utensils: Utensils, "shopping-cart": ShoppingCart, car: Car,
  "shopping-bag": ShoppingBag, receipt: Receipt, home: Home, clapperboard: Clapperboard,
  "heart-pulse": HeartPulse, "graduation-cap": GraduationCap, plane: Plane, fuel: Fuel,
  repeat: Repeat, sparkles: Sparkles, gift: Gift, ellipsis: Ellipsis, briefcase: Briefcase,
  laptop: Laptop, "trending-up": TrendingUp, percent: Percent, "rotate-ccw": RotateCcw, tag: Tag,
  coffee: Coffee, bus: Bus, smartphone: Smartphone, dumbbell: Dumbbell, baby: Baby,
  "paw-print": PawPrint, wrench: Wrench, shirt: Shirt, "book-open": BookOpen, music: Music,
  gamepad: Gamepad2, pizza: Pizza, bike: Bike,
};

/** All selectable icons (for the category/account icon picker). */
export const ICON_NAMES = Object.keys(map);

export function getIcon(name?: string | null): LucideIcon {
  if (!name) return Tag;
  return map[name] ?? Tag;
}
