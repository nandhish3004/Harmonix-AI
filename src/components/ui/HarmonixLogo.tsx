"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ArrowRight } from "lucide-react";

const SPLASH_EVENT = "harmonix:replay-splash";
const SPLASH_SESSION_KEY = "harmonix_intro_played_v4";

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
  xl: 132,
};

/**
 * C1-Continuous Tapered Logarithmic Eye-Spiral & Split-Field 'H' Core Geometry:
 * Every curve crossing the split seam (x = 54) shares exact y-intercepts and horizontal tangents (dy/dx = 0)
 * so the Volt-Green ribbon on the left Titanium-White field and the negative-space White ribbon
 * on the right NVIDIA Volt-Green monolith join with razor-sharp mathematical continuity.
 */
const OUTER_EYE_CRESCENT =
  "M 54 19 C 29 19, 13 37, 13 60 C 13 83, 29 101, 54 101 C 76 101, 95 85, 105 60 C 96 42, 78 33, 54 33 L 54 41 C 73 41, 88 48, 95 60 C 86 79, 71 92, 54 92 C 34 92, 22 78, 22 60 C 22 42, 34 28, 54 28 Z";

const INNER_VORTEX_CRESCENT =
  "M 54 33 C 37 33, 26 44, 26 60 C 26 76, 37 87, 54 87 C 68 87, 81 77, 88 60 C 81 42, 69 22, 54 19 L 54 28 C 65 30, 74 45, 79 60 C 73 72, 64 79, 54 79 C 42 79, 34 71, 34 60 C 34 49, 42 41, 54 41 Z";

/**
 * Professional NVIDIA-Inspired Light-Theme HARMONIX Emblem:
 * - Split-field architectural composition: pure porcelain-white left half (#FFFFFF)
 *   and precision NVIDIA Volt-Green right monolith (#76B900 -> #539600).
 * - Mathematically C1-continuous logarithmic eye-spiral ribbons invert cleanly across x = 54,
 *   framing a negative-space split-field 'H' resonator at the pupil.
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
        {/* NVIDIA Enterprise Volt-Green Gradient */}
        <linearGradient id={`nv-emerald-${uid}`} x1="54" y1="8" x2="112" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7CC200" />
          <stop offset="55%" stopColor="#68A800" />
          <stop offset="100%" stopColor="#4B8500" />
        </linearGradient>

        {/* Left Field (Titanium White) vs Right Monolith (Volt-Green) Exact Split Clips at x = 54 */}
        <clipPath id={`left-field-${uid}`}>
          <rect x="5" y="5" width="49" height="110" />
        </clipPath>
        <clipPath id={`right-field-${uid}`}>
          <rect x="54" y="5" width="61" height="110" />
        </clipPath>
      </defs>

      {/* Porcelain-White Precision Squircle Base */}
      <rect
        x="4"
        y="4"
        width="112"
        height="112"
        rx="26"
        fill="#FFFFFF"
        stroke="#E2E8F0"
        strokeWidth="2"
      />

      {/* Right-Half NVIDIA Volt-Green Split Monolith */}
      <path
        d="M 54 5 H 90 C 103.807 5 115 16.193 115 30 V 90 C 115 103.807 103.807 115 90 115 H 54 V 5 Z"
        fill={`url(#nv-emerald-${uid})`}
      />

      {/* Left Field (Porcelain White): Volt-Green Logarithmic Spiral Ribbons + Obsidian Left 'H' Stem */}
      <g
        clipPath={`url(#left-field-${uid})`}
        style={
          animated
            ? {
                transformOrigin: "54px 60px",
                animation: "harmonixSpiralIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }
            : undefined
        }
      >
        <path d={OUTER_EYE_CRESCENT} fill={`url(#nv-emerald-${uid})`} />
        <path d={INNER_VORTEX_CRESCENT} fill={`url(#nv-emerald-${uid})`} />
        {/* Architectural Left 'H' Stem + Half Crossbar */}
        <rect x="43" y="47" width="5.5" height="26" rx="2.75" fill="#0F172A" />
        <rect x="45" y="57.25" width="9" height="5.5" fill="#0F172A" />
      </g>

      {/* Right Field (Volt-Green Monolith): Negative-Space Pure White Spiral Ribbons + White Right 'H' Stem */}
      <g
        clipPath={`url(#right-field-${uid})`}
        style={
          animated
            ? {
                transformOrigin: "54px 60px",
                animation: "harmonixSpiralIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }
            : undefined
        }
      >
        <path d={OUTER_EYE_CRESCENT} fill="#FFFFFF" />
        <path d={INNER_VORTEX_CRESCENT} fill="#FFFFFF" />
        {/* Architectural Right 'H' Stem + Half Crossbar */}
        <rect x="59.5" y="47" width="5.5" height="26" rx="2.75" fill="#FFFFFF" />
        <rect x="54" y="57.25" width="9" height="5.5" fill="#FFFFFF" />
      </g>

      {/* Subtle Outer Specular Border */}
      <rect
        x="4"
        y="4"
        width="112"
        height="112"
        rx="26"
        stroke="rgba(15, 23, 42, 0.08)"
        strokeWidth="1.5"
      />
    </svg>
  );
};

