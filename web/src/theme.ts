import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";
const KEY = "kha-theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Light, dark or follow the system; remembered per browser (a convenience only). */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(read);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      if (theme === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
  }, [theme]);
  return [theme, setTheme];
}
