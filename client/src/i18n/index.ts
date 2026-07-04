import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/** Languages offered in the picker. `nativeLabel` is shown in each language's own
 *  script; `short` is a compact badge for tight spots like the mobile header. */
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", short: "EN" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", short: "த" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

// Auto-load every catalog under locales/<lang>/<namespace>.json. Adding a feature
// namespace is just dropping in a JSON pair — no wiring here to keep in sync.
const catalogModules = import.meta.glob("./locales/*/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

type Catalog = Record<string, unknown>;
export const resources: Record<string, Record<string, Catalog>> = {};
const namespaceSet = new Set<string>();

for (const [path, mod] of Object.entries(catalogModules)) {
  const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  (resources[lang] ??= {})[ns] = mod.default;
  namespaceSet.add(ns);
}

/** Every namespace discovered on disk, sorted for stable ordering. */
export const NAMESPACES = [...namespaceSet].sort();

export function isSupportedLanguage(value: unknown): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

/**
 * The language the app should boot in, read synchronously from the persisted UI
 * store so a Tamil user never sees a flash of English before settings load.
 * Falls back to English for anyone who has never chosen a language.
 */
function initialLanguage(): LanguageCode {
  try {
    const raw = localStorage.getItem("money-tracker-ui");
    if (raw) {
      const lng = JSON.parse(raw)?.state?.language;
      if (isSupportedLanguage(lng)) return lng;
    }
  } catch {
    // Corrupt/absent storage → default language. Never block startup on this.
  }
  return DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE, // any missing key renders its English text
  defaultNS: "common",
  ns: NAMESPACES,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  react: { useSuspense: false }, // resources are bundled/synchronous; never suspend
});

/** Switch the active UI language and keep <html lang> in sync (for a11y / hyphenation). */
export function applyLanguage(lang: LanguageCode) {
  if (i18n.language !== lang) i18n.changeLanguage(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

// Keep <html lang> correct on the very first paint too.
if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

export default i18n;
