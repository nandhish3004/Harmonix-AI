"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Maximize2,
  Lock,
  Unlock,
  RefreshCw,
  ArrowRight,
  Crosshair,
  Layers,
  Sparkles,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useBoundaryDetection } from "@/hooks/useBoundaryDetection";

export default function WorkpieceScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    polygonCoords,
    isLocked,
    aspectRatio,
    areaMm2,
    startVideoTracking,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  } = useBoundaryDetection();

  const [activePinIndex, setActivePinIndex] = useState<number | null>(null);
  const [isAutoSegmenting, setIsAutoSegmenting] = useState<boolean>(false);

  useEffect(() => {
    if (videoRef.current) {
      startVideoTracking(videoRef.current);
    }
  }, [startVideoTracking]);

  // Touch and drag handler for AR corner pins P1-P4
  const handlePointerDown = (index: number) => {
    if (isLocked) return;
    setActivePinIndex(index);
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePinIndex === null || isLocked || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(rect.width - 10, e.clientX - rect.left));
    const y = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));
    updateCornerPoint(activePinIndex, Math.round(x), Math.round(y));
  };

  const handlePointerUp = () => {
    setActivePinIndex(null);
  };

  const handleAutoSegment = () => {
    setIsAutoSegmenting(true);
    setTimeout(() => {
      // Automatic edge detection snap simulation
      updateCornerPoint(0, 35, 140);
      updateCornerPoint(1, 350, 140);
      updateCornerPoint(2, 350, 480);
      updateCornerPoint(3, 35, 480);
      setIsAutoSegmenting(false);
    }, 800);
  };

  const handleConfirmAndProceed = () => {
    lockBoundary();
    // Save detected boundary polygon to localStorage for pipeline continuity
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_boundary", JSON.stringify(polygonCoords));
      localStorage.setItem("harmonix_plate_area", String(areaMm2));
    }
    router.push("/material");
  };

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col select-none">
      <HudHeader
        title="EDGE DETECTION"
        step="SCREEN 02 // 10"
        subtitle="Workpiece Boundary Segmentation"
        backHref="/setup"
        rightAction={
          <button
            onClick={resetDefaultBoundary}
            className="p-2 rounded-[8px] bg-[#15282C] border border-[#294044] text-[#8C999A] hover:text-[#F5FDFF]"
            title="Reset Pins"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* AR Viewport Frame */}
        <div
          ref={containerRef}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full h-[400px] bg-[#101F23] rounded-[16px] border border-[#294044] overflow-hidden flex items-center justify-center cursor-crosshair touch-none"
        >
          {/* Real or Mock camera video stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />

          {/* AR grid & center reticle */}
          <div className="absolute inset-0 ar-grid-bg opacity-40 pointer-events-none" />

          {/* Center alignment crosshair */}
          <div className="absolute w-8 h-8 pointer-events-none flex items-center justify-center">
            <div className="w-full h-[1px] bg-[#0EB29A]/50" />
            <div className="h-full w-[1px] bg-[#0EB29A]/50 absolute" />
            <div className="w-3 h-3 rounded-full border border-[#0EB29A] absolute" />
          </div>

          {/* SVG Polygon overlay connecting P1 -> P2 -> P3 -> P4 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon
              points={polygonCoords.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(14, 178, 154, 0.12)"
              stroke={isLocked ? "#4ADE80" : "#0EB29A"}
              strokeWidth="2"
              strokeDasharray={isLocked ? "none" : "4 4"}
            />
          </svg>

          {/* Draggable Corner Pins */}
          {polygonCoords.map((pt, idx) => (
            <div
              key={idx}
              onPointerDown={() => handlePointerDown(idx)}
              style={{
                left: `${pt.x}px`,
                top: `${pt.y}px`,
                transform: "translate(-50%, -50%)",
              }}
              className={`absolute w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold cursor-grab active:cursor-grabbing transition-transform ${
                activePinIndex === idx ? "scale-125 z-30" : "z-20"
              } ${
                isLocked
                  ? "bg-[#4ADE80] text-[#0D191C] shadow-[0_0_10px_rgba(74,222,128,0.5)]"
                  : "bg-[#0EB29A] text-[#0D191C] shadow-[0_0_12px_rgba(14,178,154,0.6)]"
              }`}
            >
              P{idx + 1}
            </div>
          ))}

          {/* Live Floating Telemetry Overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <HudBadge variant={isLocked ? "safe" : "teal"} dot>
              {isLocked ? "POLYGON LOCKED" : "SDF TRACKING ACTIVE"}
            </HudBadge>
            <div className="bg-[#0D191C]/80 backdrop-blur-md px-2.5 py-1 rounded-[8px] border border-[#294044] text-[10px] font-mono text-[#8C999A]">
              RATIO: <span className="text-[#F5FDFF] font-bold">{aspectRatio}:1</span> // AREA:{" "}
              <span className="text-[#DDF0C2] font-bold">{areaMm2} mm²</span>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 pointer-events-none">
            <span className="text-[10px] font-mono text-[#8C999A] bg-[#0D191C]/80 px-2 py-1 rounded border border-[#294044]">
              DRAG P1-P4 TO FIT
            </span>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="grid grid-cols-2 gap-3">
          <HudButton
            variant="secondary"
            size="md"
            onClick={handleAutoSegment}
            isLoading={isAutoSegmenting}
            className="flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#DDF0C2]" />
            <span>AUTO-SEGMENT</span>
          </HudButton>

          <HudButton
            variant={isLocked ? "safe" : "secondary"}
            size="md"
            onClick={isLocked ? unlockBoundary : lockBoundary}
            className="flex items-center justify-center gap-2"
          >
            {isLocked ? (
              <>
                <Unlock className="w-4 h-4" />
                <span>UNLOCK</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-[#0EB29A]" />
                <span>LOCK EDGES</span>
              </>
            )}
          </HudButton>
        </div>

        {/* Geometric Telemetry Card */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044] space-y-2">
          <div className="text-xs font-mono text-[#8C999A] uppercase tracking-wider flex items-center justify-between">
            <span>EDGE VECTOR COORDINATES</span>
            <span className="text-[#0EB29A]">OPENCV CONTOUR FIT</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            {polygonCoords.map((pt, i) => (
              <div
                key={i}
                className="p-2 bg-[#101F23] rounded-[8px] border border-[#233A3D] flex justify-between"
              >
                <span className="text-[#8C999A]">PIN P{i + 1}:</span>
                <span className="text-[#F5FDFF] font-bold">
                  [{pt.x}, {pt.y}]
                </span>
              </div>
            ))}
          </div>
        </ChamferedCard>

        {/* Bottom CTA to proceed */}
        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleConfirmAndProceed}
            className="flex items-center justify-center gap-2"
          >
            <span>CONFIRM GEOMETRY → SELECT MATERIAL</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}

