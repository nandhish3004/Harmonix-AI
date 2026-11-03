import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface ChamferedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "active" | "danger" | "safe" | "subtle";
  cornerChamfer?: boolean;
  children: React.ReactNode;
}

export const ChamferedCard: React.FC<ChamferedCardProps> = ({
  variant = "default",
  cornerChamfer = false,
  className,
  children,
  ...props
}) => {
  const variantStyles = {
    default: "bg-[#15282C] border-[#294044] text-[#F5FDFF]",
    active: "bg-[#1C332E] border-[#0EB29A] text-[#F5FDFF] shadow-hud",
    danger: "bg-[#2D0A0A] border-[#FF4444]/60 text-[#FF8888]",
    safe: "bg-[#0D2B1A] border-[#4ADE80]/60 text-[#DDF0C2]",
    subtle: "bg-[#101F23] border-[#233A3D] text-[#8C999A]",
  };

  const chamferClass = cornerChamfer
    ? "clip-chamfer border"
    : "rounded-[16px] border";

  return (
    <div
      className={twMerge(
        clsx(
          "relative transition-all duration-200 backdrop-blur-md",
          variantStyles[variant],
          chamferClass,
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};

