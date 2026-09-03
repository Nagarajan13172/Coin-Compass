import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Compass } from "lucide-react";
import { AuthPanel, PANEL_VARIANTS, type PanelVariant } from "./AuthPanels";

/**
 * The frame around every signed-out page: sign in, sign up, verify, 2FA, reset.
 *
 * Two columns on a wide screen — what the app is on the left, the form on the
 * right — and the form alone on a phone. The left panel is not decoration for
 * its own sake: a signed-out visitor has no other way to find out what this is,
 * and a lone box in the middle of an empty page tells them nothing.
 *
 * Which panel is still an open question, so four live in the tree at once and
 * `?panel=brief|product|editorial|chart` switches between them. Once one is
 * chosen the rest come out and this reduces to a single import.
 */

/** The one served when nothing asks for another. */
const DEFAULT_PANEL: PanelVariant = "brief";

function usePanelVariant(): PanelVariant {
  const [params] = useSearchParams();
  const asked = params.get("panel") as PanelVariant | null;
  return asked && PANEL_VARIANTS.includes(asked) ? asked : DEFAULT_PANEL;
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const variant = usePanelVariant();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Every panel hides itself below lg, so a phone keeps exactly the single
          centred card it had before — there is no room to say anything else on
          360px, and the fastest sign-in screen has nothing else on it. */}
      <AuthPanel variant={variant} />

      <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4 lg:min-h-0">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            {/* The mark repeats on a phone, where the panel isn't shown. */}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:hidden">
              <Compass className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
