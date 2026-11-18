import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface HudButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "lime" | "safe";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

export const HudButton: React.FC<HudButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-bold tracking-normal transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const sizeStyles = {
    sm: "h-9 px-3 text-xs rounded-full",
    md: "h-12 px-5 text-sm rounded-2xl",
    lg: "h-14 px-6 text-base rounded-2xl",
  };

  const variantStyles = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-800 shadow-sm border border-slate-900 dark:border-transparent dark:bg-[#0EB29A] dark:text-[#0D191C] dark:hover:bg-[#12caa0] dark:shadow-[0_0_15px_rgba(14,178,154,0.35)]",
    lime:
      "bg-sky-600 text-white hover:bg-sky-700 shadow-sm dark:bg-[#DDF0C2] dark:text-[#0D191C] dark:hover:bg-[#eaffd4] dark:shadow-[0_0_15px_rgba(221,240,194,0.3)]",
    secondary:
      "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm dark:bg-[#233A3D] dark:text-[#F5FDFF] dark:border-[#294044] dark:hover:bg-[#2c474b] dark:hover:border-[#3E5556]",
    danger:
      "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-[#2D0A0A] dark:text-[#FF4444] dark:border-[#FF4444]/60 dark:hover:bg-[#3d0e0e]",
    ghost:
      "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#8C999A] dark:hover:text-[#F5FDFF] dark:hover:bg-[#15282C]",
    safe:
      "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 dark:bg-[#0D2B1A] dark:text-[#4ADE80] dark:border-[#4ADE80]/60 dark:hover:bg-[#133d25] font-bold",
  };

  return (
    <button
      className={twMerge(
        clsx(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          fullWidth && "w-full",
          className
        )
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center space-x-2">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>PROCESSING...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
