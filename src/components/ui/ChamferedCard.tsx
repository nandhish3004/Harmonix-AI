import React from "react";
import { Card } from "@astryxdesign/core/Card";
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
  const astryxVariant: "default" | "muted" | "teal" | "red" | "green" =
    variant === "active"
      ? "teal"
      : variant === "danger"
      ? "red"
      : variant === "safe"
      ? "green"
      : variant === "subtle"
      ? "muted"
      : "default";

  const variantStyles = {
    default:
      "bg-white border-slate-200 text-slate-900 dark:bg-[#15282C] dark:border-[#294044] dark:text-[#F5FDFF]",
    active:
      "bg-sky-50/85 border-sky-500 border-2 text-slate-900 dark:bg-[#1C332E] dark:border-[#0EB29A] dark:text-[#F5FDFF]",
    danger:
      "bg-red-50/90 border-red-200 text-red-800 dark:bg-[#2D0A0A] dark:border-[#FF4444]/60 dark:text-[#FF8888]",
    safe:
      "bg-emerald-50/90 border-emerald-200 text-emerald-900 dark:bg-[#0D2B1A] dark:border-[#4ADE80]/60 dark:text-[#DDF0C2]",
    subtle:
      "bg-slate-50 border-slate-200 text-slate-600 dark:bg-[#101F23] dark:border-[#233A3D] dark:text-[#8C999A]",
  };

  const chamferClass = cornerChamfer
    ? "clip-chamfer border"
    : "rounded-3xl border";

  const {
    title: _title,
    color: _color,
    defaultChecked: _dc,
    defaultValue: _dv,
    ...baseProps
  } = props;
  void _title;
  void _color;
  void _dc;
  void _dv;

  return (
    <Card
      variant={astryxVariant}
      elevation={variant === "subtle" ? "none" : "low"}
      padding={0}
      className={twMerge(
        clsx(
          "relative transition-all duration-200 backdrop-blur-md",
          variantStyles[variant],
          chamferClass,
          className
        )
      )}
      {...(baseProps as Record<string, unknown>)}
    >
      {children}
    </Card>
  );
};
