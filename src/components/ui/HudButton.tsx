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
    "inline-flex items-center justify-center font-mono uppercase font-semibold tracking-wider transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const sizeStyles = {
    sm: "h-9 px-3 text-xs rounded-[8px]",
    md: "h-12 px-5 text-sm rounded-[12px]",
    lg: "h-14 px-6 text-sm rounded-[14px]",
  };

  const variantStyles = {
    primary:
      "bg-[#0EB29A] text-[#0D191C] hover:bg-[#12caa0] shadow-[0_0_15px_rgba(14,178,154,0.35)] font-bold",
    lime:
      "bg-[#DDF0C2] text-[#0D191C] hover:bg-[#eaffd4] shadow-[0_0_15px_rgba(221,240,194,0.3)] font-bold",
    secondary:
      "bg-[#233A3D] text-[#F5FDFF] border border-[#294044] hover:bg-[#2c474b] hover:border-[#3E5556]",
    danger:
      "bg-[#2D0A0A] text-[#FF4444] border border-[#FF4444]/60 hover:bg-[#3d0e0e]",
    ghost:
      "bg-transparent text-[#8C999A] hover:text-[#F5FDFF] hover:bg-[#15282C]",
    safe:
      "bg-[#0D2B1A] text-[#4ADE80] border border-[#4ADE80]/60 hover:bg-[#133d25] font-bold",
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

