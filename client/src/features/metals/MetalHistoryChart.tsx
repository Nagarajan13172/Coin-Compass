import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Maximize2 } from "lucide-react";
import { compactNumber, formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Metal, MetalPrice } from "@/lib/types";
import { metalChartSeries, type GoldCity } from "./cities";
import {
  fullWindow,
  isZoomed,
  panBy,
  windowSize,
  zoomAt,
  type ZoomWindow,
} from "./zoomWindow";

function dayLabel(d: string) {
  try {
    return format(parseISO(d), "dd MMM", { locale: dateFnsLocale() });
  } catch {
    return d;
  }
}

// The plot area sits inside the container: the YAxis (width 52) plus the chart's
// left margin (-8) push it ~44px in from the left, and the right margin is 8.
// Mapping a pointer's x to a data fraction against the plot (not the whole
// container) keeps "zoom around the cursor/pinch" landing where you expect.
const PLOT_LEFT = 44;
const PLOT_RIGHT = 8;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

type Gesture =
  | { kind: "pinch"; startDist: number; startWin: ZoomWindow; focus: number }
  | { kind: "pan"; startX: number; startWin: ZoomWindow }
  | null;

/**
 * Area chart of a metal's per-gram rate (INR) over the accumulated history.
 * Gold tracks the selected city's 22K counter rate — GRT's real rate on the days we
 * captured it, else spot + premium — so the chart agrees with the headline card.
 * Silver tracks its .999 (24K) per-gram rate.
 *
 * Interactive: scroll/pinch to zoom around the cursor, drag to pan when zoomed,
 * and double-click or the reset button to return to the full range. Zoom is a
 * visible index window over the data (see zoomWindow), so axes re-scale crisply
 * rather than the SVG being stretched.
 */
