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
    teal: "bg-[#0EB29A]/15 text-[#0EB29A] border-[#0EB29A]/40",
    lime: "bg-[#DDF0C2]/15 text-[#DDF0C2] border-[#DDF0C2]/40",
    danger: "bg-[#FF4444]/15 text-[#FF4444] border-[#FF4444]/40",
    safe: "bg-[#4ADE80]/15 text-[#4ADE80] border-[#4ADE80]/40",
    neutral: "bg-[#233A3D] text-[#8C999A] border-[#294044]",
    warning: "bg-[#F5C518]/15 text-[#F5C518] border-[#F5C518]/40",
  };

  const dotColors = {
    teal: "bg-[#0EB29A]",
    lime: "bg-[#DDF0C2]",
    danger: "bg-[#FF4444]",
    safe: "bg-[#4ADE80]",
    neutral: "bg-[#8C999A]",
    warning: "bg-[#F5C518]",
  };

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded-full border",
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

