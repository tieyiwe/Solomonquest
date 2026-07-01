import { useTranslation } from "@/hooks/useTranslation";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const { locale, changeLocale, supportedLanguages } = useTranslation();

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-1">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <select
          value={locale}
          onChange={(e) => changeLocale(e.target.value as Parameters<typeof changeLocale>[0])}
          className="appearance-none bg-transparent text-sm text-muted-foreground hover:text-foreground cursor-pointer outline-none pr-1"
          aria-label="Select language"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
