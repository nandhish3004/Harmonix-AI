"use client";

import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, SkipForward } from "lucide-react";
import { speak, cancelSpeech, sleep, isVoiceOn } from "@/utils/voice";
import { useAutopilot } from "@/context/autopilot";
import { VoiceToggle } from "@/components/ui/VoiceToggle";

export type GuideKind = "setup" | "scan" | "tap" | "ar" | "safety" | "health";

const GUIDES: Record<GuideKind, { emoji: string; title: string; cta: string; steps: string[] }> = {
  setup: {
    emoji: "🔧",
    title: "Quick Check",
    cta: "Start check",
    steps: [
      "Hold your phone upright and keep it steady.",
      "Allow the camera and microphone when your browser asks.",
      "Stay in a quiet room. I will measure the background noise.",
      "Wait for the green ticks. Then you are ready to scan.",
    ],
  },
  scan: {
    emoji: "📸",
    title: "Scan Your Board",
    cta: "Start scanning",
    steps: [
      "Place the board flat on a plain surface that contrasts with it, like a desk.",
      "Hold your phone about thirty centimeters above, looking straight down.",
      "Keep the whole board inside the frame and stay steady for two seconds.",
      "The four corners snap on automatically. You can drag them to fine tune.",
    ],
  },
  tap: {
    emoji: "🎵",
    title: "Tap Test",
    cta: "Start tap test",
    steps: [
      "Rest the board on a soft towel or hold it lightly by one edge.",
      "Put your phone's microphone close to the board, about five centimeters away.",
      "When I say tap, hit the board once, firmly, with a pen or fingernail.",
      "I will listen for three taps and average them for an accurate pitch. Stay quiet between taps.",
    ],
  },
  ar: {
    emoji: "🕶️",
    title: "Live AR View",
    cta: "Open AR",
    steps: [
      "Point the camera at your board from above.",
      "Move slowly. The colored overlay follows the board.",
      "Red means it shakes a lot. Blue and green mean calm.",
      "I will automatically find the frequency where your board resonates.",
    ],
  },
  safety: {
    emoji: "🛡️",
    title: "Part Safety",
    cta: "Check my parts",
    steps: [
      "Each important part on your board is shown as a card.",
      "Green zones barely move. Red zones shake and can crack parts.",
      "I will add support screws automatically to protect risky parts. You can also drag parts yourself.",
    ],
  },
  health: {
    emoji: "🩺",
    title: "Health Check",
    cta: "Run health check",
    steps: [
      "I compare your measured pitch with a healthy reference.",
      "A lower pitch means the board lost stiffness. That can mean a crack or hidden gap.",
      "Within fifteen hertz of the reference is considered healthy.",
    ],
  },
};

