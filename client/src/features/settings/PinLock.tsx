import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Delete, Lock } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { verifyPin } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

export function PinLock() {
  const { t } = useTranslation("settings");
  const locked = useUIStore((s) => s.locked);
  const setLocked = useUIStore((s) => s.setLocked);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (!locked) return null;

  async function submit(next: string) {
    if (next.length < 4) return;
    const ok = await verifyPin(next);
    if (ok) {
      setLocked(false);
      setPin("");
      setError(false);
    } else {
      setError(true);
      setPin("");
      setTimeout(() => setError(false), 600);
    }
  }

  function press(d: string) {
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length >= 4) void submit(next);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-lg font-semibold">{t("pinLock.title")}</h1>
      <motion.div
        className="mt-6 flex gap-3"
        animate={error ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2",
              i < pin.length ? "border-primary bg-primary" : "border-muted-foreground/40",
              error && "border-destructive"
            )}
          />
        ))}
      </motion.div>

      <div className="mt-10 grid w-full max-w-[240px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PinKey key={d} onClick={() => press(d)}>
            {d}
          </PinKey>
        ))}
        <span />
        <PinKey onClick={() => press("0")}>0</PinKey>
        <PinKey onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t("pinLock.delete")}>
          <Delete className="h-5 w-5" />
        </PinKey>
      </div>
    </div>
  );
}

function PinKey({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="flex h-16 w-16 items-center justify-center justify-self-center rounded-full bg-muted text-xl font-semibold transition-colors hover:bg-accent active:scale-95"
      {...props}
    >
      {children}
    </button>
  );
}
