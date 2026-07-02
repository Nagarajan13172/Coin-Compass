import { useRef } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Number of digit boxes (default 6). */
  length?: number;
  /** Fired when every box is filled. */
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Segmented one-time-code input: N single-character boxes that behave like one
 * field. Digits only. Handles typing, backspace, arrow navigation, and pasting
 * a full code. `value` is the plain string; parents treat it like any input.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  onComplete,
  autoFocus,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function focusBox(i: number) {
    const el = inputs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  }

  function commit(next: string) {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  function handleChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // Replace from position i with the typed digits (supports fast typing/autofill).
    const chars = value.split("");
    let pos = i;
    for (const d of digits) {
      if (pos >= length) break;
      chars[pos] = d;
      pos++;
    }
    const next = chars.join("").slice(0, length);
    commit(next);
    focusBox(pos);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = value.split("");
      if (chars[i]) {
        chars[i] = "";
        commit(chars.join(""));
      } else if (i > 0) {
        chars[i - 1] = "";
        commit(chars.join(""));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    commit(digits);
    focusBox(digits.length);
  }

  return (
    <div className={cn("flex justify-center gap-2 sm:gap-2.5", className)}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={ariaLabel ? `${ariaLabel} digit ${i + 1}` : `Digit ${i + 1}`}
          value={value[i] ?? ""}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-11 rounded-lg border bg-background text-center text-lg font-semibold tabular-nums shadow-sm transition-colors",
            "focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid && "border-destructive focus:border-destructive focus:ring-destructive/30"
          )}
        />
      ))}
    </div>
  );
}
