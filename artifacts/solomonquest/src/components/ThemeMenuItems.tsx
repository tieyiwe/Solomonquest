import { useState } from "react";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Appearance picker rendered inside a DropdownMenuContent. */
export function ThemeMenuItems() {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference());

  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground pt-1.5 pb-1">
        Appearance
      </DropdownMenuLabel>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem
          key={value}
          className="cursor-pointer gap-2"
          onSelect={(e) => {
            e.preventDefault();
            setThemePreference(value);
            setPref(value);
          }}
          aria-checked={pref === value}
          role="menuitemradio"
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
          {pref === value && <Check className="ml-auto h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