export function MetalHistoryChart({
  data,
  color = "#D4AF37",
  metal = "gold",
  city,
  variant = "area",
  zones = null,
}: {
  data: MetalPrice[];
  color?: string;
  metal?: Metal;
  city?: GoldCity;
  /**
   * How the series is drawn. The area reads as a trend line; bars make each
   * day's rate its own quantity, which is easier to compare day to day when
   * you're deciding whether to buy this week.
   */
  variant?: "area" | "bar";
  /**
   * Shades the plot against the period's average: green below it, red above,
   * with a neutral strip between. Omit to draw the series alone.
   */
  zones?: { average: number; goodBelow: number; highAbove: number } | null;
}) {
  const { t } = useTranslation("credits");
  const gradId = useId();
  const series = useMemo(() => metalChartSeries(data, metal, city), [data, metal, city]);
  const seriesLabel = metal === "gold" ? t("gold.seriesGold") : t("gold.seriesOther");

  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);
  const [win, setWin] = useState<ZoomWindow>(() => fullWindow(series.length));

  // Keep the latest window/total reachable from the native (non-React) wheel &
  // touchmove listeners below without re-subscribing them on every change.
  const winRef = useRef(win);
  winRef.current = win;
  const totalRef = useRef(series.length);
  totalRef.current = series.length;

  // A new range/metal/city produces a fresh series — snap back to the full view.
  useEffect(() => {
    setWin(fullWindow(series.length));
  }, [series]);

  const zoomed = isZoomed(win, series.length);
  const view = useMemo(() => series.slice(win.start, win.end + 1), [series, win]);

  // Bounds for the shaded zones. Recharts discards a reference area that runs
  // past the axis domain, so "everything above the line" has to be an actual
  // number — the visible range with a little headroom, recomputed as you zoom.
  const [bandBottom, bandTop] = useMemo(() => {
    const values = view.map((p) => p.value).filter((v) => v > 0);
    if (!values.length) return [0, 0];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.25, hi * 0.01);
    return [lo - pad, hi + pad];
  }, [view]);

  /** Pointer x → fraction (0…1) across the plot area. */
  const focusFraction = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0.5;
    const r = el.getBoundingClientRect();
    const width = r.width - PLOT_LEFT - PLOT_RIGHT;
    if (width <= 0) return 0.5;
    return clamp01((clientX - r.left - PLOT_LEFT) / width);
  }, []);

  const reset = useCallback(() => setWin(fullWindow(totalRef.current)), []);

  // Wheel (desktop) and pinch/pan (touch) must call preventDefault to stop the
  // page scrolling/zooming underneath — which React's synthetic listeners can't
  // reliably do (they attach passive). So wire the movement listeners natively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (totalRef.current <= 2) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2; // scroll up = zoom in
      const f = focusFraction(e.clientX);
      setWin((prev) => zoomAt(prev, totalRef.current, factor, f));
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      const total = totalRef.current;
      if (g.kind === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (g.startDist > 0) setWin(zoomAt(g.startWin, total, dist / g.startDist, g.focus));
      } else if (g.kind === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const plotW = Math.max(r.width - PLOT_LEFT - PLOT_RIGHT, 1);
        const dxFrac = (e.touches[0].clientX - g.startX) / plotW;
        setWin(panBy(g.startWin, total, -dxFrac * windowSize(g.startWin)));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [focusFraction]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gesture.current = {
        kind: "pinch",
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startWin: winRef.current,
        focus: focusFraction((a.clientX + b.clientX) / 2),
      };
    } else if (e.touches.length === 1 && isZoomed(winRef.current, totalRef.current)) {
      gesture.current = { kind: "pan", startX: e.touches[0].clientX, startWin: winRef.current };
    } else {
      gesture.current = null;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) {
      gesture.current = null;
    } else if (e.touches.length === 1) {
      // A finger lifted out of a pinch — continue as a pan if still zoomed.
      gesture.current = isZoomed(winRef.current, totalRef.current)
        ? { kind: "pan", startX: e.touches[0].clientX, startWin: winRef.current }
        : null;
    }
  }

  // Mouse drag to pan (desktop) once zoomed in. Track on window so the drag
  // survives the cursor leaving the chart, and clean up on release.
  function onMouseDown(e: React.MouseEvent) {
    if (!isZoomed(winRef.current, totalRef.current)) return;
    const startX = e.clientX;
    const startWin = winRef.current;
    const el = containerRef.current;
    const plotW = el ? Math.max(el.getBoundingClientRect().width - PLOT_LEFT - PLOT_RIGHT, 1) : 1;
    const move = (ev: MouseEvent) => {
      const dxFrac = (ev.clientX - startX) / plotW;
      setWin(panBy(startWin, totalRef.current, -dxFrac * windowSize(startWin)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative select-none", zoomed && "cursor-grab active:cursor-grabbing")}
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onDoubleClick={reset}
    >
      {zoomed && (
        <button
          type="button"
          onClick={reset}
          aria-label={t("gold.zoomReset")}
          className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" /> {t("gold.zoomReset")}
        </button>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={view} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          {/* Cheap and dear by recent standards, not a forecast. Drawn before the
              series so the line and bars sit on top of the shading. */}
          {zones && zones.average > 0 && (
            <>
              <ReferenceArea
                y1={zones.highAbove}
                y2={bandTop}
                fill="hsl(var(--expense))"
                fillOpacity={0.08}
                ifOverflow="visible"
              />
              <ReferenceArea
                y1={bandBottom}
                y2={zones.goodBelow}
                fill="hsl(var(--income))"
                fillOpacity={0.08}
                ifOverflow="visible"
              />
              <ReferenceLine
                y={zones.average}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
            </>
          )}
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(v) => compactNumber(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
            allowDataOverflow
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(value: number) => [formatMoney(value, { currency: "INR" }), seriesLabel]}
          />
          {variant === "bar" ? (
            <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ) : (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {!zoomed && series.length > 2 && (
        <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted-foreground/70">
          {t("gold.zoomHint")}
        </span>
      )}
    </div>
  );
}
