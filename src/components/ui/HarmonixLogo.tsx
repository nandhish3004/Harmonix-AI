"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

const SPLASH_EVENT = "harmonix:replay-splash";
const SPLASH_SESSION_KEY = "harmonix_intro_played_v2";

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
  sm: 28,
  md: 36,
  lg: 52,
  xl: 116,
};

/**
 * Unique HARMONIX Emblem:
 * - Inspired by Pinterest's continuous calligraphic monoline loop badge
 *   and Google's 4-color harmonic wave nodes (#38BDF8 Cyan, #E60023/#F43F5E Coral-Red,
 *   #FACC15 Amber-Gold, #0EB29A Emerald-Teal) fused with a 4-petal Chladni nodal rose.
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
      aria-label="Harmonix Logo"
    >
      <defs>
        {/* Sculpted dark obsidian-teal studio squircle background */}
        <linearGradient id={`bg-${uid}`} x1="10" y1="8" x2="112" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F2026" />
          <stop offset="55%" stopColor="#0A1418" />
          <stop offset="100%" stopColor="#132A30" />
        </linearGradient>

        {/* Google x Pinterest 4-tone harmonic ribbon gradient */}
        <linearGradient id={`ribbon-${uid}`} x1="18" y1="22" x2="102" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="34%" stopColor="#FACC15" />
          <stop offset="68%" stopColor="#0EB29A" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>

        {/* Subtle nodal petal glow gradient */}
        <linearGradient id={`rose-${uid}`} x1="24" y1="24" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#0EB29A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Outer sculpted squircle badge */}
      <rect
        x="4"
        y="4"
        width="112"
        height="112"
        rx="30"
        fill={`url(#bg-${uid})`}
        stroke={`url(#ribbon-${uid})`}
        strokeWidth="2.8"
      />

      {/* Fine Chladni resonant ring */}
      <circle
        cx="60"
        cy="60"
        r="43"
        stroke="rgba(255,255,255,0.09)"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />

      {/* 4-Petal Chladni Standing-Wave Nodal Rose */}
      <path
        d="M60 19 C73 39, 81 47, 101 60 C81 73, 73 81, 60 101 C47 81, 39 73, 19 60 C39 47, 47 39, 60 19 Z"
        stroke={`url(#rose-${uid})`}
        strokeWidth="1.8"
        fill="rgba(14, 178, 154, 0.05)"
      />

      {/* Pinterest-inspired Continuous Monoline Calligraphic 'H' + Standing Wave Bridge */}
      <path
        d="M44 37 C34 26, 23 36, 33 48 C37 52, 37 58, 37 89 M37 31 L37 89 M37 61 C47 46, 54 46, 60 60 C66 74, 73 74, 83 59 M83 31 L83 89 C83 96, 94 92, 92 82"
        stroke={`url(#ribbon-${uid})`}
        strokeWidth="7.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          animated
            ? {
                strokeDasharray: 340,
                strokeDashoffset: 0,
                animation: "harmonixRibbonDraw 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards",
              }
            : undefined
        }
      />

      {/* 4 Google-inspired Harmonic Antinode Dots (Blue, Coral-Red, Amber-Gold, Emerald) */}
      <circle cx="60" cy="24" r="4.6" fill="#38BDF8" />
      <circle cx="96" cy="60" r="4.6" fill="#F43F5E" />
      <circle cx="60" cy="96" r="4.6" fill="#FACC15" />
      <circle cx="24" cy="60" r="4.6" fill="#0EB29A" />
    </svg>
  );
};

