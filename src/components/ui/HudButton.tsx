import React from "react";
import { Button } from "@astryxdesign/core/Button";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface HudButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "lime" | "safe";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ").trim();
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

export const HudButton: React.FC<HudButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  className,
  children,
  disabled,
  type = "button",
  title,
  onClick,
  ...rest
}) => {
  const astryxVariant: "primary" | "secondary" | "ghost" | "destructive" =
    variant === "primary" || variant === "lime"
      ? "primary"
      : variant === "danger"
      ? "destructive"
      : variant === "ghost"
      ? "ghost"
      : "secondary";

  const customAccentClass: Record<NonNullable<HudButtonProps["variant"]>, string> = {
    primary:
      "dark:bg-[#0EB29A] dark:text-[#0D191C] dark:hover:bg-[#12caa0] dark:shadow-[0_0_15px_rgba(14,178,154,0.3)]",
    lime:
      "bg-sky-600 text-white hover:bg-sky-700 dark:bg-[#DDF0C2] dark:text-[#0D191C] dark:hover:bg-[#eaffd4]",
    secondary:
      "dark:bg-[#233A3D] dark:text-[#F5FDFF] dark:border-[#294044] dark:hover:bg-[#2c474b]",
    danger:
      "dark:bg-[#2D0A0A] dark:text-[#FF4444] dark:border-[#FF4444]/60",
    ghost:
      "dark:text-[#8C999A] dark:hover:text-[#F5FDFF] dark:hover:bg-[#15282C]",
    safe:
      "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 dark:bg-[#0D2B1A] dark:text-[#4ADE80] dark:border-[#4ADE80]/60 font-bold",
  };

  const label = extractText(children) || "Action";
  const safeType: "button" | "submit" | "reset" =
    type === "submit" || type === "reset" ? type : "button";

  // Filter out HTMLAttributes omitted by Astryx BaseProps (title, color, etc.)
  const {
    color: _color,
    defaultChecked: _dc,
    defaultValue: _dv,
    ...baseProps
  } = rest;
  void _color;
  void _dc;
  void _dv;

  return (
    <Button
      variant={astryxVariant}
      size={size}
      type={safeType}
      label={label}
      tooltip={title}
      isLoading={isLoading}
      isDisabled={Boolean(disabled)}
      width={fullWidth ? "100%" : undefined}
      onClick={onClick}
      className={twMerge(
        clsx(
          "font-bold tracking-normal transition-all duration-200 active:scale-[0.98]",
          fullWidth && "w-full",
          customAccentClass[variant],
          className
        )
      )}
      {...(baseProps as Record<string, unknown>)}
    >
      {children}
    </Button>
  );
};
