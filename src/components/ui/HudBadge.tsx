import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface HudBadgeProps {
  variant?: "teal" | "lime" | "danger" | "safe" | "neutral" | "warning";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const HudBadge: React.FC<HudBadgeProps> = ({
  variant = "teal",
  children,
  className,
  dot = false,
}) => {
  const variantStyles = {
    teal: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-[#0EB29A]/15 dark:text-[#0EB29A] dark:border-[#0EB29A]/40",
    lime: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-[#DDF0C2]/15 dark:text-[#DDF0C2] dark:border-[#DDF0C2]/40",
    danger: "bg-red-50 text-red-700 border-red-200 dark:bg-[#FF4444]/15 dark:text-[#FF4444] dark:border-[#FF4444]/40",
    safe: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#4ADE80]/15 dark:text-[#4ADE80] dark:border-[#4ADE80]/40",
    neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#233A3D] dark:text-[#8C999A] dark:border-[#294044]",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-[#F5C518]/15 dark:text-[#F5C518] dark:border-[#F5C518]/40",
  };

  const dotColors = {
    teal: "bg-sky-600 dark:bg-[#0EB29A]",
    lime: "bg-indigo-600 dark:bg-[#DDF0C2]",
    danger: "bg-red-600 dark:bg-[#FF4444]",
    safe: "bg-emerald-600 dark:bg-[#4ADE80]",
    neutral: "bg-slate-500 dark:bg-[#8C999A]",
    warning: "bg-amber-500 dark:bg-[#F5C518]",
  };

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded-full border shadow-xs transition-colors",
          variantStyles[variant],
          className
        )
      )}
    >
      {dot && (
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full animate-pulse",
            dotColors[variant]
          )}
        />
      )}
      {children}
    </span>
  );
};
