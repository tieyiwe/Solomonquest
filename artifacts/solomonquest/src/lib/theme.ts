/**
 * Light / dark appearance. The preference is a per-device convenience kept in
 * localStorage; index.html applies it before first paint so there is no flash.
 * "system" follows the OS setting. Default is "light".
 */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "sq-theme";

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "light";
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePreference = getThemePreference()) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", !!dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0e121b" : "#141d33");
}

export function setThemePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage unavailable */
  }
  applyTheme(pref);
}
