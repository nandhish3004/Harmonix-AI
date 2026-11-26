"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Eye,
  FileText,
  Flame,
  Grid3X3,
  Layers,
  ScanLine,
  ShieldCheck,
  Sliders,
  Stethoscope,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { VoiceToggle } from "@/components/ui/VoiceToggle";
import { HarmonixLogo, triggerHarmonixSplash } from "@/components/ui/HarmonixLogo";
import { Button } from "@astryxdesign/core/Button";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";

interface HudHeaderProps {
  title: string;
  subtitle?: string;
  step?: string;
  backHref?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

/** Plain-English titles + crisp Lucide icons for every screen (no emojis). */
const FRIENDLY: Record<number, { Icon: React.ElementType; title: string; tip: string }> = {
  1: { Icon: Sliders, title: "Get Ready", tip: "Allow camera & mic. We check everything for you." },
  2: { Icon: ScanLine, title: "Scan Your Board", tip: "Point at your board — AI finds the edges by itself." },
  3: { Icon: Layers, title: "Pick Material", tip: "AI guesses the material from your scan. Confirm or change." },
  4: { Icon: Eye, title: "Live AR View", tip: "See invisible vibrations on your real board." },
  5: { Icon: Activity, title: "Find Its Note", tip: "Tap the board. AI listens and finds its natural pitch." },
  6: { Icon: Grid3X3, title: "Vibration Shapes", tip: "AI picked the best pattern for your board." },
  7: { Icon: ShieldCheck, title: "Part Safety", tip: "Green = safe, Red = may crack. AI protects parts for you." },
  8: { Icon: Flame, title: "Stress Map", tip: "Hot colors show where the board may break." },
  9: { Icon: Stethoscope, title: "Health Check", tip: "Compare against a healthy board for hidden damage." },
  10: { Icon: FileText, title: "Your Report", tip: "Download or share your results." },
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
  const HeaderIcon = friendly?.Icon;

  const handleBack = () => {
    if (onBack) onBack();
    else if (backHref) router.push(backHref);
    else router.back();
  };

  const shownTitle = friendly ? friendly.title : title;
  const shownTip = friendly ? friendly.tip : subtitle;

  return (
    <header className="w-full sticky top-0 z-50 bg-white/95 dark:bg-[#0D191C]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#294044] px-3 sm:px-4 pt-2.5 pb-2.5 transition-colors duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {(backHref || onBack) && (
            <Button
              variant="secondary"
              size="sm"
              isIconOnly
              label="Back"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={handleBack}
              className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A]"
            />
          )}

          <button
            type="button"
            onClick={triggerHarmonixSplash}
            title="Replay Harmonix Intro Animation"
            className="shrink-0 rounded-xl hover:scale-105 active:scale-95 transition-transform"
          >
            <HarmonixLogo size="sm" />
          </button>

          <div className="min-w-0 flex-1">
            {stepNum && (
              <span className="block text-[10px] tracking-wide text-sky-600 dark:text-[#0EB29A] font-semibold leading-tight">
                Step {stepNum} of 10
              </span>
            )}
            <h1 className="text-base sm:text-lg font-extrabold leading-tight text-slate-900 dark:text-[#F5FDFF] flex items-center gap-1.5 min-w-0">
              {HeaderIcon && (
                <span className="w-5 h-5 shrink-0 rounded-md bg-sky-50 dark:bg-[#1C332E] text-sky-600 dark:text-[#0EB29A] flex items-center justify-center">
                  <HeaderIcon className="w-3 h-3" />
                </span>
              )}
              <span className="truncate">{shownTitle}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <VoiceToggle />
          <ThemeToggle />
          {rightAction}
        </div>
      </div>

      {shownTip && (
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-[#8C999A] font-medium leading-snug">{shownTip}</p>
      )}

      {stepNum && (
        <div className="mt-2.5">
          <ProgressBar
            label={`Inspection progress: step ${stepNum} of 10`}
            isLabelHidden
            value={stepNum}
            max={10}
            variant="accent"
          />
        </div>
      )}
    </header>
  );
};
