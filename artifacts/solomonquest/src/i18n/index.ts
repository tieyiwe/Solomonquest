import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import sw from "./locales/sw.json";

export type Locale = "en" | "fr" | "es" | "pt" | "sw";

const LOCALES: Record<Locale, typeof en> = { en, fr, es, pt, sw };
const STORAGE_KEY = "sq_locale";

export const SUPPORTED_LANGUAGES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "sw", label: "Swahili", nativeLabel: "Kiswahili" },
];

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && stored in LOCALES) return stored;
  const browser = navigator.language.split("-")[0] as Locale;
  return browser in LOCALES ? browser : "en";
}

let currentLocale: Locale = detectLocale();

type TranslationTree = typeof en;

// Get a nested translation value by dot-path, e.g. "auth.signIn"
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj as unknown) as string ?? path;
}

export function t(key: string, replacements?: Record<string, string>): string {
  const translations = LOCALES[currentLocale] as unknown as Record<string, unknown>;
  let value = getNestedValue(translations, key);
  if (!value || value === key) {
    // Fallback to English
    const enTranslations = LOCALES.en as unknown as Record<string, unknown>;
    value = getNestedValue(enTranslations, key);
  }
  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      value = value.replace(new RegExp(`{{${k}}}`, "g"), v);
    });
  }
  return value ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  // Dispatch event so React components can re-render
  window.dispatchEvent(new CustomEvent("localechange", { detail: locale }));
}