/**
 * Keynote-Grade Light-Theme Startup Splash Animation:
 * - Warm Porcelain-White Studio Backdrop (#FAFBF9 -> #F1F5EE)
 * - Smooth 3-stage reveal:
 *   1. Precision porcelain badge & NVIDIA Volt-Green split monolith lock into place.
 *   2. C1-continuous logarithmic eye-spiral ribbons and the central split-field 'H' core unfold with a specular sheen.
 *   3. Swiss-industrial wide-tracked typography ("HARMONIX // ACOUSTIC RESONANCE & NDT INTELLIGENCE") rises cleanly.
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
    }, 2900);
    return () => clearTimeout(timer);
  }, [visible, runKey, closeSplash]);

  if (!visible) return null;

  return (
    <div
      key={runKey}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-between p-6 bg-gradient-to-b from-[#FFFFFF] via-[#F9FBF7] to-[#F0F5EC] text-slate-900 select-none transition-opacity duration-350 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes harmonixCardElevate {
          0% { transform: translateY(10px) scale(0.94); opacity: 0; }
          100% { transform: translateY(0px) scale(1); opacity: 1; }
        }
        @keyframes harmonixMonolithReveal {
          0% { transform: translateX(28px); opacity: 0; }
          100% { transform: translateX(0px); opacity: 1; }
        }
        @keyframes harmonixSpiralUnfold {
          0% { transform: scale(0.74) rotate(-18deg); opacity: 0; }
          60% { transform: scale(1.02) rotate(1.5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes harmonixCoreLock {
          0% { transform: scaleY(0.2); opacity: 0; }
          100% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes harmonixRingExpand {
          0% { transform: scale(0.88); opacity: 0.55; }
          100% { transform: scale(1.36); opacity: 0; }
        }
        @keyframes harmonixTitleReveal {
          0% { transform: translateY(12px); opacity: 0; }
          100% { transform: translateY(0px); opacity: 1; }
        }
        @keyframes harmonixProgressFill {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>

      {/* Top Minimalist Keynote Bar */}
      <div className="relative z-10 w-full max-w-[420px] flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#76B900]" />
          <span className="text-slate-500 font-semibold tracking-[0.18em]">
            HARMONIX // ENTERPRISE
          </span>
        </div>
        <button
          type="button"
          onClick={closeSplash}
          className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 shadow-xs text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-all"
        >
          <span>Skip</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Center Emblem Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        {/* Soft ambient NVIDIA-green studio halo */}
        <div
          className="absolute w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(118,185,0,0.16) 0%, rgba(15,23,42,0.03) 55%, transparent 75%)",
          }}
        />

        {/* Elevated Satin Emblem Pedestal */}
        <div
          className="relative w-40 h-40 flex items-center justify-center"
          style={{
            animation: "harmonixCardElevate 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          {/* Single refined acoustic wave pulse ring */}
          <div
            className="absolute inset-1 rounded-[36px] border border-[#76B900]/40 pointer-events-none"
            style={{
              animation: "harmonixRingExpand 1.9s cubic-bezier(0.16, 1, 0.3, 1) 0.55s infinite",
            }}
          />

          <svg
            width="144"
            height="144"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative z-10 drop-shadow-[0_22px_44px_rgba(15,23,42,0.11)]"
          >
            <defs>
              <linearGradient id="splash-nv-emerald" x1="54" y1="8" x2="112" y2="112" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7CC200" />
                <stop offset="55%" stopColor="#68A800" />
                <stop offset="100%" stopColor="#4B8500" />
              </linearGradient>
              <clipPath id="splash-left-field">
                <rect x="5" y="5" width="49" height="110" />
              </clipPath>
              <clipPath id="splash-right-field">
                <rect x="54" y="5" width="61" height="110" />
              </clipPath>
            </defs>

            {/* Porcelain-White Precision Squircle Base */}
            <rect
              x="4"
              y="4"
              width="112"
              height="112"
              rx="26"
              fill="#FFFFFF"
              stroke="#E2E8F0"
              strokeWidth="2"
            />

            {/* Right-Half NVIDIA Volt-Green Split Monolith */}
            <g clipPath="url(#splash-right-field)">
              <path
                d="M 54 5 H 90 C 103.807 5 115 16.193 115 30 V 90 C 115 103.807 103.807 115 90 115 H 54 V 5 Z"
                fill="url(#splash-nv-emerald)"
                style={{
                  animation: "harmonixMonolithReveal 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                }}
              />
            </g>

            {/* Left Field (Porcelain White): Volt-Green Logarithmic Spiral Ribbons + Obsidian Left 'H' Stem */}
            <g clipPath="url(#splash-left-field)">
              <g
                style={{
                  transformOrigin: "54px 60px",
                  animation: "harmonixSpiralUnfold 0.95s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both",
                }}
              >
                <path d={OUTER_EYE_CRESCENT} fill="url(#splash-nv-emerald)" />
                <path d={INNER_VORTEX_CRESCENT} fill="url(#splash-nv-emerald)" />
              </g>
              <g
                style={{
                  transformOrigin: "54px 60px",
                  animation: "harmonixCoreLock 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.52s both",
                }}
              >
                <rect x="43" y="47" width="5.5" height="26" rx="2.75" fill="#0F172A" />
                <rect x="45" y="57.25" width="9" height="5.5" fill="#0F172A" />
              </g>
            </g>

            {/* Right Field (Volt-Green Monolith): Negative-Space Pure White Spiral Ribbons + White Right 'H' Stem */}
            <g clipPath="url(#splash-right-field)">
              <g
                style={{
                  transformOrigin: "54px 60px",
                  animation: "harmonixSpiralUnfold 0.95s cubic-bezier(0.16, 1, 0.3, 1) 0.24s both",
                }}
              >
                <path d={OUTER_EYE_CRESCENT} fill="#FFFFFF" />
                <path d={INNER_VORTEX_CRESCENT} fill="#FFFFFF" />
              </g>
              <g
                style={{
                  transformOrigin: "54px 60px",
                  animation: "harmonixCoreLock 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.56s both",
                }}
              >
                <rect x="59.5" y="47" width="5.5" height="26" rx="2.75" fill="#FFFFFF" />
                <rect x="54" y="57.25" width="9" height="5.5" fill="#FFFFFF" />
              </g>
            </g>

            {/* Fine Specular Outer Rim */}
            <rect
              x="4"
              y="4"
              width="112"
              height="112"
              rx="26"
              stroke="rgba(15, 23, 42, 0.08)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* Classy Keynote Typography Reveal */}
        <div
          className="mt-7 text-center space-y-2.5"
          style={{
            opacity: 0,
            animation: "harmonixTitleReveal 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.65s forwards",
          }}
        >
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-[28px] font-black tracking-[0.22em] text-[#0F172A] pl-1">
              HARMONIX
            </span>
            <span className="text-[10px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-md bg-[#68A800] text-white">
              AR
            </span>
          </div>

          <div className="flex items-center justify-center gap-0">
            <span className="w-8 h-[2px] bg-slate-900" />
            <span className="w-12 h-[2px] bg-[#68A800]" />
          </div>

          <p className="text-[10px] font-mono font-semibold tracking-[0.26em] text-slate-500 uppercase pt-0.5">
            Acoustic Resonance &amp; NDT Intelligence
          </p>
        </div>
      </div>

      {/* Bottom Minimalist Hairline Progress Indicator */}
      <div className="relative z-10 w-full max-w-[220px] space-y-2 pb-2">
        <div className="h-[3px] w-full rounded-full bg-slate-200/90 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0F172A] via-[#68A800] to-[#7CC200]"
            style={{
              animation: "harmonixProgressFill 2.7s cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
          />
        </div>
      </div>
    </div>
  );
};
