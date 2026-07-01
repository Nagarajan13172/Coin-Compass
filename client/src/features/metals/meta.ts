import type { Metal } from "@/lib/types";

/** Display label + accent color for each tracked metal. */
export const METAL_META: Record<Metal, { label: string; color: string }> = {
  gold: { label: "Gold", color: "#D4AF37" },
  silver: { label: "Silver", color: "#94A3B8" },
};
