"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  Move,
  Cpu,
  Zap,
  ArrowRight,
  Info,
  CheckCircle2,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";

interface ComponentItem {
  id: string;
  name: string;
  tag: string;
  x: number;
  y: number;
  sensitivity: "HIGH" | "CRITICAL" | "MEDIUM";
}

export default function ComponentSafetyPage() {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement | null>(null);

  const [components, setComponents] = useState<ComponentItem[]>([
    {
      id: "comp-1",
      name: "24MHz Crystal Oscillator",
      tag: "XTAL-24M",
      x: 180,
      y: 180, // initially on center node
      sensitivity: "CRITICAL",
    },
    {
      id: "comp-2",
      name: "BGA Microcontroller",
      tag: "MCU-BGA-144",
      x: 80,
      y: 90,
      sensitivity: "HIGH",
    },
    {
      id: "comp-3",
      name: "100uF MLCC Cap",
      tag: "C-1206-MLCC",
      x: 270,
      y: 260,
      sensitivity: "HIGH",
    },
  ]);

  const [selectedCompId, setSelectedCompId] = useState<string>("comp-1");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const activeComp =
    components.find((c) => c.id === selectedCompId) || components[0];

  // Calculate distance to closest nodal line
  // In Mode (2,2) Radial Cross on 360x360 board, nodal lines are along x=180, y=180, and diagonal circles
  const distToNodeX = Math.abs(activeComp.x - 180);
  const distToNodeY = Math.abs(activeComp.y - 180);
  const minDistance = Math.min(distToNodeX, distToNodeY);

  // Vibration score: 100 on nodal line, drops as distance increases towards antinode
  const vibrationScore = Math.max(10, Math.min(99, Math.round(100 - minDistance * 0.95)));
  const isSafe = vibrationScore >= 70;

  const handlePointerDown = (id: string) => {
    setSelectedCompId(id);
    setActiveDragId(id);
  };

  const handleBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDragId || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(25, Math.min(rect.width - 25, e.clientX - rect.left));
    const y = Math.max(25, Math.min(rect.height - 25, e.clientY - rect.top));

    setComponents((prev) =>
      prev.map((c) => (c.id === activeDragId ? { ...c, x: Math.round(x), y: Math.round(y) } : c))
    );
  };

  const handlePointerUp = () => {
    setActiveDragId(null);
  };

  const handleProceed = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_safety_score", String(vibrationScore));
      localStorage.setItem("harmonix_components", JSON.stringify(components));
    }
    router.push("/stress");
  };

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col select-none">
      <HudHeader
        title="SAFETY SCORING"
        step="SCREEN 07 // 10"
        subtitle="Component Nodal Placement & Fatigue Risk"
        backHref="/modes"
        rightAction={
          <HudBadge variant={isSafe ? "safe" : "danger"} dot>
            {isSafe ? "LOW FATIGUE RISK" : "CRITICAL ANTINODE"}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Real-time Green / Red Score Gauge Bar */}
        <ChamferedCard
          variant={isSafe ? "safe" : "danger"}
          className="p-3.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            {isSafe ? (
              <ShieldCheck className="w-6 h-6 text-[#4ADE80]" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-[#FF4444]" />
            )}
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider block">
                {isSafe ? "SAFE // NODAL ZERO DISPLACEMENT" : "DANGER // HIGH DISPLACEMENT ANTINODE"}
              </span>
              <span className="text-[10px] font-mono opacity-80">
                ACTIVE COMPONENT: {activeComp.name}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-2xl font-black font-mono ${
                isSafe ? "text-[#4ADE80]" : "text-[#FF4444]"
              }`}
            >
              {vibrationScore}
            </span>
            <span className="text-[10px] font-mono text-[#8C999A] block">/ 100</span>
          </div>
        </ChamferedCard>

        {/* Interactive Drag & Drop Board with Chladni Nodal Overlay */}
        <div
          ref={boardRef}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full h-[320px] bg-[#101F23] rounded-[16px] border border-[#294044] overflow-hidden flex items-center justify-center cursor-crosshair touch-none shadow-xl"
        >
          {/* Subtle PCB traces and grid */}
          <div className="absolute inset-0 ar-grid-bg opacity-30 pointer-events-none" />

          {/* SVG Nodal Lines (Safe Green corridors) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Center nodal cross */}
            <line
              x1="0"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke="#0EB29A"
              strokeWidth="10"
              strokeOpacity="0.25"
            />
            <line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              stroke="#0EB29A"
              strokeWidth="10"
              strokeOpacity="0.25"
            />
            {/* Concentric nodal ellipse */}
            <ellipse
              cx="50%"
              cy="50%"
              rx="35%"
              ry="35%"
              fill="none"
              stroke="#0EB29A"
              strokeWidth="4"
              strokeDasharray="6 6"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Draggable Components */}
          {components.map((comp) => {
            const isSelected = selectedCompId === comp.id;
            return (
              <div
                key={comp.id}
                onPointerDown={() => handlePointerDown(comp.id)}
                style={{
                  left: `${comp.x}px`,
                  top: `${comp.y}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className={`absolute p-2 rounded-[10px] border flex flex-col items-center justify-center font-mono cursor-grab active:cursor-grabbing transition-shadow z-30 select-none ${
                  isSelected
                    ? isSafe
                      ? "bg-[#1C332E] border-[#4ADE80] text-[#DDF0C2] shadow-[0_0_15px_rgba(74,222,128,0.5)] scale-105"
                      : "bg-[#2D0A0A] border-[#FF4444] text-[#FF8888] shadow-[0_0_15px_rgba(255,68,68,0.5)] scale-105"
                    : "bg-[#15282C] border-[#294044] text-[#8C999A] hover:border-[#3E5556]"
                }`}
              >
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                  <Cpu className="w-3 h-3" />
                  <span>{comp.tag}</span>
                </div>
                <span className="text-[8px] opacity-75 mt-0.5">
                  [{comp.x}, {comp.y}]
                </span>
              </div>
            );
          })}

          <div className="absolute bottom-2 left-3 pointer-events-none text-[9px] font-mono text-[#8C999A]">
            DRAG COMPONENT TOWARD TEAL NODAL CORRIDOR
          </div>
        </div>

        {/* Component Selector Pills */}
        <div className="grid grid-cols-3 gap-2">
          {components.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCompId(c.id)}
              className={`p-2 rounded-[10px] border text-left font-mono transition-all ${
                selectedCompId === c.id
                  ? "bg-[#1C332E] border-[#0EB29A] text-[#F5FDFF]"
                  : "bg-[#15282C] border-[#294044] text-[#8C999A]"
              }`}
            >
              <div className="text-[9px] text-[#0EB29A] font-bold">{c.tag}</div>
              <div className="text-[10px] truncate">{c.name}</div>
            </button>
          ))}
        </div>

        {/* Placement Telemetry Specs */}
        <ChamferedCard className="p-3.5 bg-[#15282C] border-[#294044] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">NODAL OFFSET:</span>
            <span className="text-[#F5FDFF] font-bold">{minDistance} mm</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">ESTIMATED CYCLIC ACCELERATION:</span>
            <span className="text-[#DDF0C2] font-bold">
              {((100 - vibrationScore) * 0.14).toFixed(2)} G RMS
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">SOLDER JOINT FATIGUE LIFETIME:</span>
            <span className={isSafe ? "text-[#4ADE80] font-bold" : "text-[#FF4444] font-bold"}>
              {isSafe ? "> 250,000 CYCLES" : "< 14,000 CYCLES (FAIL)"}
            </span>
          </div>
        </ChamferedCard>

        {/* Proceed CTA */}
        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleProceed}
            className="flex items-center justify-center gap-2"
          >
            <span>VIEW VON MISES STRESS HEATMAP</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}