/** Animated how-to illustrations (SVG + SMIL, no assets needed). */
const GuideAnimation: React.FC<{ kind: GuideKind }> = ({ kind }) => {
  const board = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="#15803D" stroke="#FACC15" strokeWidth="2" />
      <line x1={x + 10} y1={y + h * 0.3} x2={x + w - 10} y2={y + h * 0.3} stroke="#4ADE80" strokeWidth="1.5" />
      <line x1={x + 10} y1={y + h * 0.7} x2={x + w - 10} y2={y + h * 0.7} stroke="#4ADE80" strokeWidth="1.5" />
      <rect x={x + w / 2 - 14} y={y + h / 2 - 8} width="28" height="16" fill="#1E293B" />
    </g>
  );

  return (
    <svg viewBox="0 0 300 170" className="w-full h-auto">
      <rect width="300" height="170" fill="#F1F5F9" className="dark:hidden" />
      <rect width="300" height="170" fill="#101F23" className="hidden dark:block" />
      <rect x="0" y="148" width="300" height="22" fill="#CBD5E1" opacity="0.6" />

      {kind === "scan" && (
        <>
          {board(85, 104, 130, 44)}
          <polygon points="130,76 170,76 215,104 85,104" fill="#38BDF8" opacity="0.2">
            <animate attributeName="opacity" values="0.1;0.34;0.1" dur="1.6s" repeatCount="indefinite" />
          </polygon>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="2.4s" repeatCount="indefinite" />
            <rect x="125" y="12" width="50" height="64" rx="8" fill="#0F172A" />
            <rect x="130" y="18" width="40" height="46" rx="4" fill="#1E293B" />
            <circle cx="150" cy="69" r="2.2" fill="#94A3B8" />
          </g>
          {[[85, 104], [215, 104], [215, 148], [85, 148]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="5" fill="#0EA5E9">
              <animate attributeName="r" values="4;8;4" dur="1.4s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
            </circle>
          ))}
          <line x1="232" y1="14" x2="232" y2="104" stroke="#64748B" strokeDasharray="3 3" />
          <text x="238" y="62" fontSize="10" fill="#475569" fontWeight="bold">~30 cm</text>
        </>
      )}

      {kind === "tap" && (
        <>
          {board(40, 112, 170, 30)}
          <g>
            <rect x="228" y="118" width="56" height="26" rx="6" fill="#0F172A" />
            <circle cx="236" cy="131" r="3" fill="#38BDF8">
              <animate attributeName="r" values="2;4;2" dur="0.9s" repeatCount="indefinite" />
            </circle>
            <text x="228" y="112" fontSize="9" fill="#475569" fontWeight="bold">mic · 5 cm</text>
          </g>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 24;0 0;0 0" keyTimes="0;0.18;0.36;1" dur="2s" repeatCount="indefinite" />
            <line x1="110" y1="28" x2="124" y2="86" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" />
            <circle cx="124" cy="88" r="3" fill="#475569" />
          </g>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx="124" cy="112" r="4" fill="none" stroke="#0EA5E9" strokeWidth="2" opacity="0">
              <animate attributeName="r" values="4;46" dur="2s" begin={`${0.34 + i * 0.18}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0" dur="2s" begin={`${0.34 + i * 0.18}s`} repeatCount="indefinite" />
            </circle>
          ))}
          <text x="60" y="30" fontSize="12" fill="#0369A1" fontWeight="bold">TAP!</text>
        </>
      )}

      {kind === "ar" && (
        <>
          <polygon points="70,150 230,150 250,112 90,112" fill="#15803D" stroke="#FACC15" strokeWidth="2" />
          <g>
            <animateTransform attributeName="transform" type="translate" values="-16 0;16 0;-16 0" dur="3.4s" repeatCount="indefinite" />
            <rect x="125" y="14" width="52" height="68" rx="8" fill="#0F172A" />
            <rect x="130" y="20" width="42" height="50" rx="4" fill="#0B3B52" />
            <path d="M132 46 Q141 30 151 46 T170 46" stroke="#22D3EE" strokeWidth="2" fill="none">
              <animate attributeName="d" dur="1.6s" repeatCount="indefinite"
                values="M132 46 Q141 30 151 46 T170 46;M132 46 Q141 62 151 46 T170 46;M132 46 Q141 30 151 46 T170 46" />
            </path>
            <path d="M132 56 Q141 44 151 56 T170 56" stroke="#F59E0B" strokeWidth="2" fill="none">
              <animate attributeName="d" dur="1.6s" repeatCount="indefinite"
                values="M132 56 Q141 44 151 56 T170 56;M132 56 Q141 68 151 56 T170 56;M132 56 Q141 44 151 56 T170 56" />
            </path>
          </g>
          <polygon points="90,112 250,112 230,150 70,150" fill="#22D3EE" opacity="0.22">
            <animate attributeName="opacity" values="0.1;0.35;0.1" dur="1.8s" repeatCount="indefinite" />
          </polygon>
        </>
      )}

      {kind === "setup" && (
        <>
          <rect x="30" y="14" width="74" height="140" rx="12" fill="#0F172A" />
          <rect x="36" y="24" width="62" height="116" rx="6" fill="#1E293B" />
          <circle cx="67" cy="19" r="2.5" fill="#38BDF8">
            <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
          {["Camera ready", "Microphone ready", "Room is quiet"].map((t, i) => (
            <g key={t}>
              <rect x="128" y={34 + i * 40} width="150" height="30" rx="8" fill="#FFFFFF" stroke="#CBD5E1" />
              <text x="142" y={54 + i * 40} fontSize="12" fill="#334155" fontWeight="bold">{t}</text>
              <path d={`M252 ${48 + i * 40} l6 6 l12 -14`} stroke="#16A34A" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0">
                <animate attributeName="opacity" values="0;0;1;1" keyTimes={`0;${0.15 + i * 0.22};${0.25 + i * 0.22};1`} dur="4.4s" repeatCount="indefinite" />
              </path>
            </g>
          ))}
        </>
      )}

      {kind === "safety" && (
        <>
          <rect x="30" y="40" width="240" height="100" rx="8" fill="#15803D" stroke="#FACC15" strokeWidth="2" opacity="0.9" />
          <circle cx="80" cy="90" r="30" fill="#EF4444" opacity="0.5" />
          <circle cx="220" cy="90" r="30" fill="#22C55E" opacity="0.55" />
          <text x="58" y="136" fontSize="10" fill="#FEE2E2" fontWeight="bold">shakes</text>
          <text x="204" y="136" fontSize="10" fill="#DCFCE7" fontWeight="bold">calm</text>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 0;140 0;140 0" keyTimes="0;0.25;0.6;1" dur="3.6s" repeatCount="indefinite" />
            <rect x="66" y="80" width="28" height="20" rx="3" fill="#EF4444">
              <animate attributeName="fill" values="#EF4444;#EF4444;#16A34A;#16A34A" keyTimes="0;0.25;0.6;1" dur="3.6s" repeatCount="indefinite" />
            </rect>
            <circle cx="96" cy="108" r="7" fill="#F8FAFC" opacity="0.85" />
          </g>
        </>
      )}

      {kind === "health" && (
        <>
          {board(20, 70, 110, 50)}
          {board(170, 70, 110, 50)}
          <polyline points="188,70 200,86 192,98 208,110 198,120" fill="none" stroke="#EF4444" strokeWidth="2.5">
            <animate attributeName="opacity" values="0;1;1" keyTimes="0;0.4;1" dur="2.4s" repeatCount="indefinite" />
          </polyline>
          <path d="M20 40 q10 -20 20 0 t20 0 t20 0 t20 0 t10 0" stroke="#0EA5E9" strokeWidth="2.5" fill="none" strokeDasharray="200" strokeDashoffset="200">
            <animate attributeName="stroke-dashoffset" values="200;0" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M170 40 q14 -20 28 0 t28 0 t28 0 t26 0" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeDasharray="200" strokeDashoffset="200">
            <animate attributeName="stroke-dashoffset" values="200;0" dur="2s" repeatCount="indefinite" />
          </path>
          <text x="30" y="145" fontSize="11" fill="#16A34A" fontWeight="bold">Healthy · high pitch</text>
          <text x="172" y="145" fontSize="11" fill="#DC2626" fontWeight="bold">Cracked · lower pitch</text>
        </>
      )}
    </svg>
  );
};

interface TestGuideProps {
  kind: GuideKind;
  open: boolean;
  onDone: () => void;
}

export const TestGuide: React.FC<TestGuideProps> = ({ kind, open, onDone }) => {
  const guide = GUIDES[kind];
  const { enabled } = useAutopilot();
  const [active, setActive] = useState<number>(0);
  const [finished, setFinished] = useState<boolean>(false);
  const runId = useRef<number>(0);
  const autopilotRef = useRef<boolean>(enabled);
  autopilotRef.current = enabled;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const run = async () => {
    const id = ++runId.current;
    setFinished(false);
    setActive(0);
    for (let i = 0; i < guide.steps.length; i++) {
      if (runId.current !== id) return;
      setActive(i);
      const t0 = Date.now();
      if (isVoiceOn()) {
        await speak(guide.steps[i]);
        const elapsed = Date.now() - t0;
        await sleep(Math.max(600, 2800 - elapsed));
      } else {
        await sleep(3400);
      }
    }
    if (runId.current !== id) return;
    setFinished(true);
    if (autopilotRef.current) {
      await sleep(600);
      if (runId.current === id) onDoneRef.current();
    }
  };

  useEffect(() => {
    if (!open) {
      runId.current++;
      cancelSpeech();
      return;
    }
    void run();
    return () => {
      runId.current++;
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-[440px] bg-white dark:bg-[#0D191C] rounded-t-3xl p-5 pb-6 shadow-2xl max-h-[94vh] overflow-y-auto pop-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{guide.emoji}</span>
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-sky-600 dark:text-[#0EB29A]">HOW THIS TEST WORKS</div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-[#F5FDFF]">{guide.title}</h2>
            </div>
          </div>
          <VoiceToggle />
        </div>

        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#294044] mb-3">
          <GuideAnimation kind={kind} />
        </div>

        <ol className="space-y-2 mb-4">
          {guide.steps.map((s, i) => (
            <li
              key={i}
              className={`flex gap-2.5 items-start rounded-xl px-3 py-2 text-[13px] leading-snug transition-all ${
                i === active && !finished
                  ? "bg-sky-50 dark:bg-[#1C332E] text-slate-900 dark:text-[#F5FDFF] font-semibold ring-1 ring-sky-300 dark:ring-[#0EB29A]"
                  : i < active || finished
                  ? "text-slate-500 dark:text-[#8C999A]"
                  : "text-slate-400 dark:text-[#5E6D6E]"
              }`}
            >
              <span
                className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  i <= active || finished
                    ? "bg-sky-600 text-white dark:bg-[#0EB29A] dark:text-[#0D191C]"
                    : "bg-slate-200 dark:bg-[#233A3D] text-slate-500"
                }`}
              >
                {i < active || finished ? "✓" : i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="flex gap-2">
          <button
            onClick={() => void run()}
            className="h-12 px-4 rounded-2xl border-2 border-slate-200 dark:border-[#294044] text-slate-700 dark:text-[#F5FDFF] font-bold text-sm flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Replay
          </button>
          <button
            onClick={() => {
              runId.current++;
              cancelSpeech();
              onDone();
            }}
            className="flex-1 h-12 rounded-2xl bg-slate-900 text-white dark:bg-[#0EB29A] dark:text-[#0D191C] font-bold text-sm flex items-center justify-center gap-2"
          >
            {finished || active >= guide.steps.length - 1 ? (
              <>
                <Play className="w-4 h-4" /> {guide.cta}
              </>
            ) : (
              <>
                <SkipForward className="w-4 h-4" /> Skip & {guide.cta.toLowerCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
