"use client";

import React, { useEffect, useRef } from "react";
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
  Stethoscope,
  FileText,
} from "lucide-react";
import { clsx } from "clsx";

export const PIPELINE_STEPS = [
  { href: "/setup", label: "Ready", icon: Sliders },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/material", label: "Material", icon: Layers },
  { href: "/viewport", label: "Live AR", icon: Eye },
  { href: "/tuner", label: "Note", icon: Activity },
  { href: "/modes", label: "Shapes", icon: Grid3X3 },
  { href: "/safety", label: "Safety", icon: ShieldCheck },
  { href: "/stress", label: "Stress", icon: Flame },
  { href: "/defects", label: "Health", icon: Stethoscope },
  { href: "/export", label: "Report", icon: FileText },
];

export const HudNav: React.FC = () => {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname]);

  // Do not show on onboarding/auth screens
  if (pathname === "/language" || pathname === "/auth" || pathname === "/") {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#0D191C]/95 backdrop-blur-lg border-t border-slate-200 dark:border-[#294044] px-2 py-2 transition-colors duration-200">
      <div className="max-w-[440px] mx-auto flex items-center overflow-x-auto no-scrollbar gap-1.5 px-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = pathname === step.href;
          return (
            <Link
              key={step.href}
              href={step.href}
              ref={isActive ? activeRef : undefined}
              className={clsx(
                "flex flex-col items-center justify-center shrink-0 min-w-[62px] py-1.5 px-2 rounded-2xl transition-all duration-150 select-none",
                isActive
                  ? "bg-sky-50 text-sky-700 border border-sky-300 shadow-sm scale-105 dark:bg-[#1C332E] dark:text-[#0EB29A] dark:border-[#0EB29A]/40"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-[#8C999A] dark:hover:text-[#F5FDFF] dark:hover:bg-[#15282C]"
              )}
            >
              <Icon className={clsx("w-4 h-4 mb-0.5", isActive ? "text-sky-600 dark:text-[#0EB29A]" : "text-slate-400")} />
              <span className="text-[10px] font-semibold whitespace-nowrap leading-none">
                {idx + 1}. {step.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
