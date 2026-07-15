import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { formatMoney } from "@/lib/format";

// Ids whose intro roll has already played this session. Module-level so it
// survives route unmount/remount — returning to a page snaps straight to the
// value — and resets on a full page reload, where a fresh session earns the
// roll again. This is what keeps the effect a first-arrival delight rather than
// a tax on every navigation back to the dashboard.
const introPlayed = new Set<string>();

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface CountUpProps {
  value: number;
  currency?: string;
  signed?: boolean;
  className?: string;
  duration?: number;
  /**
   * Stable id that scopes the intro roll to once per session. Without it the
   * number rolls on every mount (i.e. every navigation back) — pass one for
   * anything a user revisits, like a dashboard or account hero.
   */
  id?: string;
}

/**
 * Money value that rolls up to `value` on its first appearance, then renders
 * instantly on return visits (see `id`). Respects `prefers-reduced-motion` by
 * snapping to the final value. The currency symbol, separators and decimal
 * precision stay fixed while only the digits climb.
 */
export function CountUp({ value, currency, signed, className, duration = 0.6, id }: CountUpProps) {
  // Skip the intro when this id already rolled this session, or the user asked
  // for reduced motion — either way, start at the final value.
  const skipIntro = (id != null && introPlayed.has(id)) || reducedMotion();
  const [display, setDisplay] = useState(skipIntro ? value : 0);
  const current = useRef(display); // last shown numeric value; where the next roll starts from

  useEffect(() => {
    if (reducedMotion()) {
      current.current = value;
      setDisplay(value);
      return;
    }
    // Already settled on this value for an id that has rolled — nothing to do
    // (this is the return-visit snap, and also every StrictMode re-run in dev).
    if (id != null && introPlayed.has(id) && current.current === value) return;

    const controls = animate(current.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      },
      onComplete: () => {
        current.current = value;
        if (id != null) introPlayed.add(id);
      },
    });
    return () => controls.stop();
  }, [value, duration, id]);

  // Match intermediate precision to the target so an integer amount never
  // flashes decimals mid-roll (formatMoney renders 2dp for any fractional value).
  const shown = value % 1 === 0 ? Math.round(display) : display;
  return <span className={className}>{formatMoney(shown, { currency, signed })}</span>;
}
