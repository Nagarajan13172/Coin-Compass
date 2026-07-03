import { describe, it, expect, afterAll } from "vitest";
import i18n, { applyLanguage, resources, SUPPORTED_LANGUAGES, NAMESPACES } from "./index";

/** Flatten a nested translation object into sorted dot-paths ("a.b.c"). */
function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      return v && typeof v === "object" && !Array.isArray(v)
        ? keyPaths(v as Record<string, unknown>, path)
        : [path];
    })
    .sort();
}

/** Every leaf value in a catalog, as [path, value] pairs. */
function leaves(obj: Record<string, unknown>, prefix = ""): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? leaves(v as Record<string, unknown>, path)
      : [[path, v] as [string, unknown]];
  });
}

const TAMIL = /[஀-௿]/; // Tamil Unicode block

describe("i18n catalogs", () => {
  // English is the source of truth; every other language must mirror its key shape
  // exactly so nothing silently falls through to a raw key on screen.
  for (const ns of NAMESPACES) {
    it(`ta/${ns} has exactly the same keys as en/${ns}`, () => {
      const en = keyPaths(resources.en[ns]);
      const ta = keyPaths(resources.ta[ns]);
      expect(ta).toEqual(en); // reports both missing and extra keys
    });
  }

  it("no catalog has empty string values", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      for (const ns of NAMESPACES) {
        for (const [path, value] of leaves(resources[lang][ns])) {
          expect(typeof value, `${lang}/${ns}:${path}`).toBe("string");
          expect((value as string).trim().length, `${lang}/${ns}:${path}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("Tamil nav labels are actually in Tamil script (not copied English)", () => {
    for (const [path, value] of leaves(resources.ta.nav)) {
      expect(TAMIL.test(value as string), `ta/nav:${path} = "${value}"`).toBe(true);
    }
  });
});

describe("i18n runtime", () => {
  afterAll(() => applyLanguage("en")); // don't leak language state to other tests

  it("falls back to English so untranslated keys are never blank", () => {
    // The fallback chain is what protects English users from any gap in another
    // language's catalog.
    const fallback = i18n.options.fallbackLng;
    expect(JSON.stringify(fallback)).toContain("en");
  });

  it("resolves the same key differently per language", () => {
    const en = i18n.getFixedT("en", "nav");
    const ta = i18n.getFixedT("ta", "nav");
    expect(en("items.dashboard")).toBe("Dashboard");
    expect(ta("items.dashboard")).toBe("டாஷ்போர்டு");
    expect(ta("items.transactions")).not.toBe(en("items.transactions"));
  });

  it("applyLanguage switches the active language", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("nav:items.settings")).toBe("Settings");
    applyLanguage("ta");
    await Promise.resolve();
    expect(i18n.language).toBe("ta");
    expect(i18n.t("nav:items.settings")).toBe("அமைப்புகள்");
  });
});

// The i18next plural suffixes we allow a bare key to expand to.
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

describe("i18n plural keys", () => {
  it("every _one key has a matching _other in the same catalog (both languages)", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      for (const ns of NAMESPACES) {
        const keys = new Set(keyPaths(resources[lang][ns]));
        for (const key of keys) {
          if (key.endsWith("_one")) {
            const base = key.slice(0, -"_one".length);
            expect(keys.has(`${base}_other`), `${lang}/${ns}: ${key} needs ${base}_other`).toBe(true);
          }
        }
      }
    }
  });
});

describe("i18n translation coverage", () => {
  // A real translation, not a copy of English. Some values are legitimately shared
  // (brand names, "UPI", "EMI", numeric masks), so we require a majority to differ
  // rather than all — this catches a namespace that was never actually translated.
  it("most Tamil values differ from English per namespace", () => {
    for (const ns of NAMESPACES) {
      const en = leaves(resources.en[ns]);
      const taMap = new Map(leaves(resources.ta[ns]));
      const differ = en.filter(([path, val]) => taMap.get(path) !== val).length;
      const ratio = differ / en.length;
      expect(ratio, `ta/${ns} only ${Math.round(ratio * 100)}% translated`).toBeGreaterThan(0.5);
    }
  });
});

describe("i18n key usage scan", () => {
  // Load every source file as raw text so we can check that each literal t()/ts()
  // key actually exists in a catalog. A typo'd key would silently fall back to its
  // own name on screen; this turns that into a build failure instead.
  const sources = import.meta.glob("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  // Union of every key path across all English namespaces (English is the source of
  // truth for the key shape).
  const allKeys = new Set<string>();
  for (const ns of NAMESPACES) for (const k of keyPaths(resources.en[ns])) allKeys.add(k);

  function exists(rawKey: string): boolean {
    // Strip an explicit "ns:" prefix; we check existence across all namespaces.
    const key = rawKey.includes(":") ? rawKey.slice(rawKey.indexOf(":") + 1) : rawKey;
    if (allKeys.has(key)) return true;
    return PLURAL_SUFFIXES.some((s) => allKeys.has(`${key}${s}`));
  }

  // Matches t("key"...) / ts("key"...) / i18n.t("key"...) with a STRING-LITERAL key.
  // Template-literal (dynamic) keys are intentionally skipped.
  const CALL = /\b(?:t|ts)\(\s*["']([^"'`]+)["']/g;

  it("every literal t() key resolves to a catalog entry", () => {
    const missing: string[] = [];
    for (const [path, code] of Object.entries(sources)) {
      if (path.includes("/i18n/") || path.includes(".test.") || path.endsWith(".d.ts")) continue;
      for (const m of code.matchAll(CALL)) {
        const key = m[1];
        if (!exists(key)) missing.push(`${path.replace(/^\.\.\//, "src/")} → "${key}"`);
      }
    }
    expect(missing, `Unresolved t() keys:\n${missing.join("\n")}`).toEqual([]);
  });
});
