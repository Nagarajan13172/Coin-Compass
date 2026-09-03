import { useTranslation } from "react-i18next";
import { Compass, PiggyBank, Repeat, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/format";

/**
 * Four takes on the signed-out panel, kept side by side so they can be compared
 * in the browser rather than argued about in the abstract. Same words in each —
 * only the presentation differs, which is the thing actually being chosen.
 *
 * Pick one with `?panel=brief|product|editorial|chart` on any signed-out page.
 * When the choice is made, the other three come out along with the switch.
 */

export type PanelVariant = "brief" | "product" | "editorial" | "chart";

export const PANEL_VARIANTS: PanelVariant[] = ["brief", "product", "editorial", "chart"];

/** A year of net worth, purely illustrative — the shape of the thing, not data. */
const TREND = [22, 26, 24, 31, 29, 36, 34, 42, 47, 45, 53, 58];

const POINTS = [
  { key: "spending", Icon: PiggyBank },
  { key: "worth", Icon: TrendingUp },
  { key: "automatic", Icon: Repeat },
] as const;

/** The shared dark ground. Every variant sits on the product's own colour. */
function Ground({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <aside
      className={`relative hidden overflow-hidden bg-slate-950 text-slate-100 lg:flex lg:flex-col ${className}`}
    >
      {children}
    </aside>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center gap-3 ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
        <Compass className="h-5 w-5" />
      </div>
      <span className="text-lg font-bold tracking-tight">CoinCompass</span>
    </div>
  );
}

/** Points as a path across a box, newest last. */
function trendPoints(w: number, h: number, pad = 3) {
  const max = Math.max(...TREND);
  const min = Math.min(...TREND);
  return TREND.map((v, i) => {
    const x = (i / (TREND.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - pad * 2) - pad;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

/**
 * The same points as a smooth curve (Catmull-Rom through the points, emitted as
 * cubic beziers). Straight segments look like a zigzag once the box is stretched
 * wide; a curve keeps reading as a line on a chart.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** The trend as {x,y} pairs, for the curved variants. */
function trendXY(w: number, h: number, pad: number) {
  const max = Math.max(...TREND);
  const min = Math.min(...TREND);
  return TREND.map((v, i) => ({
    x: (i / (TREND.length - 1)) * w,
    y: h - ((v - min) / (max - min || 1)) * (h - pad * 2) - pad,
  }));
}

function Sparkline({ className = "h-12 w-full" }: { className?: string }) {
  const w = 260;
  const h = 48;
  const points = trendPoints(w, h);
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
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

/** The net-worth tile the dashboard opens with, at panel scale. */
function WorthCard() {
  const { t } = useTranslation("auth");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("shell.sample.label")}</p>
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("shell.sample.tag")}</p>
      </div>
      <p className="tnum mt-1 text-2xl font-bold">{formatMoney(662584, { currency: "INR" })}</p>
      <p className="tnum text-[11px] text-emerald-400">
        {t("shell.sample.change", { amount: formatMoney(48200, { currency: "INR" }) })}
      </p>
      <Sparkline />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A — Brief. Says what the app does, in words, with one card as proof.
 * The safest of the four: nobody leaves this panel unsure what they're
 * signing into. Also the busiest.
 * ------------------------------------------------------------------ */
function PanelBrief() {
  const { t } = useTranslation("auth");
  return (
    <Ground className="justify-between p-10 xl:p-14">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-teal-400/15 blur-3xl"
      />
      <Wordmark />
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
        <div className="hidden [@media(min-height:820px)]:block">
          <WorthCard />
        </div>
      </div>
      <p className="relative hidden text-xs text-slate-500 [@media(min-height:560px)]:block">
        {t("shell.footnote")}
      </p>
    </Ground>
  );
}

/* ------------------------------------------------------------------ *
 * B — Product. Shows the thing instead of describing it: a stack of the
 * app's own surfaces, overlapping as if mid-use. Fewer words, more
 * evidence — and it dates faster, because the app will move on.
 * ------------------------------------------------------------------ */
function PanelProduct() {
  const { t } = useTranslation("auth");
  const rows = [
    { key: "food", pct: 72, amount: 18400 },
    { key: "transport", pct: 46, amount: 11900 },
    { key: "bills", pct: 28, amount: 7200 },
  ];

  return (
    <Ground className="justify-between p-10 xl:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/4 h-[36rem] w-[36rem] rounded-full bg-blue-600/20 blur-3xl"
      />
      <Wordmark />

      <div className="relative py-8">
        <h2 className="max-w-sm text-2xl font-bold leading-tight tracking-tight xl:text-3xl">
          {t("shell.headline")}
        </h2>

        {/* Overlapped, slightly tilted: a stack of surfaces rather than a
            screenshot, so it reads as the product without pretending to be a
            real window. */}
        <div className="relative mt-8 hidden [@media(min-height:700px)]:block">
          <div className="max-w-sm rotate-[-1.5deg] rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl backdrop-blur">
            <WorthCard />
          </div>
          <div className="ml-10 mt-[-1.5rem] max-w-xs rotate-[1.5deg] space-y-2.5 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl backdrop-blur">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {t("shell.sample.spendLabel")}
            </p>
            {rows.map((r) => (
              <div key={r.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-slate-300">{t(`shell.sample.rows.${r.key}`)}</span>
                  <span className="tnum text-slate-400">
                    {formatMoney(r.amount, { currency: "INR" })}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative hidden text-xs text-slate-500 [@media(min-height:560px)]:block">
        {t("shell.footnote")}
      </p>
    </Ground>
  );
}

/* ------------------------------------------------------------------ *
 * C — Editorial. One sentence, a great deal of air, and the compass
 * drawn large enough to be a texture rather than an icon. Calm, ages
 * well, and says the least about what the app actually does.
 * ------------------------------------------------------------------ */
function PanelEditorial() {
  const { t } = useTranslation("auth");
  return (
    <Ground className="justify-between p-12 xl:p-16">
      {/* The mark at texture scale. The rings carry it; the needle is drawn in
          the brand blue and kept faint, because a filled shape at ring opacity
          reads as a smudge rather than a compass. */}
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
        {/* Faint enough to be texture. At any more it stops being a background
            and starts being a large blue arrow pointing at nothing. */}
        <path d="M200 70 L218 200 L182 200 Z" fill="#3b82f6" fillOpacity="0.22" />
        <path d="M200 330 L218 200 L182 200 Z" fill="#e2e8f0" fillOpacity="0.07" />
        <circle cx="200" cy="200" r="7" fill="none" stroke="#e2e8f0" strokeOpacity="0.18" />
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-600/15 blur-3xl"
      />

      <Wordmark />

      <div className="relative max-w-lg">
        <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
          {t("shell.headline")}
        </h2>
        <p className="mt-6 max-w-md text-base leading-relaxed text-slate-400">
          {t("shell.tagline")}
        </p>
      </div>

      <p className="relative hidden text-xs text-slate-500 [@media(min-height:560px)]:block">
        {t("shell.footnote")}
      </p>
    </Ground>
  );
}

/* ------------------------------------------------------------------ *
 * D — Chart. The panel IS the chart: words up top, a full-bleed rising
 * line across the bottom. Unmistakably financial, and the least
 * literal — it never claims to be anyone's data.
 * ------------------------------------------------------------------ */
function PanelChart() {
  const { t } = useTranslation("auth");
  const w = 600;
  const h = 300;
  // Generous padding keeps the curve shallow once the box is stretched wide —
  // a steep zigzag looks like a fever chart, not a portfolio.
  const pts = trendXY(w, h, 70);
  const line = smoothPath(pts);

  return (
    <Ground className="justify-between">
      <div className="relative z-10 p-10 xl:p-14">
        <Wordmark className="mb-10" />
        <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
          {t("shell.headline")}
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">{t("shell.tagline")}</p>
        <div className="mt-8 hidden gap-8 [@media(min-height:660px)]:flex">
          {POINTS.map(({ key, Icon }) => (
            <div key={key} className="max-w-[10rem]">
              <Icon className="h-4 w-4 text-blue-300" />
              <p className="mt-2 text-xs font-medium leading-snug">
                {t(`shell.points.${key}.title`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Full-bleed and anchored to the bottom edge: the panel's floor is the
          chart's baseline, so there is no card and no frame to fight. */}
      <svg
        aria-hidden
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[55%] w-full"
      >
        <defs>
          <linearGradient id="auth-panel-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#auth-panel-fill)" />
        <path
          d={line}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The chart runs under the footnote, so the footnote brings its own
          ground rather than being crossed out by a line. */}
      <div className="relative z-10 mt-auto bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pt-16">
        <p className="hidden p-10 pt-0 text-xs text-slate-500 xl:px-14 [@media(min-height:560px)]:block">
          {t("shell.footnote")}
        </p>
      </div>
    </Ground>
  );
}

const PANELS: Record<PanelVariant, () => JSX.Element> = {
  brief: PanelBrief,
  product: PanelProduct,
  editorial: PanelEditorial,
  chart: PanelChart,
};

export function AuthPanel({ variant }: { variant: PanelVariant }) {
  const Panel = PANELS[variant] ?? PanelBrief;
  return <Panel />;
}
