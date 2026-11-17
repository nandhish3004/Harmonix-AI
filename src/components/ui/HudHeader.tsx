"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wifi, Battery, Radio } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface HudHeaderProps {
  title: string;
  subtitle?: string;
  step?: string;
  backHref?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  title,
  subtitle,
  step,
  backHref,
  onBack,
  rightAction,
}) => {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header className="w-full bg-white/90 dark:bg-[#0D191C]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#294044] sticky top-0 z-50 px-4 pt-3 pb-3 transition-colors duration-200">
      {/* iOS style top status bar simulation */}
      <div className="flex items-center justify-between text-slate-500 dark:text-[#8C999A] text-xs font-mono mb-2 px-1">
        <span className="font-semibold text-slate-900 dark:text-[#F5FDFF]">09:41</span>
        <div className="flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
          <Wifi className="w-3.5 h-3.5" />
          <Battery className="w-4 h-4 text-emerald-600 dark:text-[#DDF0C2]" />
        </div>
      </div>

      {/* Main navigation row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {(backHref || onBack) && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF] hover:border-slate-300 dark:hover:border-[#0EB29A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div>
            {step && (
              <span className="block text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] uppercase font-semibold">
                {step}
              </span>
            )}
            <h1 className="text-base font-bold font-mono tracking-wide text-slate-900 dark:text-[#F5FDFF] uppercase flex items-center gap-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-[#8C999A] font-mono">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {rightAction}
        </div>
      </div>
    </header>
  );
};