/**
 * Full-Screen Startup Logo Animation:
 * Phase 1: 4 Google-inspired harmonic dots oscillate in a standing wave, then converge into the 4 Chladni antinodes.
 * Phase 2: Pinterest-inspired continuous monoline ribbon draws the sculptural H + Chladni nodal rose.
 * Phase 3: Kinetic brand typography reveal ("HARMONIX // ACOUSTIC CHLADNI & NDT STUDIO") -> smooth dissolve into app.
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
    }, 380);
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
    }, 3100);
    return () => clearTimeout(timer);
  }, [visible, runKey, closeSplash]);

  if (!visible) return null;

  return (
    <div
      key={runKey}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-between p-6 bg-[#071114] text-white select-none transition-opacity duration-350 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes harmonixRibbonDraw {
          0% { stroke-dashoffset: 340; opacity: 0.2; }
          25% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes harmonixRoseDraw {
          0% { stroke-dashoffset: 260; transform: scale(0.78) rotate(-18deg); opacity: 0; }
          40% { opacity: 1; }
          100% { stroke-dashoffset: 0; transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes harmonixRingPulse {
          0% { transform: scale(0.72); opacity: 0; }
          45% { opacity: 0.55; }
          100% { transform: scale(1.38); opacity: 0; }
        }
        @keyframes harmonixBadgePop {
          0% { transform: scale(0.82); opacity: 0; }
          45% { transform: scale(1.03); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes harmonixDotTop {
          0% { transform: translate(-27px, 36px) scale(1.25); }
          30% { transform: translate(-27px, 22px) scale(1.1); }
          55% { transform: translate(-27px, 44px) scale(1.1); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes harmonixDotRight {
          0% { transform: translate(-45px, 0px) scale(1.25); }
          30% { transform: translate(-45px, 14px) scale(1.1); }
          55% { transform: translate(-45px, -12px) scale(1.1); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes harmonixDotBottom {
          0% { transform: translate(9px, -36px) scale(1.25); }
          30% { transform: translate(9px, -50px) scale(1.1); }
          55% { transform: translate(9px, -24px) scale(1.1); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes harmonixDotLeft {
          0% { transform: translate(63px, 0px) scale(1.25); }
          30% { transform: translate(63px, -14px) scale(1.1); }
          55% { transform: translate(63px, 12px) scale(1.1); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes harmonixTextRise {
          0% { transform: translateY(14px); opacity: 0; }
          100% { transform: translateY(0px); opacity: 1; }
        }
        @keyframes harmonixBarSweep {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>

      {/* Top studio header bar */}
      <div className="w-full max-w-[420px] flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-[#0EB29A] font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          HARMONIX STUDIO
        </span>
        <button
          type="button"
          onClick={closeSplash}
          className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
        >
          <span>Skip</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Center Animated Emblem Stage */}
      <div className="relative flex flex-col items-center justify-center my-auto">
        {/* Ambient multi-color studio aura */}
        <div
          className="absolute w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-45"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.35) 0%, rgba(244,63,94,0.25) 45%, rgba(14,178,154,0.2) 75%, transparent 100%)",
          }}
        />

        {/* Animated SVG Masterpiece */}
        <div
          className="relative w-40 h-40 flex items-center justify-center"
          style={{ animation: "harmonixBadgePop 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          {/* Expanding Chladni acoustic resonance wave ring */}
          <div
            className="absolute inset-2 rounded-[38px] border-2 border-[#0EB29A]/50 pointer-events-none"
            style={{ animation: "harmonixRingPulse 1.8s ease-out 0.55s infinite" }}
          />

          <svg
            width="148"
            height="148"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative z-10 drop-shadow-[0_16px_36px_rgba(14,178,154,0.28)]"
          >
            <defs>
              <linearGradient id="splash-bg" x1="10" y1="8" x2="112" y2="114" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#102329" />
                <stop offset="55%" stopColor="#0A1418" />
                <stop offset="100%" stopColor="#152F36" />
              </linearGradient>
              <linearGradient id="splash-ribbon" x1="18" y1="22" x2="102" y2="98" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F43F5E" />
                <stop offset="34%" stopColor="#FACC15" />
                <stop offset="68%" stopColor="#0EB29A" />
                <stop offset="100%" stopColor="#38BDF8" />
              </linearGradient>
              <linearGradient id="splash-rose" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#0EB29A" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.7" />
              </linearGradient>
            </defs>

            {/* Sculpted Squircle Frame */}
            <rect
              x="4"
              y="4"
              width="112"
              height="112"
              rx="30"
              fill="url(#splash-bg)"
              stroke="url(#splash-ribbon)"
              strokeWidth="2.8"
            />

            {/* Architectural Compass Ring */}
            <circle
              cx="60"
              cy="60"
              r="43"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />

            {/* 4-Petal Chladni Nodal Rose (draws in & rotates into place) */}
            <path
              d="M60 19 C73 39, 81 47, 101 60 C81 73, 73 81, 60 101 C47 81, 39 73, 19 60 C39 47, 47 39, 60 19 Z"
              stroke="url(#splash-rose)"
              strokeWidth="2"
              fill="rgba(14, 178, 154, 0.06)"
              style={{
                transformOrigin: "60px 60px",
                strokeDasharray: 260,
                strokeDashoffset: 260,
                animation: "harmonixRoseDraw 1.25s cubic-bezier(0.22, 1, 0.36, 1) 0.35s forwards",
              }}
            />

            {/* Pinterest-Inspired Continuous Monoline Calligraphic 'H' + Standing Wave Bridge */}
            <path
              d="M44 37 C34 26, 23 36, 33 48 C37 52, 37 58, 37 89 M37 31 L37 89 M37 61 C47 46, 54 46, 60 60 C66 74, 73 74, 83 59 M83 31 L83 89 C83 96, 94 92, 92 82"
              stroke="url(#splash-ribbon)"
              strokeWidth="7.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 340,
                strokeDashoffset: 340,
                animation: "harmonixRibbonDraw 1.45s cubic-bezier(0.22, 1, 0.36, 1) 0.55s forwards",
              }}
            />

            {/* Google-Inspired 4 Harmonic Dots that oscillate in a line then lock into the 4 Chladni Antinodes */}
            <circle
              cx="60"
              cy="24"
              r="5.2"
              fill="#38BDF8"
              style={{ animation: "harmonixDotTop 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            />
            <circle
              cx="96"
              cy="60"
              r="5.2"
              fill="#F43F5E"
              style={{ animation: "harmonixDotRight 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            />
            <circle
              cx="60"
              cy="96"
              r="5.2"
              fill="#FACC15"
              style={{ animation: "harmonixDotBottom 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            />
            <circle
              cx="24"
              cy="60"
              r="5.2"
              fill="#0EB29A"
              style={{ animation: "harmonixDotLeft 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            />
          </svg>
        </div>

        {/* Kinetic Brand Typography Reveal */}
        <div
          className="mt-6 text-center space-y-2"
          style={{
            opacity: 0,
            animation: "harmonixTextRise 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.85s forwards",
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-black tracking-[0.14em] bg-gradient-to-r from-white via-[#DDF0C2] to-[#38BDF8] bg-clip-text text-transparent">
              HARMONIX
            </span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#0EB29A]/20 border border-[#0EB29A]/50 text-[#4ADE80]">
              AR
            </span>
          </div>

          {/* 4-Color Google-inspired harmonic divider bar */}
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <span className="w-5 h-1 rounded-full bg-[#38BDF8]" />
            <span className="w-5 h-1 rounded-full bg-[#F43F5E]" />
            <span className="w-5 h-1 rounded-full bg-[#FACC15]" />
            <span className="w-5 h-1 rounded-full bg-[#0EB29A]" />
          </div>

          <p className="text-[11px] font-mono tracking-[0.22em] text-slate-400 uppercase pt-1">
            Acoustic Chladni &amp; Non-Destructive AI
          </p>
        </div>
      </div>

      {/* Bottom smooth progress bar */}
      <div className="w-full max-w-[260px] space-y-2 pb-2">
        <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F43F5E] via-[#FACC15] to-[#0EB29A]"
            style={{ animation: "harmonixBarSweep 2.9s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
          />
        </div>
        <div className="text-center text-[10px] font-mono text-slate-400 tracking-wider">
          INITIALIZING CYMATIC &amp; CV ENGINE…
        </div>
      </div>
    </div>
  );
};
