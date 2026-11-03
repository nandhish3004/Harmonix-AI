"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wifi, Battery, Radio } from "lucide-react";

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
    <header className="w-full bg-[#0D191C]/90 backdrop-blur-md border-b border-[#294044] sticky top-0 z-50 px-4 pt-3 pb-3">
      {/* iOS style top status bar simulation */}
      <div className="flex items-center justify-between text-[#8C999A] text-xs font-mono mb-2 px-1">
        <span className="font-semibold text-[#F5FDFF]">09:41</span>
        <div className="flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-[#0EB29A]" />
          <Wifi className="w-3.5 h-3.5 text-[#8C999A]" />
          <Battery className="w-4 h-4 text-[#DDF0C2]" />
        </div>
      </div>

      {/* Main navigation row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(backHref || onBack) && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-[#15282C] border border-[#294044] text-[#8C999A] hover:text-[#F5FDFF] hover:border-[#0EB29A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div>
            {step && (
              <span className="block text-[10px] font-mono tracking-widest text-[#0EB29A] uppercase">
                {step}
              </span>
            )}
            <h1 className="text-base font-bold font-mono tracking-wide text-[#F5FDFF] uppercase flex items-center gap-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-[#8C999A] font-mono">{subtitle}</p>
            )}
          </div>
        </div>

        <div>{rightAction}</div>
      </div>
    </header>
  );
};

