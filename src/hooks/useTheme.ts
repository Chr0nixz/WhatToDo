import { useEffect } from "react";

import type { AccentColor, ThemeMode } from "@/data/types";

export const useTheme = (theme: ThemeMode, accentColor: AccentColor) => {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const shouldUseDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", shouldUseDark);
      root.dataset.theme = theme;
      root.dataset.accent = accentColor;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);

    return () => media.removeEventListener("change", applyTheme);
  }, [theme, accentColor]);
};
