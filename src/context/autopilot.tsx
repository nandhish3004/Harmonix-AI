"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Square } from "lucide-react";
import { speak, cancelSpeech } from "@/utils/voice";

export const AUTOPILOT_ROUTES = [
  "/setup",
  "/scan",
  "/material",
  "/viewport",
  "/tuner",
  "/modes",
  "/safety",
  "/stress",
  "/defects",
  "/export",
];

const STEP_NAMES = [
  "Getting ready",
  "Scanning the board",
  "Choosing material",
  "Live AR view",
  "Listening for its note",
  "Picking vibration shape",
  "Checking part safety",
  "Computing stress",
  "Health check",
  "Building your report",
];

const KEY = "harmonix_autopilot";

interface AutopilotCtx {
  enabled: boolean;
  start: () => void;
  stop: () => void;
}

const AutopilotContext = createContext<AutopilotCtx>({
  enabled: false,
  start: () => {},
  stop: () => {},
});

export const AutopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setEnabled(window.sessionStorage.getItem(KEY) === "1");
  }, []);

  const start = useCallback(() => {
    window.sessionStorage.setItem(KEY, "1");
    setEnabled(true);
  }, []);

  const stop = useCallback(() => {
    window.sessionStorage.removeItem(KEY);
    setEnabled(false);
    cancelSpeech();
  }, []);

  const stepIdx = AUTOPILOT_ROUTES.indexOf(pathname);
  const showBar = enabled && stepIdx >= 0;

  return (
    <AutopilotContext.Provider value={{ enabled, start, stop }}>
      {children}
      {showBar && (
        <div className="fixed left-0 right-0 bottom-[70px] z-40 pointer-events-none">
          <div className="max-w-[440px] mx-auto px-3">
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-slate-900 dark:bg-[#15282C] text-white shadow-xl px-3.5 py-2.5 border border-slate-700 dark:border-[#294044]">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 dark:bg-[#0EB29A]">
                <Bot className="w-4 h-4 text-white dark:text-[#0D191C]" />
                <span className="absolute inset-0 rounded-full bg-sky-400/40 animate-ping" />
              </span>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-[10px] font-semibold text-sky-300 dark:text-[#0EB29A]">
                  AI AUTOPILOT · STEP {stepIdx + 1}/10
                </div>
                <div className="text-sm font-bold truncate">{STEP_NAMES[stepIdx]}…</div>
              </div>
              <button
                onClick={() => {
                  stop();
                  router.refresh();
                }}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </AutopilotContext.Provider>
  );
};

export function useAutopilot(): AutopilotCtx {
  return useContext(AutopilotContext);
}

/**
 * When Autopilot is on and `ready` becomes true, wait `delayMs` then run `action`
 * (or move to the next screen of the pipeline).
 */
export function useAutoAdvance(ready: boolean, delayMs = 2500, action?: () => void): void {
  const { enabled } = useAutopilot();
  const router = useRouter();
  const pathname = usePathname();
  const actionRef = useRef<(() => void) | undefined>(action);
  actionRef.current = action;

  useEffect(() => {
    if (!enabled || !ready) return;
    const t = setTimeout(() => {
      if (actionRef.current) {
        actionRef.current();
        return;
      }
      const idx = AUTOPILOT_ROUTES.indexOf(pathname);
      if (idx >= 0 && idx < AUTOPILOT_ROUTES.length - 1) {
        router.push(AUTOPILOT_ROUTES[idx + 1]);
      }
    }, delayMs);
    return () => clearTimeout(t);
  }, [enabled, ready, delayMs, pathname, router]);
}

/** Speak only while autopilot is running (keeps manual mode quiet unless voice is on globally). */
export function narrate(text: string): void {
  void speak(text, { interrupt: false });
}
