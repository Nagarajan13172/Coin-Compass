import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Getting around a settings page that is 1,800px tall on a laptop and twice that
 * on a phone.
 *
 * Ten cards in one scroll meant the only way to reach the PIN was to travel past
 * everything else. This is a table of contents: a rail beside the page on a
 * laptop, a strip of chips above it on a phone, both tracking what's on screen so
 * the page always says where you are.
 *
 * Plain anchors underneath, so it works before the observer attaches and a
 * section link can be shared or bookmarked.
 */

export interface SettingsSection {
  id: string;
  Icon: LucideIcon;
}

/** Which section is showing. The first one whose heading is above the fold wins. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;

    // The band is the top third of the viewport: a section counts as "current"
    // once its heading reaches it, which matches where the eye actually is.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -66% 0px", threshold: 0 }
    );
    targets.forEach((el) => observer.observe(el));

    // The last section is often too short to ever reach the band, so the bottom
    // of the page claims it — otherwise scrolling to the end highlights nothing.
    // Checked once on mount too, in case the page opens already at the bottom.
    function onScroll() {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) setActive(ids[ids.length - 1]);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);

  return [active, setActive] as const;
}

export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const { t } = useTranslation("settings");
  const [active, setActive] = useActiveSection(sections.map((s) => s.id));

  return (
    <>
      {/* Phone: a strip that scrolls sideways, stuck under the header. */}
      <nav
        aria-label={t("nav.label")}
        className="sticky top-14 z-20 -mx-4 mb-5 overflow-x-auto border-b bg-background/85 px-4 py-2 backdrop-blur lg:hidden"
      >
        <ul className="flex w-max gap-1.5">
          {sections.map(({ id, Icon }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() => setActive(id)}
                aria-current={active === id ? "true" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`nav.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Laptop: a rail that stays put while the page moves past it. */}
      <nav aria-label={t("nav.label")} className="hidden lg:block">
        <ul className="sticky top-20 space-y-0.5">
          {sections.map(({ id, Icon }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() => setActive(id)}
                aria-current={active === id ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active === id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(`nav.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/**
 * One band of the page. `scroll-mt` keeps the heading clear of the sticky header
 * when it's jumped to — without it the anchor lands under the top bar.
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
