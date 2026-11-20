"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Cpu, ArrowRight } from "lucide-react";

const SPLASH_EVENT = "harmonix:replay-splash";
const SPLASH_SESSION_KEY = "harmonix_intro_played_v3";

/** Trigger the Harmonix startup logo animation on demand (e.g., for live presentations). */
export function triggerHarmonixSplash(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SPLASH_EVENT));
  }
}

interface HarmonixLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 30,
  md: 38,
  lg: 54,
  xl: 124,
};

/**
 * NVIDIA-Inspired Light-Theme HARMONIX Emblem:
 * - Features NVIDIA's signature split-field contrast: a crisp Titanium-White left field
 *   paired with an NVIDIA Volt-Green (#76B900 -> #0EB29A) right monolith block.
 * - Sweeping logarithmic spiral "Acoustic Eye" blades invert across the split boundary
 *   (Volt-Green spiral on the white field, Titanium-White spiral on the green block),
 *   converging into a precision geometric 'H' resonator pupil at the center.
 */
export const HarmonixLogo: React.FC<HarmonixLogoProps> = ({
  size = "md",
  animated = false,
  className = "",
}) => {
  const px = SIZE_MAP[size];
  const uid = React.useId().replace(/:/g, "");

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="Harmonix NVIDIA-Inspired Logo"
    >
      <defs>
        {/* NVIDIA Volt-Green -> Harmonix Emerald gradient for the split monolith & spiral */}
        <linearGradient id={`nv-green-${uid}`} x1="16" y1="12" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#76B900" />
          <stop offset="65%" stopColor="#58A600" />
          <stop offset="100%" stopColor="#0EB29A" />
        </linearGradient>

        {/* Crisp light-theme titanium card surface */}
        <linearGradient id={`nv-light-${uid}`} x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F5F9" />
        </linearGradient>

        {/* Clip paths for left (White Field) and right (NVIDIA Green Block) split-field inversion */}
        <clipPath id={`clip-left-${uid}`}>
          <rect x="6" y="6" width="52" height="108" rx="4" />
        </clipPath>
        <clipPath id={`clip-right-${uid}`}>
          <rect x="58" y="6" width="56" height="108" rx="22" />
        </clipPath>
      </defs>

      {/* Outer Light-Theme Precision Frame */}
      <rect
        x="4"
        y="4"
        width="112"
        height="112"
        rx="24"
        fill={`url(#nv-light-${uid})`}
        stroke="#CBD5E1"
        strokeWidth="2.2"
      />

      {/* Right-Half NVIDIA Volt-Green Split Monolith */}
      <path
        d="M58 6 H92 C104.15 6 114 15.85 114 28 V92 C114 104.15 104.15 114 92 114 H58 V6 Z"
        fill={`url(#nv-green-${uid})`}
      />

      {/* Left-Half (White Field): Volt-Green Logarithmic Eye Spiral & Acoustic Blades */}
      <g clipPath={`url(#clip-left-${uid})`}>
        {/* Outer sweeping eye-vortex arc */}
        <path
          d="M96 60 C84 26, 36 22, 16 56 C28 38, 66 36, 84 60 C68 78, 36 76, 22 58 C34 86, 76 88, 96 60 Z"
          fill={`url(#nv-green-${uid})`}
        />
        {/* Inner logarithmic spiral claw */}
        <path
          d="M84 60 C72 36, 36 38, 24 60 C34 48, 60 48, 72 60 C62 72, 38 70, 28 60"
          stroke={`url(#nv-green-${uid})`}
          strokeWidth="6.5"
          strokeLinecap="round"
          style={
            animated
              ? {
                  strokeDasharray: 220,
                  strokeDashoffset: 0,
                  animation: "nvSpiralDraw 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                }
              : undefined
          }
        />
        {/* Precision Dark-Graphite 'H' Left Pillar + Resonant Crossbar */}
        <path
          d="M42 41 V79 M42 60 H58"
          stroke="#0F172A"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
      </g>

      {/* Right-Half (Volt-Green Monolith): Inverted Titanium-White Eye Spiral & Acoustic Blades */}
      <g clipPath={`url(#clip-right-${uid})`}>
        {/* Outer sweeping white eye-vortex arc */}
        <path
          d="M20 60 C34 26, 84 22, 104 58 C90 38, 52 36, 34 60 C50 78, 84 76, 98 58 C86 88, 42 88, 20 60 Z"
          fill="#FFFFFF"
        />
        {/* Inner inverted white logarithmic spiral claw */}
        <path
          d="M34 60 C46 38, 82 38, 94 60 C84 48, 58 48, 46 60 C56 72, 80 70, 90 60"
          stroke="#FFFFFF"
          strokeWidth="6.5"
          strokeLinecap="round"
          style={
            animated
              ? {
                  strokeDasharray: 220,
                  strokeDashoffset: 0,
                  animation: "nvSpiralDraw 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                }
              : undefined
          }
        />
        {/* Precision White 'H' Right Pillar + Resonant Crossbar */}
        <path
          d="M74 41 V79 M58 60 H74"
          stroke="#FFFFFF"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
      </g>

      {/* Central Acoustic Core Iris Node */}
      <circle cx="58" cy="60" r="5.5" fill="#0F172A" stroke="#FFFFFF" strokeWidth="2.2" />
    </svg>
  );
};

/**
 * Full-Screen Light-Theme NVIDIA-Inspired Startup Animation:
 * - Pure Titanium-White & Alabaster studio backdrop (#FFFFFF -> #F4F9F0)
 * - Phase 1: The split-field NVIDIA Volt-Green monolith locks into place with a razor-sharp vertical seam.
 * - Phase 2: Counter-balanced logarithmic spiral eye blades sweep across the white/green split boundary,
 *   forging the central 'H' acoustic core and emitting two crisp Volt-Green harmonic shockwaves.
 * - Phase 3: High-contrast industrial typography reveal ("HARMONIX // ACCELERATED ACOUSTIC & NDT AI").
 */
export const HarmonixSplash: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [exiting, setExiting] = useState<boolean>(false);
  const [runKey, setRunKey] = useState<number>(0);

  const closeSplash = useCallback(() => {
    setExiting(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    }
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 360);
  }, []);

  const startSplash = useCallback(() => {
    setExiting(false);
    setRunKey((k) => k + 1);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const alreadyPlayed = window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
    if (!alreadyPlayed) {
      setVisible(true);
    }
    const onReplay = () => startSplash();
    window.addEventListener(SPLASH_EVENT, onReplay);
    return () => window.removeEventListener(SPLASH_EVENT, onReplay);
  }, [startSplash]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      closeSplash();
    }, 3000);
    return () => clearTimeout(timer);
  }, [visible, runKey, closeSplash]);

  if (!visible) return null;

  return (
    <div
      key={runKey}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-between p-6 bg-gradient-to-b from-white via-[#F8FBF6] to-[#EEF5E9] text-slate-900 select-none transition-opacity duration-350 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes nvMonolithSlide {
          0% { transform: translateX(36px) scaleX(0.7); opacity: 0; }
          100% { transform: translateX(0px) scaleX(1); opacity: 1; }
        }
        @keyframes nvSpiralSweep {
          0% { stroke-dashoffset: 240; transform: scale(0.84) rotate(-22deg); opacity: 0; }
          35% { opacity: 1; }
          100% { stroke-dashoffset: 0; transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes nvEyeBladeReveal {
          0% { transform: scale(0.68) rotate(-14deg); opacity: 0; }
          50% { transform: scale(1.04) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes nvCorePop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes nvShockwave {
          0% { transform: scale(0.76); opacity: 0.75; }
          100% { transform: scale(1.42); opacity: 0; }
        }
        @keyframes nvTextSlideUp {
          0% { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0px); opacity: 1; }
        }
        @keyframes nvBarProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>

      {/* Subtle architectural micro-grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(118,185,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(118,185,0,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Top Light-Theme Studio Bar */}
      <div className="relative z-10 w-full max-w-[420px] flex items-center justify-between text-[11px] font-mono">
        <span className="flex items-center gap-1.5 text-[#58A600] font-extrabold tracking-wider">
          <Cpu className="w-3.5 h-3.5 text-[#76B900]" />
          HARMONIX // ACCELERATED AI
        </span>
        <button
          type="button"
          onClick={closeSplash}
          className="px-3.5 py-1 rounded-full bg-slate-900/5 hover:bg-slate-900/10 border border-slate-300 text-slate-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
        >
          <span>Skip</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Center Animated NVIDIA-Inspired Split-Field Spiral Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        {/* Soft NVIDIA Volt-Green radial studio glow */}
        <div
          className="absolute w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(118,185,0,0.24) 0%, rgba(14,178,154,0.12) 52%, transparent 75%)",
          }}
        />

        <div className="relative w-44 h-44 flex items-center justify-center">
          {/* Expanding Volt-Green ultrasonic pulse ring */}
          <div
            className="absolute inset-3 rounded-[34px] border-2 border-[#76B900]/55 pointer-events-none"
            style={{ animation: "nvShockwave 1.6s cubic-bezier(0.16, 1, 0.3, 1) 0.45s infinite" }}
          />

          <svg
            width="156"
            height="156"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative z-10 drop-shadow-[0_18px_38px_rgba(118,185,0,0.22)]"
          >
            <defs>
              <linearGradient id="splash-nv-green" x1="16" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#76B900" />
                <stop offset="65%" stopColor="#58A600" />
                <stop offset="100%" stopColor="#0EB29A" />
              </linearGradient>
              <clipPath id="splash-clip-left">
                <rect x="6" y="6" width="52" height="108" rx="4" />
              </clipPath>
              <clipPath id="splash-clip-right">
                <rect x="58" y="6" width="56" height="108" rx="22" />
              </clipPath>
            </defs>

            {/* Pure Titanium-White Studio Squircle Base */}
            <rect
              x="4"
              y="4"
              width="112"
              height="112"
              rx="24"
              fill="#FFFFFF"
              stroke="#CBD5E1"
              strokeWidth="2.2"
            />

            {/* Right-Half NVIDIA Volt-Green Split Monolith (slides & locks in) */}
            <path
              d="M58 6 H92 C104.15 6 114 15.85 114 28 V92 C114 104.15 104.15 114 92 114 H58 V6 Z"
              fill="url(#splash-nv-green)"
              style={{
                transformOrigin: "86px 60px",
                animation: "nvMonolithSlide 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            />

            {/* Left Half (White Field): Volt-Green Logarithmic Eye Spiral & Acoustic Vortex */}
            <g clipPath="url(#splash-clip-left)">
              <path
                d="M96 60 C84 26, 36 22, 16 56 C28 38, 66 36, 84 60 C68 78, 36 76, 22 58 C34 86, 76 88, 96 60 Z"
                fill="url(#splash-nv-green)"
                style={{
                  transformOrigin: "58px 60px",
                  animation: "nvEyeBladeReveal 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both",
                }}
              />
              <path
                d="M84 60 C72 36, 36 38, 24 60 C34 48, 60 48, 72 60 C62 72, 38 70, 28 60"
                stroke="url(#splash-nv-green)"
                strokeWidth="6.5"
                strokeLinecap="round"
                style={{
                  transformOrigin: "58px 60px",
                  strokeDasharray: 240,
                  strokeDashoffset: 240,
                  animation: "nvSpiralSweep 1.15s cubic-bezier(0.16, 1, 0.3, 1) 0.35s forwards",
                }}
              />
              <path
                d="M42 41 V79 M42 60 H58"
                stroke="#0F172A"
                strokeWidth="6.5"
                strokeLinecap="round"
                style={{
                  transformOrigin: "50px 60px",
                  animation: "nvCorePop 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.65s both",
                }}
              />
            </g>

            {/* Right Half (Volt-Green Monolith): Inverted White Eye Spiral & Acoustic Vortex */}
            <g clipPath="url(#splash-clip-right)">
              <path
                d="M20 60 C34 26, 84 22, 104 58 C90 38, 52 36, 34 60 C50 78, 84 76, 98 58 C86 88, 42 88, 20 60 Z"
                fill="#FFFFFF"
                style={{
                  transformOrigin: "58px 60px",
                  animation: "nvEyeBladeReveal 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both",
                }}
              />
              <path
                d="M34 60 C46 38, 82 38, 94 60 C84 48, 58 48, 46 60 C56 72, 80 70, 90 60"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                style={{
                  transformOrigin: "58px 60px",
                  strokeDasharray: 240,
                  strokeDashoffset: 240,
                  animation: "nvSpiralSweep 1.15s cubic-bezier(0.16, 1, 0.3, 1) 0.42s forwards",
                }}
              />
              <path
                d="M74 41 V79 M58 60 H74"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                style={{
                  transformOrigin: "66px 60px",
                  animation: "nvCorePop 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.72s both",
                }}
              />
            </g>

            {/* Central Acoustic Eye Iris Node */}
            <circle
              cx="58"
              cy="60"
              r="5.8"
              fill="#0F172A"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              style={{
                transformOrigin: "58px 60px",
                animation: "nvCorePop 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both",
              }}
            />
          </svg>
        </div>

        {/* High-Contrast Light-Theme NVIDIA-Style Typography Reveal */}
        <div
          className="mt-6 text-center space-y-2"
          style={{
            opacity: 0,
            animation: "nvTextSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.75s forwards",
          }}
        >
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-3xl font-black tracking-[0.16em] text-slate-900">
              HARMONIX
            </span>
            <span className="text-[11px] font-mono font-extrabold px-2.5 py-0.5 rounded bg-[#76B900] text-white shadow-sm">
              AR // AI
            </span>
          </div>

          {/* Crisp NVIDIA Volt-Green split accent bar */}
          <div className="flex items-center justify-center gap-1 pt-0.5">
            <span className="w-10 h-1 rounded-l-full bg-slate-900" />
            <span className="w-14 h-1 rounded-r-full bg-gradient-to-r from-[#76B900] to-[#0EB29A]" />
          </div>

          <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-slate-600 uppercase pt-1">
            Accelerated Acoustic &amp; Chladni NDT
          </p>
        </div>
      </div>

      {/* Bottom Light-Theme Volt-Green Progress Bar */}
      <div className="relative z-10 w-full max-w-[260px] space-y-2 pb-2">
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden border border-slate-300/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#76B900] via-[#58A600] to-[#0EB29A]"
            style={{ animation: "nvBarProgress 2.8s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
          />
        </div>
        <div className="text-center text-[10px] font-mono font-bold text-slate-500 tracking-wider">
          LOADING WEBGPU &amp; ACOUSTIC ENGINE…
        </div>
      </div>
    </div>
  );
};
