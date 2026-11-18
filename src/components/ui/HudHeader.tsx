"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { VoiceToggle } from "@/components/ui/VoiceToggle";

interface HudHeaderProps {
  title: string;
  subtitle?: string;
  step?: string;
  backHref?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

/** Plain-English titles + one-line instructions for every screen (centralised UX copy). */
const FRIENDLY: Record<number, { emoji: string; title: string; tip: string }> = {
  1: { emoji: "🔧", title: "Get Ready", tip: "Allow camera & mic. We check everything for you." },
  2: { emoji: "📸", title: "Scan Your Board", tip: "Point at your board — AI finds the edges by itself." },
  3: { emoji: "🧱", title: "Pick Material", tip: "AI guesses the material from your scan. Confirm or change." },
  4: { emoji: "🕶️", title: "Live AR View", tip: "See invisible vibrations on your real board." },
  5: { emoji: "🎵", title: "Find Its Note", tip: "Tap the board. AI listens and finds its natural pitch." },
  6: { emoji: "🌈", title: "Vibration Shapes", tip: "AI picked the best pattern for your board." },
  7: { emoji: "🛡️", title: "Part Safety", tip: "Green = safe, Red = may crack. AI protects parts for you." },
  8: { emoji: "🔥", title: "Stress Map", tip: "Hot colors show where the board may break." },
  9: { emoji: "🩺", title: "Health Check", tip: "Compare against a healthy board for hidden damage." },
  10: { emoji: "📄", title: "Your Report", tip: "Download or share your results." },
};

function parseStep(step?: string): number | null {
  if (!step) return null;
  const m = step.match(/(\d{1,2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 10 ? n : null;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  title,
  subtitle,
  step,
  backHref,
  onBack,
  rightAction,
}) => {
  const router = useRouter();
  const stepNum = parseStep(step);
  const friendly = stepNum ? FRIENDLY[stepNum] : null;

  const handleBack = () => {
    if (onBack) onBack();
    else if (backHref) router.push(backHref);
    else router.back();
  };

  const shownTitle = friendly ? friendly.title : title;
  const shownTip = friendly ? friendly.tip : subtitle;

  return (
    <header className="w-full sticky top-0 z-50 bg-white/95 dark:bg-[#0D191C]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#294044] px-4 pt-3 pb-3 transition-colors duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {(backHref || onBack) && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF] hover:border-slate-300 dark:hover:border-[#0EB29A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            {stepNum && (
              <span className="block text-[10px] tracking-wide text-sky-600 dark:text-[#0EB29A] font-semibold">
                Step {stepNum} of 10
              </span>
            )}
            <h1 className="text-lg font-extrabold leading-tight text-slate-900 dark:text-[#F5FDFF] flex items-center gap-1.5 truncate">
              {friendly && <span className="text-xl">{friendly.emoji}</span>}
              <span className="truncate">{shownTitle}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <VoiceToggle />
          <ThemeToggle />
          {rightAction}
        </div>
      </div>

      {shownTip && (
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-[#8C999A] font-medium leading-snug">{shownTip}</p>
      )}

      {stepNum && (
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#233A3D] overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-600 dark:bg-[#0EB29A] transition-all duration-500"
            style={{ width: `${(stepNum / 10) * 100}%` }}
          />
        </div>
      )}
    </header>
  );
};
