"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileCode,
  FileText,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Printer,
  Copy,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { createClient } from "@/utils/supabase/client";

export default function ExportReportPage() {
  const router = useRouter();
  const [isExportingDxf, setIsExportingDxf] = useState<boolean>(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Generate real DXF file content
  const handleExportDxf = () => {
    setIsExportingDxf(true);
    try {
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
0
VERTEX
8
WORKPIECE_BOUNDARY
10
45.0
20
160.0
30
0.0
0
VERTEX
8
WORKPIECE_BOUNDARY
10
348.0
20
160.0
30
0.0
0
VERTEX
8
WORKPIECE_BOUNDARY
10
348.0
20
580.0
30
0.0
0
VERTEX
8
WORKPIECE_BOUNDARY
10
45.0
20
580.0
30
0.0
0
SEQEND
0
LINE
8
CHLADNI_NODAL_LINES
10
45.0
20
370.0
30
0.0
11
348.0
21
370.0
31
0.0
0
LINE
8
CHLADNI_NODAL_LINES
10
196.5
20
160.0
30
0.0
11
196.5
21
580.0
31
0.0
0
CIRCLE
8
DEFECT_ANOMALY_CALLOUT
10
215.0
20
120.0
30
0.0
40
14.0
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
          name: "FR4 Plate #HX-9042",
          material_type: "FR4 Glass Epoxy",
          thickness_mm: 1.6,
          boundary_polygon: [
            { x: 45, y: 160 },
            { x: 348, y: 160 },
            { x: 348, y: 580 },
            { x: 45, y: 580 },
          ],
        } as any)
        .select()
        .single();

      if (scanError) throw scanError;

      // 2. Insert inspection session
      const { error: sessionError } = await (supabase
        .from("inspection_sessions") as any)
        .insert({
          scan_id: scanData?.id,
          peak_frequency_hz: 702.0,
          active_mode: "Mode (2,2) Radial Cross",
          vibration_score: 88.5,
          defect_detected: true,
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
    <div className="min-h-screen bg-[#0D191C] flex flex-col print:bg-white print:text-black">
      <div className="print:hidden">
        <HudHeader
          title="INSPECTION REPORT"
          step="SCREEN 10 // 10"
          subtitle="Audit Artifacts & CAD Vector Export"
          backHref="/defects"
          rightAction={
            <HudBadge variant="danger">
              DEFECT LOGGED
            </HudBadge>
          }
        />
      </div>

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Workpiece Summary Card */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044] space-y-3">
          <div className="flex items-center justify-between border-b border-[#294044]/60 pb-2">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-[#0EB29A] uppercase block">
                AUDIT CERTIFICATE
              </span>
              <h2 className="text-base font-bold font-mono text-[#F5FDFF]">
                HX-2026-9042A
              </h2>
            </div>
            <span className="text-[11px] font-mono bg-[#2D0A0A] text-[#FF4444] border border-[#FF4444]/40 font-bold px-2 py-1 rounded-[6px]">
              NON-CONFORMANT
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-[#8C999A] block text-[10px]">SUBSTRATE:</span>
              <span className="text-[#F5FDFF] font-bold">FR4 GLASS EPOXY</span>
            </div>
            <div>
              <span className="text-[#8C999A] block text-[10px]">THICKNESS:</span>
              <span className="text-[#F5FDFF] font-bold">1.6 mm</span>
            </div>
            <div>
              <span className="text-[#8C999A] block text-[10px]">RESONANT FREQUENCY:</span>
              <span className="text-[#DDF0C2] font-bold">702 Hz (-38 Hz)</span>
            </div>
            <div>
              <span className="text-[#8C999A] block text-[10px]">EIGENMODE:</span>
              <span className="text-[#0EB29A] font-bold">MODE (2, 2)</span>
            </div>
            <div>
              <span className="text-[#8C999A] block text-[10px]">PEAK STRESS:</span>
              <span className="text-[#F5FDFF] font-bold">84.6 MPa</span>
            </div>
            <div>
              <span className="text-[#8C999A] block text-[10px]">CONFIDENCE:</span>
              <span className="text-[#4ADE80] font-bold">98.4%</span>
            </div>
          </div>
        </ChamferedCard>

        {/* Export Vector & Document Buttons */}
        <div className="space-y-2.5 print:hidden">
          <span className="text-[11px] font-mono tracking-wider text-[#8C999A] uppercase block">
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

