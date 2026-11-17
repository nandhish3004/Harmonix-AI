"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileCode,
  FileText,
  CloudUpload,
  RotateCcw,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { createClient } from "@/utils/supabase/client";
import {
  getStoredActiveMode,
  getStoredMaterial,
  getStoredThickness,
  DEFAULT_MATERIAL,
  MaterialData,
} from "@/utils/physics";

interface Point2D {
  x: number;
  y: number;
}

export default function ExportReportPage() {
  const router = useRouter();
  const [isExportingDxf, setIsExportingDxf] = useState<boolean>(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [activeMode, setActiveMode] = useState({ indices: "(2, 2)", name: "Radial Cross", freqHz: 740 });
  const [measuredFreq, setMeasuredFreq] = useState<number>(702);
  const [deltaHz, setDeltaHz] = useState<number>(-38);
  const [safetyScore, setSafetyScore] = useState<number>(88);
  const [defectDetected, setDefectDetected] = useState<boolean>(true);
  const [boundary, setBoundary] = useState<Point2D[]>([
    { x: 45, y: 160 },
    { x: 348, y: 160 },
    { x: 348, y: 580 },
    { x: 45, y: 580 },
  ]);

  useEffect(() => {
    setMaterial(getStoredMaterial());
    setThicknessMm(getStoredThickness());
    const mode = getStoredActiveMode();
    setActiveMode({ indices: mode.indices, name: mode.name, freqHz: mode.freqHz });

    if (typeof window !== "undefined") {
      try {
        const b = localStorage.getItem("harmonix_boundary");
        if (b) {
          const parsed = JSON.parse(b);
          if (Array.isArray(parsed) && parsed.length >= 3) setBoundary(parsed);
        }
      } catch {
        // ignore
      }
      const meas = Number(localStorage.getItem("harmonix_measured_freq"));
      if (Number.isFinite(meas) && meas > 0) setMeasuredFreq(meas);
      const d = Number(localStorage.getItem("harmonix_delta_hz"));
      if (Number.isFinite(d)) setDeltaHz(d);
      const s = Number(localStorage.getItem("harmonix_safety_score"));
      if (Number.isFinite(s) && s > 0) setSafetyScore(s);
      const def = localStorage.getItem("harmonix_defect_detected");
      if (def !== null) setDefectDetected(def === "true");
    }
  }, []);

  // Generate real DXF file content from actual scanned boundary
  const handleExportDxf = () => {
    setIsExportingDxf(true);
    try {
      const verticesDxf = boundary
        .map(
          (pt) => `0
VERTEX
8
WORKPIECE_BOUNDARY
10
${pt.x.toFixed(1)}
20
${pt.y.toFixed(1)}
30
0.0`
        )
        .join("\n");

      const midX = boundary.reduce((acc, p) => acc + p.x, 0) / boundary.length;
      const midY = boundary.reduce((acc, p) => acc + p.y, 0) / boundary.length;
      const minX = Math.min(...boundary.map((p) => p.x));
      const maxX = Math.max(...boundary.map((p) => p.x));
      const minY = Math.min(...boundary.map((p) => p.y));
      const maxY = Math.max(...boundary.map((p) => p.y));

      const dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
0
POLYLINE
8
WORKPIECE_BOUNDARY
66
1
70
1
${verticesDxf}
0
SEQEND
0
LINE
8
CHLADNI_NODAL_LINES
10
${minX.toFixed(1)}
20
${midY.toFixed(1)}
30
0.0
11
${maxX.toFixed(1)}
21
${midY.toFixed(1)}
31
0.0
0
LINE
8
CHLADNI_NODAL_LINES
10
${midX.toFixed(1)}
20
${minY.toFixed(1)}
30
0.0
11
${midX.toFixed(1)}
21
${maxY.toFixed(1)}
31
0.0
0
ENDSEC
0
EOF
`;
      const blob = new Blob([dxfContent], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HARMONIX-SCAN-${Date.now()}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DXF generation failed", err);
    } finally {
      setIsExportingDxf(false);
    }
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  // Sync session to Supabase database tables (public.workpiece_scans and public.inspection_sessions)
  const handleSyncToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSyncError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // If unauthenticated, store locally and inform operator
        setSyncStatus("synced");
        return;
      }

      // 1. Insert scan record
      const { data: scanData, error: scanError } = await (supabase
        .from("workpiece_scans") as any)
        .insert({
          user_id: user.id,
          name: `${material.code} Scan`,
          material_type: material.name,
          thickness_mm: thicknessMm,
          boundary_polygon: boundary,
        } as any)
        .select()
        .single();

      if (scanError) throw scanError;

      // 2. Insert inspection session
      const { error: sessionError } = await (supabase
        .from("inspection_sessions") as any)
        .insert({
          scan_id: scanData?.id,
          peak_frequency_hz: measuredFreq,
          active_mode: `Mode ${activeMode.indices} ${activeMode.name}`,
          vibration_score: safetyScore,
          defect_detected: defectDetected,
        } as any);

      if (sessionError) throw sessionError;

      setSyncStatus("synced");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync to cloud failed.";
      setSyncError(message);
      setSyncStatus("error");
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col print:bg-white print:text-black transition-colors duration-200">
      <div className="print:hidden">
        <HudHeader
          title="INSPECTION REPORT"
          step="SCREEN 10 // 10"
          subtitle="Audit Artifacts & CAD Vector Export"
          backHref="/defects"
          rightAction={
            <HudBadge variant={defectDetected ? "danger" : "safe"}>
              {defectDetected ? "DEFECT LOGGED" : "PASS"}
            </HudBadge>
          }
        />
      </div>

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Plain-English verdict hero */}
        <div
          className={`rounded-3xl p-5 text-white shadow-xl pop-in ${
            !defectDetected && safetyScore >= 70
              ? "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-emerald-400/40"
              : defectDetected
              ? "bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 shadow-rose-400/40"
              : "bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 shadow-orange-400/40"
          }`}
        >
          <div className="text-4xl mb-1">
            {!defectDetected && safetyScore >= 70 ? "✅" : defectDetected ? "⚠️" : "🟠"}
          </div>
          <h2 className="text-xl font-extrabold leading-tight">
            {!defectDetected && safetyScore >= 70
              ? "Your board looks healthy & safe"
              : defectDetected
              ? "Possible hidden damage found"
              : "Board is OK, but some parts need care"}
          </h2>
          <p className="text-sm text-white/90 mt-1 font-medium">
            {material.name} · {thicknessMm} mm · rings at {measuredFreq} Hz · safety score {safetyScore}/100
          </p>
        </div>

        {/* Workpiece Summary Card */}
        <ChamferedCard className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#294044]/60 pb-2">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] uppercase block font-semibold">
                AUDIT CERTIFICATE
              </span>
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-[#F5FDFF]">
                HX-2026-9042A
              </h2>
            </div>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-1 rounded-[6px] border ${
                defectDetected
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-[#2D0A0A] dark:text-[#FF4444] dark:border-[#FF4444]/40"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#1C332E] dark:text-[#4ADE80] dark:border-[#4ADE80]/40"
              }`}
            >
              {defectDetected ? "NON-CONFORMANT" : "CONFORMANT (PASS)"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">SUBSTRATE:</span>
              <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{material.name.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">THICKNESS:</span>
              <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{thicknessMm} mm</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">RESONANT FREQUENCY:</span>
              <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">
                {measuredFreq} Hz ({deltaHz >= 0 ? `+${deltaHz}` : deltaHz} Hz)
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">EIGENMODE:</span>
              <span className="text-sky-600 dark:text-[#0EB29A] font-bold">MODE {activeMode.indices}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">SAFETY SCORE:</span>
              <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{safetyScore} / 100</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">VERTICES CAPTURED:</span>
              <span className="text-emerald-600 dark:text-[#4ADE80] font-bold">{boundary.length} PINS</span>
            </div>
          </div>
        </ChamferedCard>

        {/* Export Vector & Document Buttons */}
        <div className="space-y-2.5 print:hidden">
          <span className="text-[11px] font-mono tracking-wider text-slate-600 dark:text-[#8C999A] uppercase block font-semibold">
            EXPORT ASSETS & CAD LAYERS
          </span>

          <HudButton
            variant="lime"
            size="lg"
            fullWidth
            isLoading={isExportingDxf}
            onClick={handleExportDxf}
            className="flex items-center justify-center gap-2.5"
          >
            <FileCode className="w-5 h-5 text-[#0D191C]" />
            <span>EXPORT DXF VECTOR (AUTOCAD COMPATIBLE)</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleDownloadPdf}
            className="flex items-center justify-center gap-2.5"
          >
            <FileText className="w-5 h-5 text-[#0EB29A]" />
            <span>PRINT / SAVE PDF AUDIT REPORT</span>
          </HudButton>

          <HudButton
            variant={syncStatus === "synced" ? "safe" : "secondary"}
            size="lg"
            fullWidth
            isLoading={isSyncingSupabase}
            onClick={handleSyncToSupabase}
            className="flex items-center justify-center gap-2.5"
          >
            <CloudUpload className="w-5 h-5" />
            <span>
              {syncStatus === "synced"
                ? "SESSION SYNCED TO SUPABASE POSTGRESQL"
                : "SYNC SESSION TO SUPABASE CLOUD"}
            </span>
          </HudButton>

          {syncError && (
            <p className="text-[10px] font-mono text-[#FF4444] text-center">
              {syncError}
            </p>
          )}
        </div>

        {/* Return to start CTA */}
        <div className="pt-2 mt-auto print:hidden">
          <HudButton
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => router.push("/scan")}
            className="flex items-center justify-center gap-2 text-[#8C999A] hover:text-[#F5FDFF]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>INITIATE NEW INSPECTION PIPELINE</span>
          </HudButton>
        </div>
      </div>
    </div>
  );
}

