import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe, useUnlockWealth, useLockWealth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Passcode prompt that switches the current session into the wealth (superadmin)
 * view. The everyday login never sees the Net Worth section until this succeeds.
 */
export function WealthUnlockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const unlock = useUnlockWealth();
  const [passcode, setPasscode] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode) return;
    try {
      await unlock.mutateAsync(passcode);
      toast.success("Wealth unlocked", { description: "Net Worth is now visible." });
      onOpenChange(false);
      setPasscode("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect passcode");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setPasscode("");
          setError("");
          setShow(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Unlock Net Worth</DialogTitle>
          <DialogDescription className="text-center">
            Enter your wealth passcode to reveal the Net Worth section for this session.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wealth-passcode">Wealth passcode</Label>
            <div className="relative">
              <Input
                id="wealth-passcode"
                type={show ? "text" : "password"}
                autoFocus
                autoComplete="off"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setError("");
                }}
                className="pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={show ? "Hide passcode" : "Show passcode"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={!passcode || unlock.isPending}>
              <KeyRound /> {unlock.isPending ? "Unlocking…" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Account-menu entries for switching wealth visibility. Renders nothing when the
 * lock is off (Net Worth is always visible then). Call `onUnlock` to open the
 * passcode dialog (kept in the parent so it survives the menu closing).
 */
export function WealthLockMenuItems({ onUnlock }: { onUnlock: () => void }) {
  const { data: me } = useMe();
  const lock = useLockWealth();
  if (!me?.wealthLockEnabled) return null;

  if (me.mode === "superadmin") {
    return (
      <DropdownMenuItem
        disabled={lock.isPending}
        onClick={async () => {
          await lock.mutateAsync();
          toast.success("Net Worth hidden");
        }}
      >
        <Lock /> Hide Net Worth
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // Let the menu close first, then open the dialog on the next tick so the
        // dropdown's focus-restore doesn't fight the dialog's autofocus.
        e.preventDefault();
        onUnlock();
      }}
    >
      <ShieldCheck /> Unlock Net Worth
    </DropdownMenuItem>
  );
}
