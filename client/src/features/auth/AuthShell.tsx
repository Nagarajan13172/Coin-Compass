import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { APP_NAME, APP_VERSION, currentYear } from "@/lib/appInfo";

/**
 * The frame around every signed-out page: sign in, sign up, verify, 2FA, reset.
 *
 * Two columns on a wide screen — what the app is on the left, the form on the
 * right — and the form alone on a phone. The left panel is not decoration for
 * its own sake: a signed-out visitor has no other way to find out what this is,
 * and a lone box in the middle of an empty page tells them nothing.
 *
 * One sentence and a lot of air, rather than a feature list or a screenshot.
 * There is nothing in it to go out of date, which is what a page this permanent
 * wants. It stays dark in both themes because that is the product's colour, the
 * one from the app icon — the page is recognisable before a pixel of the app
 * itself has loaded.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("auth");
  const copyright = t("shell.copyright", { year: currentYear(), name: APP_NAME });

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Hidden below lg, so a phone keeps exactly the single centred card it
          had before — there is no room to say anything else on 360px, and the
          fastest sign-in screen has nothing else on it. */}
      {/* The panel is dark in both themes, but not the same dark. In light mode
          it's the app icon's near-black against a white form — a deliberate
          contrast. In dark mode that same near-black sat ten points below the
          form's surface and the seam read as two unrelated pages, so it becomes
          one step under the theme's own background instead: same hue, slightly
          deeper, one surface with a fold in it. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-white/[0.06] bg-slate-950 p-12 text-slate-100 lg:flex lg:border-r xl:p-16 dark:bg-[hsl(222_47%_8%)]">
        <CompassRose />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-600/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Compass className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
            {t("shell.headline")}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate-400">
            {t("shell.tagline")}
          </p>
        </div>

        {/* The panel is decoration around the only thing that matters, so it
            never costs the page a scrollbar: the footer goes first when the
            window runs short, headline last. */}
        <div className="relative hidden space-y-1.5 [@media(min-height:560px)]:block">
          <p className="text-xs text-slate-500">{t("shell.footnote")}</p>
          <p className="text-xs text-slate-600">
            {copyright} · v{APP_VERSION}
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/30 p-4 lg:min-h-0">
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
        {/* Repeated here rather than only in the panel: on a phone the panel
            doesn't exist, and that is where most people will sign in. */}
        <p className="text-center text-xs text-muted-foreground lg:hidden">
          {copyright} · v{APP_VERSION}
        </p>
      </main>
    </div>
  );
}

/**
 * The app's mark at texture scale, bleeding off the corner.
 *
 * Deliberately faint. At any more contrast it stops being a background and
 * starts being a large blue arrow pointing at nothing.
 */
function CompassRose() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className="pointer-events-none absolute -bottom-16 -right-24 h-[30rem] w-[30rem]"
    >
      <g stroke="#e2e8f0" strokeOpacity="0.10" fill="none">
        <circle cx="200" cy="200" r="190" strokeWidth="1" />
        <circle cx="200" cy="200" r="150" strokeWidth="1" />
        <circle cx="200" cy="200" r="96" strokeWidth="1" />
        {/* Cardinal ticks, so it reads as a compass rose and not a target. */}
        <path d="M200 10 V52 M200 348 V390 M10 200 H52 M348 200 H390" strokeWidth="1.5" />
      </g>
      <path d="M200 70 L218 200 L182 200 Z" fill="#3b82f6" fillOpacity="0.22" />
      <path d="M200 330 L218 200 L182 200 Z" fill="#e2e8f0" fillOpacity="0.07" />
      <circle cx="200" cy="200" r="7" fill="none" stroke="#e2e8f0" strokeOpacity="0.18" />
    </svg>
  );
}
