"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sliders,
  ScanLine,
  Layers,
  Eye,
  Activity,
  Grid3X3,
  ShieldCheck,
  Flame,
  AlertTriangle,
  Download,
} from "lucide-react";
import { clsx } from "clsx";

export const PIPELINE_STEPS = [
  { href: "/setup", label: "01 Setup", icon: Sliders },
  { href: "/scan", label: "02 Scan", icon: ScanLine },
  { href: "/material", label: "03 Material", icon: Layers },
  { href: "/viewport", label: "04 Viewport", icon: Eye },
  { href: "/tuner", label: "05 Tuner", icon: Activity },
  { href: "/modes", label: "06 Modes", icon: Grid3X3 },
  { href: "/safety", label: "07 Safety", icon: ShieldCheck },
  { href: "/stress", label: "08 Stress", icon: Flame },
  { href: "/defects", label: "09 Defects", icon: AlertTriangle },
  { href: "/export", label: "10 Export", icon: Download },
];

export const HudNav: React.FC = () => {
  const pathname = usePathname();

  // Do not show on onboarding/auth screens
  if (pathname === "/language" || pathname === "/auth" || pathname === "/") {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0D191C]/95 backdrop-blur-lg border-t border-[#294044] px-2 py-2">
      <div className="max-w-[440px] mx-auto flex items-center justify-between overflow-x-auto no-scrollbar gap-1 px-1">
        {PIPELINE_STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = pathname === step.href;
          return (
            <Link
              key={step.href}
              href={step.href}
              className={clsx(
                "flex flex-col items-center justify-center min-w-[54px] py-1 px-1 rounded-[8px] transition-all duration-150 select-none",
                isActive
                  ? "bg-[#1C332E] text-[#0EB29A] border border-[#0EB29A]/40 shadow-[0_0_10px_rgba(14,178,154,0.2)]"
                  : "text-[#8C999A] hover:text-[#F5FDFF] hover:bg-[#15282C]"
              )}
            >
              <Icon className={clsx("w-4 h-4 mb-0.5", isActive ? "text-[#0EB29A]" : "text-[#8C999A]")} />
              <span className="text-[9px] font-mono whitespace-nowrap uppercase tracking-tighter">
                {step.label.slice(0, 5)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

