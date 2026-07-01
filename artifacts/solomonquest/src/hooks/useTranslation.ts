import { useState, useEffect, useCallback } from "react";
import { t, getLocale, setLocale, type Locale, SUPPORTED_LANGUAGES } from "@/i18n";

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    const handler = (e: Event) => {
      setLocaleState((e as CustomEvent<Locale>).detail);
    };
    window.addEventListener("localechange", handler);
    return () => window.removeEventListener("localechange", handler);
  }, []);

  const changeLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
  }, []);

  return { t, locale, changeLocale, supportedLanguages: SUPPORTED_LANGUAGES };
}
