"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`w-8 h-8 rounded-[8px] bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] ${className}`} />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-colors ${
        isDark
          ? "bg-[#15282C] border border-[#294044] text-[#F5C518] hover:text-white hover:border-[#0EB29A]"
          : "bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300"
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform duration-200 hover:-rotate-12 text-slate-700" />
      )}
    </button>
  );
};
