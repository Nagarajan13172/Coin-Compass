import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, Divide, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmountForInput } from "@/lib/amountFormat";

type Op = "+" | "-" | "*" | "/";

interface AmountKeypadProps {
  /** Called with the evaluated numeric value whenever input changes. */
  onChange: (value: number) => void;
  /** Seed the pad's display on mount (e.g. when editing an existing amount). */
  initialValue?: number;
  className?: string;
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? a : a / b;
  }
}

/** A money-entry calculator keypad (like the CoinCompass app's input pad). */
export function AmountKeypad({ onChange, initialValue, className }: AmountKeypadProps) {
  const { t } = useTranslation("transactions");
  // Seed the display from initialValue on mount so editing an existing transaction
  // shows its amount. The pad stays uncontrolled after mount (a plain number prop
  // can't represent in-progress states like "0." or a pending operand), so callers
  // force a fresh mount with a `key` to reseed for a different transaction.
  const seeded = initialValue != null && initialValue !== 0;
  const [display, setDisplay] = useState(() => (seeded ? String(initialValue) : "0"));
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  // A seeded value behaves like already-entered text: backspace trims a digit and
  // further digits append, rather than the first keystroke wiping the whole amount.
  const [fresh, setFresh] = useState(!seeded);

  function emit(current: string, pendingAcc: number | null, pendingOp: Op | null) {
    const cur = parseFloat(current) || 0;
    const value = pendingOp != null && pendingAcc != null ? apply(pendingAcc, cur, pendingOp) : cur;
    onChange(Number.isFinite(value) ? value : 0);
  }

  function inputDigit(d: string) {
    let next: string;
    if (fresh || display === "0") next = d;
    else next = display + d;
    if (next.replace(/[^0-9]/g, "").length > 12) return;
    setDisplay(next);
    setFresh(false);
    emit(next, acc, op);
  }

  function inputDot() {
    if (fresh) {
      setDisplay("0.");
      setFresh(false);
      return;
    }
    if (!display.includes(".")) setDisplay(display + ".");
  }

  function inputOp(nextOp: Op) {
    const cur = parseFloat(display) || 0;
    if (op != null && acc != null && !fresh) {
      const result = apply(acc, cur, op);
      setAcc(result);
      setDisplay(String(result));
      emit(String(result), result, nextOp);
    } else {
      setAcc(cur);
      emit(display, cur, nextOp);
    }
    setOp(nextOp);
    setFresh(true);
  }

  function equals() {
    if (op != null && acc != null) {
      const cur = parseFloat(display) || 0;
      const result = apply(acc, cur, op);
      setDisplay(String(Math.round(result * 100) / 100));
      setAcc(null);
      setOp(null);
      setFresh(true);
      onChange(Number.isFinite(result) ? result : 0);
    }
  }

  function backspace() {
    if (fresh || display.length <= 1) {
      setDisplay("0");
      setFresh(true);
      emit("0", acc, op);
      return;
    }
    const next = display.slice(0, -1);
    setDisplay(next);
    emit(next, acc, op);
  }

  // Let the user just type the amount. A ref keeps a single window listener
  // pointed at the latest handlers (avoids stale-closure bugs without
  // re-binding every render). We ignore keystrokes aimed at real inputs and
  // dropdown type-ahead so the note/tags/account fields still work normally.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (
      el?.closest(
        'input, textarea, select, [contenteditable="true"], [role="listbox"], [role="option"], [role="menu"], [role="combobox"], [role="textbox"]'
      )
    )
      return;

    const k = e.key;
    if (k >= "0" && k <= "9") inputDigit(k);
    else if (k === "." || k === ",") inputDot();
    else if (k === "+" || k === "-" || k === "*" || k === "/") inputOp(k as Op);
    else if (k === "=") equals();
    else if (k === "Backspace") backspace();
    else return; // not ours — let it through
    e.preventDefault();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const keyCls =
    "flex h-12 items-center justify-center rounded-lg text-lg font-semibold transition-colors active:scale-95 select-none";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-end gap-2 rounded-lg bg-muted/60 px-3 py-2">
        {op && (
          <span className="text-sm text-muted-foreground tnum">
            {formatAmountForInput(String(acc))} {op === "*" ? "×" : op === "/" ? "÷" : op}
          </span>
        )}
        <span className="text-2xl font-bold tnum">{formatAmountForInput(display)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("7")}>7</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("8")}>8</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("9")}>9</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("/")} aria-label={t("keypad.divide")}><Divide className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("4")}>4</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("5")}>5</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("6")}>6</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("*")} aria-label={t("keypad.multiply")}><X className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("1")}>1</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("2")}>2</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("3")}>3</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("-")} aria-label={t("keypad.subtract")}><Minus className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDot()}>.</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("0")}>0</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={backspace} aria-label={t("keypad.delete")}><Delete className="h-5 w-5" /></button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("+")} aria-label={t("keypad.add")}><Plus className="h-5 w-5" /></button>
      </div>
      <button
        type="button"
        onClick={equals}
        className={cn(keyCls, "w-full bg-secondary hover:bg-accent")}
      >
        =
      </button>
    </div>
  );
}
