import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { formatMoney } from "@/lib/format";

interface CountUpProps {
  value: number;
  currency?: string;
  signed?: boolean;
  className?: string;
  duration?: number;
}

/** Animated number that counts up to `value`, formatted as money. */
export function CountUp({ value, currency, signed, className, duration = 0.7 }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={className}>{formatMoney(display, { currency, signed })}</span>
  );
}
