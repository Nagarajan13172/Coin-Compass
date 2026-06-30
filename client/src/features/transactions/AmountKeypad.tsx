import { useState } from "react";
import { Delete, Divide, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Op = "+" | "-" | "*" | "/";

interface AmountKeypadProps {
  /** Called with the evaluated numeric value whenever input changes. */
  onChange: (value: number) => void;
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

/** A money-entry calculator keypad (like the Money Tracker app's input pad). */
export function AmountKeypad({ onChange, className }: AmountKeypadProps) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);

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

  const keyCls =
    "flex h-12 items-center justify-center rounded-lg text-lg font-semibold transition-colors active:scale-95 select-none";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-end gap-2 rounded-lg bg-muted/60 px-3 py-2">
        {op && (
          <span className="text-sm text-muted-foreground tnum">
            {acc} {op === "*" ? "×" : op === "/" ? "÷" : op}
          </span>
        )}
        <span className="text-2xl font-bold tnum">{display}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("7")}>7</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("8")}>8</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("9")}>9</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("/")} aria-label="Divide"><Divide className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("4")}>4</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("5")}>5</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("6")}>6</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("*")} aria-label="Multiply"><X className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("1")}>1</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("2")}>2</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("3")}>3</button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("-")} aria-label="Subtract"><Minus className="h-5 w-5" /></button>

        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDot()}>.</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={() => inputDigit("0")}>0</button>
        <button type="button" className={cn(keyCls, "bg-muted hover:bg-accent")} onClick={backspace} aria-label="Delete"><Delete className="h-5 w-5" /></button>
        <button type="button" className={cn(keyCls, "bg-primary/10 text-primary hover:bg-primary/20")} onClick={() => inputOp("+")} aria-label="Add"><Plus className="h-5 w-5" /></button>
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
