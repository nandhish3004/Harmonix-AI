"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  Mic,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SkipForward,
  Sliders,
  Stethoscope,
} from "lucide-react";
import { speak, cancelSpeech, sleep, isVoiceOn } from "@/utils/voice";
import { useAutopilot } from "@/context/autopilot";
import { VoiceToggle } from "@/components/ui/VoiceToggle";

export type GuideKind = "setup" | "scan" | "tap" | "ar" | "safety" | "health";

const GUIDES: Record<GuideKind, { Icon: React.ElementType; title: string; cta: string; steps: string[] }> = {
  setup: {
    Icon: Sliders,
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
    Icon: ScanLine,
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
    Icon: Mic,
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
    Icon: Eye,
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
    Icon: ShieldCheck,
    title: "Part Safety",
    cta: "Check my parts",
    steps: [
      "Each important part on your board is shown as a card.",
      "Green zones barely move. Red zones shake and can crack parts.",
      "I will add support screws automatically to protect risky parts. You can also drag parts yourself.",
    ],
  },
  health: {
    Icon: Stethoscope,
    title: "Health Check",
    cta: "Run health check",
    steps: [
      "I compare your measured pitch with a healthy reference.",
      "A lower pitch means the board lost stiffness. That can mean a crack or hidden gap.",
      "Within fifteen hertz of the reference is considered healthy.",
    ],
  },
};

