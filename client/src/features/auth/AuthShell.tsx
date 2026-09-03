import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Compass, PiggyBank, Repeat, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/format";

/**
 * The frame around every signed-out page: sign in, sign up, verify, 2FA, reset.
 *
 * Two columns on a wide screen — what the app is on the left, the form on the
 * right — and the form alone on a phone. The left panel is not decoration for
 * its own sake: a signed-out visitor has no other way to find out what this is,
 * and a lone box in the middle of an empty page tells them nothing.
 *
 * It stays dark in both themes on purpose. It's the product's own colour, the
 * one from the app icon, so the page is recognisable before a single pixel of
 * the app itself has loaded.
 */

/** What the app does, in three lines. */
const POINTS = [
  { key: "spending", Icon: PiggyBank },
  { key: "worth", Icon: TrendingUp },
  { key: "automatic", Icon: Repeat },
] as const;

/** A month of net worth, purely illustrative — the shape of the thing, not data. */
const TREND = [22, 26, 24, 31, 29, 36, 34, 42, 47, 45, 53, 58];

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

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Hidden below lg, so a phone keeps exactly the single centred card it
          had before — there is no room to say anything else on 360px. */}
      <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-slate-100 lg:flex lg:flex-col lg:justify-between xl:p-14">
        {/* Two soft pools of colour, so the panel isn't a flat block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-teal-400/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Compass className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">CoinCompass</span>
        </div>

        {/* Sized to the window, not to the content: a short laptop screen must
            not end up with a scrolling sign-in page. The pieces below drop away
            as the height runs out, headline last. */}
        <div className="relative max-w-md space-y-6 py-8 xl:space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
              {t("shell.headline")}
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">{t("shell.tagline")}</p>
          </div>

          <ul className="hidden space-y-4 [@media(min-height:640px)]:block">
            {POINTS.map(({ key, Icon }) => (
              <li key={key} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-blue-300" />
                </span>
                <div>
                  <p className="text-sm font-medium">{t(`shell.points.${key}.title`)}</p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {t(`shell.points.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* A glimpse of the product rather than a stock photograph: the same
              card the dashboard opens with, drawn from sample numbers. */}
          <div className="hidden rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm [@media(min-height:820px)]:block">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                {t("shell.sample.label")}
              </p>
              {/* Said plainly, because a figure this specific otherwise looks
                  like somebody's real balance. */}
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                {t("shell.sample.tag")}
              </p>
            </div>
            <p className="tnum mt-1 text-2xl font-bold">{formatMoney(662584, { currency: "INR" })}</p>
            <p className="tnum text-[11px] text-emerald-400">
              {t("shell.sample.change", { amount: formatMoney(48200, { currency: "INR" }) })}
            </p>
            <Sparkline />
          </div>
        </div>

        <p className="relative hidden text-xs text-slate-500 [@media(min-height:560px)]:block">
          {t("shell.footnote")}
        </p>
      </aside>

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

/** The trend as a filled line — decorative, so it's hidden from assistive tech. */
function Sparkline() {
  const w = 260;
  const h = 48;
  const max = Math.max(...TREND);
  const min = Math.min(...TREND);
  const points = TREND.map((v, i) => {
    const x = (i / (TREND.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 h-12 w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="auth-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points.join(" ")} ${w},${h}`} fill="url(#auth-spark)" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
