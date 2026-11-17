"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = React.createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => null,
  resolvedTheme: "light",
});

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "harmonix_theme",
  attribute = "class",
  enableSystem = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("light");
  const [mounted, setMounted] = React.useState(false);

  // Initialize from storage or default
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as Theme | null;
      if (saved && (saved === "light" || saved === "dark" || saved === "system")) {
        setThemeState(saved);
      } else {
        setThemeState(defaultTheme);
      }
    } catch {
      setThemeState(defaultTheme);
    }
    setMounted(true);
  }, [defaultTheme, storageKey]);

  // Apply theme class to document.documentElement
  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    let effective: "light" | "dark" = "light";

    if (theme === "system" && enableSystem) {
      effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else if (theme === "dark") {
      effective = "dark";
    } else {
      effective = "light";
    }

    setResolvedTheme(effective);

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(effective);
    } else {
      root.setAttribute(attribute, effective);
    }
  }, [theme, mounted, attribute, enableSystem]);

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {}
      setThemeState(newTheme);
    },
    [storageKey]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeContext);