/** Step-synchronized animated how-to diagrams (360x210 crisp SVG + SMIL). */
const GuideAnimation: React.FC<{ kind: GuideKind; step: number }> = ({ kind, step }) => {
  const board = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="#15803D" stroke="#FACC15" strokeWidth="2" />
      <line x1={x + 10} y1={y + h * 0.3} x2={x + w - 10} y2={y + h * 0.3} stroke="#4ADE80" strokeWidth="1.5" />
      <line x1={x + 10} y1={y + h * 0.7} x2={x + w - 10} y2={y + h * 0.7} stroke="#4ADE80" strokeWidth="1.5" />
      <rect x={x + w / 2 - 14} y={y + h / 2 - 7} width="28" height="14" fill="#1E293B" />
    </g>
  );

  return (
    <svg viewBox="0 0 360 210" className="w-full h-auto">
      <rect width="360" height="210" fill="#F1F5F9" className="dark:hidden" />
      <rect width="360" height="210" fill="#101F23" className="hidden dark:block" />

      {kind === "scan" && (
        <>
          {/* Left Scene: Physical Setup */}
          <rect x="10" y="168" width="210" height="32" rx="4" fill="#CBD5E1" />
          <text x="18" y="188" fontSize="9.5" fill="#334155" fontWeight="bold">PLAIN FLAT DESK SURFACE</text>

          {/* Workpiece flat on desk */}
          {board(42, 148, 124, 20)}

          {/* Callout: Place flat vs don't hold in hand */}
          <g opacity={step === 0 ? 1 : 0.72}>
            <rect x="14" y="108" width="128" height="20" rx="6" fill="#DCFCE7" stroke="#16A34A" strokeWidth="1.2" />
            <text x="78" y="121" fontSize="8.5" fill="#166534" fontWeight="bold" textAnchor="middle">
              PLACE FLAT ON DESK
            </text>
            <rect x="14" y="130" width="108" height="15" rx="5" fill="#FEE2E2" stroke="#EF4444" strokeWidth="1" />
            <text x="68" y="140.5" fontSize="7.5" fill="#991B1B" fontWeight="bold" textAnchor="middle">
              DO NOT HOLD IN HAND
            </text>
          </g>

          {/* Top Phone Held Parallel 0 deg Tilt */}
          <g opacity={step === 1 || step === 2 ? 1 : 0.75}>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="2.6s" repeatCount="indefinite" />
            <rect x="76" y="18" width="56" height="14" rx="4" fill="#0F172A" />
            <rect x="98" y="31" width="12" height="5" rx="2" fill="#38BDF8" />
            <rect x="142" y="16" width="54" height="16" rx="5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1" />
            <text x="169" y="27" fontSize="8" fill="#0369A1" fontWeight="bold" textAnchor="middle">0° PARALLEL</text>
          </g>

          {/* Camera FOV Cone */}
          <polygon points="100,36 108,36 166,148 42,148" fill="#0EA5E9" opacity="0.16">
            <animate attributeName="opacity" values="0.10;0.28;0.10" dur="1.8s" repeatCount="indefinite" />
          </polygon>

          {/* 30 cm Height Dimension */}
          <line x1="176" y1="32" x2="176" y2="148" stroke="#0284C7" strokeWidth="1.2" strokeDasharray="3 3" />
          <line x1="171" y1="32" x2="181" y2="32" stroke="#0284C7" strokeWidth="1.5" />
          <line x1="171" y1="148" x2="181" y2="148" stroke="#0284C7" strokeWidth="1.5" />
          <rect x="180" y="76" width="44" height="24" rx="4" fill="#FFFFFF" stroke="#BAE6FD" />
          <text x="202" y="87" fontSize="8.5" fill="#0369A1" fontWeight="bold" textAnchor="middle">30 cm</text>
          <text x="202" y="96" fontSize="7" fill="#64748B" textAnchor="middle">(1 ft)</text>

          {/* Right Inset: Phone Camera Screen View */}
          <rect x="232" y="16" width="118" height="178" rx="14" fill="#0F172A" stroke="#334155" strokeWidth="2" />
          <rect x="240" y="30" width="102" height="148" rx="8" fill="#1E293B" />
          <text x="291" y="25" fontSize="7.5" fill="#94A3B8" fontWeight="bold" textAnchor="middle">CAMERA VIEW</text>

          {/* Centered PCB inside phone view with margins */}
          <rect x="258" y="64" width="66" height="82" rx="4" fill="#15803D" stroke="#FACC15" strokeWidth="1.5" />
          <rect x="281" y="96" width="20" height="16" fill="#0F172A" />
          <rect x="255" y="61" width="72" height="88" rx="3" fill="none" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4 3" />

          {/* Corner pins P1-P4 */}
          {[
            [255, 61, "P1"],
            [327, 61, "P2"],
            [327, 149, "P3"],
            [255, 149, "P4"],
          ].map(([cx, cy, lbl], idx) => (
            <g key={String(lbl)}>
              <circle cx={Number(cx)} cy={Number(cy)} r="4" fill="#0EA5E9">
                <animate attributeName="r" values="3.5;5.5;3.5" dur="1.4s" begin={`${idx * 0.2}s`} repeatCount="indefinite" />
              </circle>
              <text x={Number(cx) + (idx === 0 || idx === 3 ? -12 : 6)} y={Number(cy) + 3} fontSize="7" fill="#38BDF8" fontWeight="bold">
                {lbl}
              </text>
            </g>
          ))}
          <text x="291" y="170" fontSize="7.2" fill="#E2E8F0" fontWeight="bold" textAnchor="middle">
            LEAVE MARGIN AROUND EDGES
          </text>
        </>
      )}

      {kind === "tap" && (
        <>
          {/* Desk Base */}
          <rect x="10" y="170" width="340" height="30" rx="4" fill="#CBD5E1" />

          {/* Soft Foam / Folded Towel Support under Center Only */}
          <rect x="74" y="152" width="68" height="18" rx="6" fill="#A5B4FC" stroke="#6366F1" strokeWidth="1.5" />
          <text x="108" y="164" fontSize="7.2" fill="#312E81" fontWeight="bold" textAnchor="middle">SOFT TOWEL</text>

          {/* Board Balanced on Center Towel so Edges Hang Free to Ring */}
          <g>
            <animateTransform attributeName="transform" type="rotate" values="0 108 144;-1.2 108 144;1.2 108 144;0 108 144" dur="1.6s" repeatCount="indefinite" />
            {board(24, 134, 168, 18)}
          </g>
          <text x="36" y="128" fontSize="7.5" fill="#0369A1" fontWeight="bold">FREE EDGES TO RING</text>
          <text x="108" y="187" fontSize="8" fill="#475569" fontWeight="bold" textAnchor="middle">SUPPORT ONLY AT CENTER</text>

          {/* Firm Pen Tap on Top Surface */}
          <g opacity={step === 2 ? 1 : 0.85}>
            <animateTransform attributeName="transform" type="translate" values="0 -14;0 14;0 -14;0 -14" keyTimes="0;0.18;0.38;1" dur="1.9s" repeatCount="indefinite" />
            <line x1="78" y1="44" x2="96" y2="116" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />
            <polygon points="94,115 100,114 98,123" fill="#334155" />
          </g>
          <rect x="16" y="34" width="96" height="18" rx="6" fill="#FEF3C7" stroke="#D97706" strokeWidth="1" />
          <text x="64" y="46" fontSize="8" fill="#92400E" fontWeight="bold" textAnchor="middle">QUICK FIRM TAP!</text>

          {/* Acoustic Wave Arcs Moving Right Toward Phone Bottom Mic */}
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M ${198 + i * 11} 126 Q ${206 + i * 11} 142 ${198 + i * 11} 158`}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <animate attributeName="opacity" values="0;0.95;0" dur="1.9s" begin={`${0.28 + i * 0.16}s`} repeatCount="indefinite" />
            </path>
          ))}

          {/* Bidirectional 3-5 cm Gap Arrow */}
          <line x1="194" y1="104" x2="252" y2="104" stroke="#0284C7" strokeWidth="1.8" />
          <polygon points="194,104 200,101 200,107" fill="#0284C7" />
          <polygon points="252,104 246,101 246,107" fill="#0284C7" />
          <rect x="195" y="80" width="56" height="18" rx="5" fill="#E0F2FE" stroke="#0284C7" />
          <text x="223" y="92" fontSize="8.5" fill="#0369A1" fontWeight="bold" textAnchor="middle">3–5 cm GAP</text>

          {/* Phone Oriented with Bottom Mic Port Facing Board Edge */}
          <rect x="254" y="106" width="94" height="54" rx="10" fill="#0F172A" stroke="#334155" strokeWidth="2" />
          <rect x="266" y="112" width="74" height="42" rx="5" fill="#1E293B" />
          {/* Bottom Edge USB-C + Mic Port Highlight */}
          <rect x="252" y="128" width="4" height="12" rx="1" fill="#94A3B8" />
          <circle cx="256" cy="144" r="4" fill="#10B981">
            <animate attributeName="r" values="3.5;6;3.5" dur="1s" repeatCount="indefinite" />
          </circle>
          <rect x="242" y="42" width="106" height="28" rx="6" fill="#DCFCE7" stroke="#16A34A" strokeWidth="1.2" />
          <text x="295" y="54" fontSize="8" fill="#166534" fontWeight="bold" textAnchor="middle">POINT BOTTOM MIC</text>
          <text x="295" y="64" fontSize="7.5" fill="#166534" fontWeight="bold" textAnchor="middle">AT BOARD EDGE</text>
          <line x1="286" y1="70" x2="258" y2="140" stroke="#16A34A" strokeWidth="1.2" strokeDasharray="3 2" />
          <text x="303" y="136" fontSize="7.5" fill="#94A3B8" fontWeight="bold" textAnchor="middle">DO NOT COVER MIC</text>
        </>
      )}

      {kind === "ar" && (
        <>
          <rect x="10" y="170" width="340" height="30" rx="4" fill="#CBD5E1" />
          <polygon points="75,168 285,168 308,124 98,124" fill="#15803D" stroke="#FACC15" strokeWidth="2" />
          <polygon points="98,124 308,124 285,168 75,168" fill="#0EA5E9" opacity="0.24">
            <animate attributeName="opacity" values="0.12;0.38;0.12" dur="1.8s" repeatCount="indefinite" />
          </polygon>
          <g>
            <animateTransform attributeName="transform" type="translate" values="-22 0;22 0;-22 0" dur="3.2s" repeatCount="indefinite" />
            <rect x="148" y="18" width="64" height="78" rx="10" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
            <rect x="154" y="25" width="52" height="58" rx="5" fill="#0D191C" />
            <path d="M158 54 Q170 36 180 54 T202 54" stroke="#22D3EE" strokeWidth="2.2" fill="none">
              <animate attributeName="d" dur="1.5s" repeatCount="indefinite"
                values="M158 54 Q170 36 180 54 T202 54;M158 54 Q170 72 180 54 T202 54;M158 54 Q170 36 180 54 T202 54" />
            </path>
            <path d="M158 66 Q170 50 180 66 T202 66" stroke="#F59E0B" strokeWidth="2.2" fill="none">
              <animate attributeName="d" dur="1.5s" repeatCount="indefinite"
                values="M158 66 Q170 50 180 66 T202 66;M158 66 Q170 80 180 66 T202 66;M158 66 Q170 50 180 66 T202 66" />
            </path>
          </g>
          <text x="180" y="189" fontSize="9.5" fill="#334155" fontWeight="bold" textAnchor="middle">
            KEEP BOARD IN FRAME · MOVE SLOWLY
          </text>
        </>
      )}

      {kind === "setup" && (
        <>
          <rect x="34" y="20" width="84" height="166" rx="14" fill="#0F172A" />
          <rect x="42" y="32" width="68" height="138" rx="7" fill="#1E293B" />
          <circle cx="76" cy="26" r="3" fill="#38BDF8">
            <animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
          {["Camera ready", "Mic ready", "Quiet room"].map((t, i) => (
            <g key={t} opacity={step >= i ? 1 : 0.45}>
              <rect x="144" y={36 + i * 48} width="188" height="36" rx="10" fill="#FFFFFF" stroke={step === i ? "#0284C7" : "#CBD5E1"} strokeWidth={step === i ? 2 : 1} />
              <text x="162" y={59 + i * 48} fontSize="13" fill="#0F172A" fontWeight="bold">{t}</text>
              <path d={`M296 ${54 + i * 48} l6 6 l13 -15`} stroke="#16A34A" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity={step >= i ? 1 : 0.25} />
            </g>
          ))}
        </>
      )}

      {kind === "safety" && (
        <>
          <rect x="36" y="34" width="288" height="136" rx="12" fill="#15803D" stroke="#FACC15" strokeWidth="2" />
          <circle cx="104" cy="102" r="38" fill="#EF4444" opacity="0.55" />
          <circle cx="256" cy="102" r="38" fill="#22C55E" opacity="0.6" />
          <text x="104" y="154" fontSize="10.5" fill="#FEE2E2" fontWeight="bold" textAnchor="middle">SHAKES (DANGER)</text>
          <text x="256" y="154" fontSize="10.5" fill="#DCFCE7" fontWeight="bold" textAnchor="middle">CALM NODE (SAFE)</text>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 0;152 0;152 0" keyTimes="0;0.22;0.58;1" dur="3.6s" repeatCount="indefinite" />
            <rect x="86" y="90" width="36" height="24" rx="4" fill="#EF4444">
              <animate attributeName="fill" values="#EF4444;#EF4444;#16A34A;#16A34A" keyTimes="0;0.22;0.58;1" dur="3.6s" repeatCount="indefinite" />
            </rect>
            <circle cx="128" cy="122" r="9" fill="#F59E0B" stroke="#0F172A" strokeWidth="2" />
          </g>
        </>
      )}

      {kind === "health" && (
        <>
          {board(26, 86, 134, 62)}
          {board(200, 86, 134, 62)}
          <polyline points="224,86 238,106 228,120 246,134 234,148" fill="none" stroke="#EF4444" strokeWidth="3">
            <animate attributeName="opacity" values="0;1;1" keyTimes="0;0.35;1" dur="2.4s" repeatCount="indefinite" />
          </polyline>
          <path d="M26 48 q12 -22 24 0 t24 0 t24 0 t24 0 t24 0" stroke="#0EA5E9" strokeWidth="3" fill="none" strokeDasharray="240" strokeDashoffset="240">
            <animate attributeName="stroke-dashoffset" values="240;0" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M200 48 q18 -22 36 0 t36 0 t36 0 t26 0" stroke="#F59E0B" strokeWidth="3" fill="none" strokeDasharray="240" strokeDashoffset="240">
            <animate attributeName="stroke-dashoffset" values="240;0" dur="2s" repeatCount="indefinite" />
          </path>
          <text x="93" y="172" fontSize="11.5" fill="#16A34A" fontWeight="bold" textAnchor="middle">Healthy · Normal Pitch</text>
          <text x="267" y="172" fontSize="11.5" fill="#DC2626" fontWeight="bold" textAnchor="middle">Damaged · Lower Pitch</text>
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
  const GuideIcon = guide.Icon;
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
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-[#1C332E] border border-sky-200 dark:border-[#0EB29A]/40 text-sky-600 dark:text-[#0EB29A] flex items-center justify-center">
              <GuideIcon className="w-5 h-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-sky-600 dark:text-[#0EB29A]">HOW THIS TEST WORKS</div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-[#F5FDFF]">{guide.title}</h2>
            </div>
          </div>
          <VoiceToggle />
        </div>

        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#294044] mb-3">
          <GuideAnimation kind={kind} step={active} />
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
                {i < active || finished ? <Check className="w-3 h-3" /> : i + 1}
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
