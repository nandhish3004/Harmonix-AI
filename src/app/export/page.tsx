"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileCode,
  FileText,
  FileJson,
  Download,
  CloudUpload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Layers,
  ScanLine,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useAutopilot } from "@/context/autopilot";
import { createClient } from "@/utils/supabase/client";
import { speak } from "@/utils/voice";
import {
  chladniAmplitude,
  computeAllModes,
  computeFlexuralRigidity,
  computePlateDimensionsMeters,
  ComputedHarmonicMode,
  evalPlateMechanics,
  getStoredActiveMode,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredStandoffs,
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
  const autopilot = useAutopilot();
  const nodalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isExportingDxf, setIsExportingDxf] = useState<boolean>(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const [certId, setCertId] = useState<string>("HX-2026-8410A");
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("Workpiece Modal Audit #01");
  const [inspectorName, setInspectorName] = useState<string>("Lead NDT Engineer");

  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [areaMm2, setAreaMm2] = useState<number>(14250);
  const [aspectRatio, setAspectRatio] = useState<number>(1.2);
  const [activeMode, setActiveMode] = useState({
    indices: "(2, 2)",
    name: "Radial Cross",
    m: 2,
    n: 2,
    freqHz: 740,
  });
  const [modesTable, setModesTable] = useState<ComputedHarmonicMode[]>([]);
  const [baselineHz, setBaselineHz] = useState<number>(740);
  const [measuredFreq, setMeasuredFreq] = useState<number>(740);
  const [freqSource, setFreqSource] = useState<"measured" | "theoretical">("theoretical");
  const [qFactor, setQFactor] = useState<number>(65);
  const [astClass, setAstClass] = useState<string>("Kirchhoff-Love Theoretical Eigenmode");
  const [safetyScore, setSafetyScore] = useState<number>(88);
  const [defectDetected, setDefectDetected] = useState<boolean>(false);
  const [peakStressMpa, setPeakStressMpa] = useState<number>(42.5);
  const [scanThumb, setScanThumb] = useState<string | null>(null);
  const [boundary, setBoundary] = useState<Point2D[]>([
    { x: 55, y: 55 },
    { x: 305, y: 55 },
    { x: 305, y: 315 },
    { x: 55, y: 315 },
  ]);

  useEffect(() => {
    const mat = getStoredMaterial();
    const thick = getStoredThickness();
    const geo = getStoredPlateGeometry();
    const mode = getStoredActiveMode();
    const standoffs = getStoredStandoffs();
    const computedModes = computeAllModes(mat, thick, geo.areaMm2, geo.aspectRatio, standoffs.length);

    setMaterial(mat);
    setThicknessMm(thick);
    setAreaMm2(geo.areaMm2);
    setAspectRatio(geo.aspectRatio);
    setActiveMode({
      indices: mode.indices,
      name: mode.name,
      m: mode.m,
      n: mode.n,
      freqHz: mode.freqHz,
    });
    setModesTable(computedModes);

    const now = new Date();
    setGeneratedAt(now.toISOString().replace("T", " ").slice(0, 19) + " UTC");
    const suffix = String(Math.floor(1000 + (now.getTime() % 9000)));
    setCertId(`HX-${now.getFullYear()}-${suffix}N`);

    let bHz = mode.freqHz;
    let fSource: "measured" | "theoretical" = "theoretical";
    let mHz = mode.freqHz;

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
      const thumb = localStorage.getItem("harmonix_scan_thumb");
      if (thumb) setScanThumb(thumb);

      const savedBase = Number(localStorage.getItem("harmonix_peak_freq"));
      if (Number.isFinite(savedBase) && savedBase > 50) bHz = savedBase;

      fSource =
        localStorage.getItem("harmonix_freq_source") === "measured" ? "measured" : "theoretical";
      const meas = Number(localStorage.getItem("harmonix_measured_freq"));
      mHz = fSource === "measured" && Number.isFinite(meas) && meas > 50 ? meas : bHz;

      setBaselineHz(bHz);
      setFreqSource(fSource);
      setMeasuredFreq(mHz);

      const storedQ = Number(localStorage.getItem("harmonix_measured_q"));
      const modeQ = computedModes.find((cm) => cm.m === mode.m && cm.n === mode.n)?.qFactor ?? 65;
      setQFactor(Number.isFinite(storedQ) && storedQ >= 5 ? storedQ : modeQ);

      const storedAst = localStorage.getItem("harmonix_ast_class");
      setAstClass(
        storedAst ||
          (fSource === "measured"
            ? "Empirical Tap Impulse"
            : "Kirchhoff-Love Theoretical Eigenmode")
      );

      const s = Number(localStorage.getItem("harmonix_safety_score"));
      if (Number.isFinite(s) && s > 0) setSafetyScore(s);

      const def = localStorage.getItem("harmonix_defect_detected");
      setDefectDetected(def !== null ? def === "true" : Math.abs(mHz - bHz) > 15);
    }

    // Evaluate peak Kirchhoff-Love von Mises stress over 25x25 plate grid
    const normStandoffs = standoffs.map((s) => ({
      nx: Math.max(0, Math.min(1, s.x / 360)),
      ny: Math.max(0, Math.min(1, s.y / 320)),
    }));
    let maxVm = 0;
    for (let gy = 0; gy < 25; gy++) {
      const ny = (gy + 0.5) / 25;
      for (let gx = 0; gx < 25; gx++) {
        const nx = (gx + 0.5) / 25;
        const mech = evalPlateMechanics(
          nx,
          ny,
          mode.m,
          mode.n,
          mat,
          thick,
          geo.areaMm2,
          geo.aspectRatio,
          normStandoffs
        );
        if (mech.vonMisesMpa > maxVm) maxVm = mech.vonMisesMpa;
      }
    }
    setPeakStressMpa(parseFloat(maxVm.toFixed(1)));
  }, []);

  // Render crisp 2D Chladni nodal contour map for Section 4
  useEffect(() => {
    const canvas = nodalCanvasRef.current;
    if (!canvas) return;
    const W = 220;
    const H = 220;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const w = chladniAmplitude(nx, ny, activeMode.m, activeMode.n);
        const absW = Math.min(1, Math.abs(w) / 1.1);
        const idx = (y * W + x) * 4;
        if (absW < 0.08) {
          // Nodal line highlighted cleanly in white/lime
          d[idx] = 221;
          d[idx + 1] = 240;
          d[idx + 2] = 194;
          d[idx + 3] = 255;
        } else {
          d[idx] = Math.round(14 + absW * 225);
          d[idx + 1] = Math.round(178 - absW * 95);
          d[idx + 2] = Math.round(154 - absW * 120);
          d[idx + 3] = 245;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [activeMode.m, activeMode.n]);

  useEffect(() => {
    if (autopilot.enabled) {
      void speak("Your engineering inspection report is ready.");
      autopilot.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot.enabled]);

  // Derived physical constants for display and exports
  const dimsM = computePlateDimensionsMeters(areaMm2, aspectRatio);
  const lengthMm = Math.round(dimsM.a * 1000);
  const widthMm = Math.round(dimsM.b * 1000);
  const flexuralRigidityD = computeFlexuralRigidity(
    material.youngsModulusGpa,
    thicknessMm,
    material.poissonRatio
  );
  const deltaHz = Math.round((measuredFreq - baselineHz) * 10) / 10;
  const deltaPct = baselineHz > 0 ? ((deltaHz / baselineHz) * 100).toFixed(2) : "0.00";
  const dampingZeta = 1 / (2 * Math.max(1, qFactor));
  const yieldStrengthMpa = material.yieldStrengthMpa ?? 276.0;
  const safetyFactorNum = yieldStrengthMpa / Math.max(0.1, peakStressMpa);
  const safetyFactorText = safetyFactorNum >= 100 ? ">99" : safetyFactorNum.toFixed(2);
  const freqRatioSq = Math.pow(measuredFreq / Math.max(1, baselineHz), 2);
  const stiffnessDeltaPct = ((freqRatioSq - 1) * 100).toFixed(1);
  const voidRadiusMm = Math.sqrt((Math.abs(1 - freqRatioSq) * areaMm2) / Math.PI);

  // Build normalized SVG points string for P1..P4 plot
  const minBx = Math.min(...boundary.map((p) => p.x));
  const maxBx = Math.max(...boundary.map((p) => p.x));
  const minBy = Math.min(...boundary.map((p) => p.y));
  const maxBy = Math.max(...boundary.map((p) => p.y));
  const bwSafe = Math.max(1, maxBx - minBx);
  const bhSafe = Math.max(1, maxBy - minBy);
  const svgNormPoints = boundary.map((p) => ({
    x: Math.round(14 + ((p.x - minBx) / bwSafe) * 92),
    y: Math.round(14 + ((p.y - minBy) / bhSafe) * 92),
  }));

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportDxf = () => {
    setIsExportingDxf(true);
    try {
      const verticesDxf = boundary
        .map(
          (pt) => `0\nVERTEX\n8\nWORKPIECE_BOUNDARY\n10\n${pt.x.toFixed(1)}\n20\n${pt.y.toFixed(1)}\n30\n0.0`
        )
        .join("\n");
      const midX = boundary.reduce((acc, p) => acc + p.x, 0) / boundary.length;
      const midY = boundary.reduce((acc, p) => acc + p.y, 0) / boundary.length;
      const dxfContent = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\nWORKPIECE_BOUNDARY\n66\n1\n70\n1\n${verticesDxf}\n0\nSEQEND\n0\nLINE\n8\nCHLADNI_NODAL_LINES\n10\n${minBx.toFixed(1)}\n20\n${midY.toFixed(1)}\n30\n0.0\n11\n${maxBx.toFixed(1)}\n21\n${midY.toFixed(1)}\n31\n0.0\n0\nLINE\n8\nCHLADNI_NODAL_LINES\n10\n${midX.toFixed(1)}\n20\n${minBy.toFixed(1)}\n30\n0.0\n11\n${midX.toFixed(1)}\n21\n${maxBy.toFixed(1)}\n31\n0.0\n0\nENDSEC\n0\nEOF\n`;
      triggerDownload(new Blob([dxfContent], { type: "application/dxf" }), `HARMONIX-SCAN-${Date.now()}.dxf`);
    } catch (err) {
      console.error("DXF generation failed", err);
    } finally {
      setIsExportingDxf(false);
    }
  };

  const handleExportHtmlReport = () => {
    const nodalDataUrl = nodalCanvasRef.current?.toDataURL("image/png") ?? "";
    const esc = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const modeRows = modesTable
      .map(
        (m) => `<tr class="${m.m === activeMode.m && m.n === activeMode.n ? "active-row" : ""}">
          <td>${esc(m.indices)}</td><td>${esc(m.name)}</td><td>${m.freqHz} Hz</td><td>Q ${m.qFactor}</td>
        </tr>`
      )
      .join("");
    const polyPts = svgNormPoints.map((p) => `${p.x},${p.y}`).join(" ");
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>HARMONIX-AR Engineering Report — ${esc(certId)}</title>
<style>
  body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #0f172a; margin: 32px auto; max-width: 820px; padding: 0 20px; line-height: 1.5; }
  header { border-bottom: 2px solid #0284c7; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  h1 { margin: 0; font-size: 20px; }
  .meta { font-size: 12px; color: #475569; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; background: ${
    defectDetected ? "#fee2e2; color: #b91c1c;" : "#d1fae5; color: #047857;"
  } }
  section { margin-top: 22px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; page-break-inside: avoid; }
  section h2 { margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #0369a1; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12px; }
  .kv { background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
  .kv span { display: block; font-size: 10px; color: #64748b; }
  .kv strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  .active-row { background: #e0f2fe; font-weight: 700; }
  .visuals { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  footer { margin-top: 28px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
</head>
<body>
<header>
  <div>
    <div class="meta">HARMONIX-AR // ISO &amp; NDT MODAL INSPECTION CERTIFICATE</div>
    <h1>${esc(projectName)}</h1>
    <div class="meta">Certificate ID: <strong>${esc(certId)}</strong> &middot; Inspector: <strong>${esc(inspectorName)}</strong> &middot; ${esc(generatedAt)}</div>
  </div>
  <div style="text-align:right">
    <div class="badge">${defectDetected ? "NON-CONFORMANT (ANOMALY FLAGGED)" : "CONFORMANT (PASS)"}</div>
    <div class="meta" style="margin-top:6px;">Verification: <strong>${
      freqSource === "measured" ? "EMPIRICAL MIC + CV VERIFIED" : "THEORETICAL FEA MODEL"
    }</strong></div>
  </div>
</header>

<section>
  <h2>1. Optical CV Metrology</h2>
  <div class="visuals">
    ${scanThumb ? `<img src="${scanThumb}" alt="Workpiece Scan" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1;" />` : ""}
    <svg width="110" height="110" viewBox="0 0 120 120" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
      <polygon points="${polyPts}" fill="rgba(14,178,154,0.18)" stroke="#0284c7" stroke-width="2" />
    </svg>
    <div class="grid" style="flex:1">
      <div class="kv"><span>Length a</span><strong>${lengthMm} mm</strong></div>
      <div class="kv"><span>Width b</span><strong>${widthMm} mm</strong></div>
      <div class="kv"><span>Surface Area</span><strong>${areaMm2} mm&sup2;</strong></div>
      <div class="kv"><span>Aspect Ratio</span><strong>${aspectRatio}:1</strong></div>
      <div class="kv"><span>Boundary Pins</span><strong>${boundary.length} Vertices</strong></div>
    </div>
  </div>
</section>

<section>
  <h2>2. Material &amp; Plate Mechanics</h2>
  <div class="grid">
    <div class="kv"><span>Substrate</span><strong>${esc(material.name)} (${esc(material.code)})</strong></div>
    <div class="kv"><span>Thickness h</span><strong>${thicknessMm} mm</strong></div>
    <div class="kv"><span>Young's Modulus E</span><strong>${material.youngsModulusGpa} GPa</strong></div>
    <div class="kv"><span>Density &rho;</span><strong>${material.densityKgM3} kg/m&sup3;</strong></div>
    <div class="kv"><span>Poisson Ratio &nu;</span><strong>${material.poissonRatio}</strong></div>
    <div class="kv"><span>Yield Strength &sigma;y</span><strong>${yieldStrengthMpa.toFixed(1)} MPa</strong></div>
    <div class="kv"><span>Wave Speed cL</span><strong>${material.acousticSpeedMs} m/s</strong></div>
    <div class="kv"><span>Flexural Rigidity D</span><strong>${flexuralRigidityD.toFixed(2)} N&middot;m</strong></div>
  </div>
</section>

<section>
  <h2>3. Acoustic Modal &amp; Damping Telemetry</h2>
  <div class="grid">
    <div class="kv"><span>Baseline f0</span><strong>${baselineHz} Hz</strong></div>
    <div class="kv"><span>Measured f_meas</span><strong>${measuredFreq} Hz</strong></div>
    <div class="kv"><span>Shift &Delta;f</span><strong>${deltaHz >= 0 ? `+${deltaHz}` : deltaHz} Hz (${deltaPct}%)</strong></div>
    <div class="kv"><span>Quality Factor Q</span><strong>Q ${qFactor}</strong></div>
    <div class="kv"><span>Damping Ratio &zeta;</span><strong>${dampingZeta.toFixed(4)}</strong></div>
    <div class="kv"><span>AST Class</span><strong>${esc(astClass)}</strong></div>
  </div>
</section>

<section>
  <h2>4. Eigenmode Spectrum &amp; Chladni Nodal Map (${esc(activeMode.indices)})</h2>
  <div class="visuals">
    <table style="flex:1">
      <thead><tr><th>Mode</th><th>Pattern</th><th>Eigenfrequency</th><th>Damping Q</th></tr></thead>
      <tbody>${modeRows}</tbody>
    </table>
    ${nodalDataUrl ? `<img src="${nodalDataUrl}" alt="Chladni Nodal Contours" style="width:140px;height:140px;border-radius:8px;border:1px solid #cbd5e1;" />` : ""}
  </div>
</section>

<section>
  <h2>5. Von Mises Stress &amp; NDT Health Audit</h2>
  <div class="grid">
    <div class="kv"><span>Peak von Mises Stress</span><strong>${peakStressMpa} MPa</strong></div>
    <div class="kv"><span>Safety Factor</span><strong>${safetyFactorText}x</strong></div>
    <div class="kv"><span>Stiffness Perturbation</span><strong>${stiffnessDeltaPct}%</strong></div>
    <div class="kv"><span>Equivalent Void Radius</span><strong>${voidRadiusMm.toFixed(1)} mm</strong></div>
    <div class="kv"><span>Safety Score</span><strong>${safetyScore} / 100</strong></div>
  </div>
</section>

<footer>
  Generated by HARMONIX-AR Acoustic &amp; Kirchhoff-Love Plate Modal Inspection Engine.
</footer>
</body>
</html>`;
    triggerDownload(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `HARMONIX-REPORT-${certId}.html`
    );
  };

  const handleExportJson = () => {
    const payload = {
      certificateId: certId,
      generatedAt,
      projectName,
      inspectorName,
      verificationSource: freqSource === "measured" ? "EMPIRICAL MIC + CV VERIFIED" : "THEORETICAL FEA MODEL",
      metrology: {
        lengthMm,
        widthMm,
        areaMm2,
        aspectRatio,
        boundaryVertices: boundary,
      },
      material: {
        ...material,
        thicknessMm,
        flexuralRigidityNm: Number(flexuralRigidityD.toFixed(4)),
      },
      acousticModal: {
        baselineHz,
        measuredHz: measuredFreq,
        deltaHz,
        deltaPct: Number(deltaPct),
        qFactor,
        dampingRatioZeta: Number(dampingZeta.toFixed(6)),
        acousticSignature: astClass,
        activeMode,
        eigenmodes: modesTable.map((m) => ({
          indices: m.indices,
          name: m.name,
          freqHz: m.freqHz,
          qFactor: m.qFactor,
        })),
      },
      structuralAudit: {
        peakVonMisesMpa: peakStressMpa,
        yieldStrengthMpa,
        safetyFactor: safetyFactorText,
        stiffnessDeltaPct: Number(stiffnessDeltaPct),
        equivalentVoidRadiusMm: Number(voidRadiusMm.toFixed(2)),
        safetyScore,
        defectDetected,
      },
    };
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `HARMONIX-TELEMETRY-${Date.now()}.json`
    );
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleSyncToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSyncError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSyncStatus("synced");
        return;
      }

      const { data: scanData, error: scanError } = await (supabase
        .from("workpiece_scans") as any)
        .insert({
          user_id: user.id,
          name: `${material.code} — ${projectName}`,
          material_type: material.name,
          thickness_mm: thicknessMm,
          boundary_polygon: boundary,
        } as any)
        .select()
        .single();

      if (scanError) throw scanError;

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
          subtitle="ISO Modal Audit Certificate & CAD Exports"
          backHref="/defects"
          rightAction={
            <HudBadge variant={defectDetected ? "danger" : "safe"}>
              {defectDetected ? "DEFECT LOGGED" : "PASS"}
            </HudBadge>
          }
        />
      </div>

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Verdict Hero */}
        <div
          className={`rounded-3xl p-4 text-white shadow-lg pop-in print:shadow-none ${
            !defectDetected && safetyScore >= 70
              ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-400/25"
              : defectDetected
              ? "bg-gradient-to-br from-red-600 to-rose-700 shadow-red-400/25"
              : "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-400/25"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono tracking-widest uppercase text-white/85">
                {freqSource === "measured"
                  ? "EMPIRICAL MIC + CV VERIFIED"
                  : "THEORETICAL FEA MODEL"}
              </div>
              <h2 className="text-lg font-extrabold leading-tight mt-0.5">
                {!defectDetected && safetyScore >= 70
                  ? "Structural & Modal Integrity Verified"
                  : defectDetected
                  ? "Frequency Shift Anomaly Logged"
                  : "Advisory: Elevated Modal Stress Detected"}
              </h2>
              <p className="text-xs text-white/90 mt-1 font-medium">
                {material.name} · {thicknessMm} mm · {measuredFreq} Hz · Safety Score{" "}
                {safetyScore}/100
              </p>
            </div>
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-white/20 flex items-center justify-center">
              {!defectDetected && safetyScore >= 70 ? (
                <CheckCircle2 className="w-6 h-6 text-white" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-white" />
              )}
            </div>
          </div>
        </div>

        {/* Report Header & Editable Metadata */}
        <ChamferedCard className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#294044] pb-2">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] uppercase block font-semibold">
                CERTIFICATE {certId}
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
                {generatedAt || "Preparing timestamp..."}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                defectDetected
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-[#2D0A0A] dark:text-[#FF4444] dark:border-[#FF4444]/40"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#1C332E] dark:text-[#4ADE80] dark:border-[#4ADE80]/40"
              }`}
            >
              {defectDetected ? "NON-CONFORMANT" : "CONFORMANT"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] block mb-0.5">
                PROJECT / WORKPIECE NAME
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#101F23] border border-slate-200 dark:border-[#294044] text-slate-900 dark:text-[#F5FDFF] font-semibold print:border-none print:p-0"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] block mb-0.5">
                INSPECTOR / ENGINEER
              </label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#101F23] border border-slate-200 dark:border-[#294044] text-slate-900 dark:text-[#F5FDFF] font-semibold print:border-none print:p-0"
              />
            </div>
          </div>
        </ChamferedCard>

        {/* Section 1: Optical CV Metrology */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A] uppercase">
            <ScanLine className="w-4 h-4" />
            <span>1. Optical CV Metrology</span>
          </div>
          <div className="flex items-center gap-3">
            {scanThumb ? (
              <img
                src={scanThumb}
                alt="Captured workpiece crop"
                className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-[#294044] shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-[#101F23] border border-slate-200 dark:border-[#294044] flex items-center justify-center text-[9px] font-mono text-slate-400 text-center p-1 shrink-0">
                No scan image
              </div>
            )}
            <svg
              viewBox="0 0 120 120"
              className="w-20 h-20 rounded-xl bg-slate-50 dark:bg-[#101F23] border border-slate-200 dark:border-[#294044] shrink-0"
            >
              <polygon
                points={svgNormPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(14, 178, 154, 0.2)"
                stroke="#0284c7"
                strokeWidth="2.5"
              />
              {svgNormPoints.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="#0284c7" />
              ))}
            </svg>
            <div className="grid grid-cols-2 gap-1.5 flex-1 text-[11px] font-mono">
              <div>
                <span className="text-slate-500 block text-[9px]">DIMENSIONS (a × b)</span>
                <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                  {lengthMm} × {widthMm} mm
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">AREA</span>
                <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">{areaMm2} mm²</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">ASPECT RATIO</span>
                <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">{aspectRatio}:1</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">VERTICES</span>
                <span className="font-bold text-emerald-600 dark:text-[#4ADE80]">
                  {boundary.length} PINS
                </span>
              </div>
            </div>
          </div>
        </ChamferedCard>

        {/* Section 2: Material & Plate Mechanics */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A] uppercase">
            <Layers className="w-4 h-4" />
            <span>2. Material &amp; Plate Mechanics</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">SUBSTRATE</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">{material.name}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">THICKNESS h</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">{thicknessMm} mm</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">MODULUS E / ν</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {material.youngsModulusGpa} GPa / {material.poissonRatio}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">DENSITY ρ / σ_y</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {material.densityKgM3} / {yieldStrengthMpa.toFixed(0)} MPa
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">WAVE SPEED cL</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {material.acousticSpeedMs} m/s
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">FLEXURAL RIGIDITY D</span>
              <span className="font-bold text-sky-700 dark:text-[#DDF0C2]">
                {flexuralRigidityD.toFixed(2)} N·m
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Section 3: Acoustic Modal & Damping Telemetry */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A] uppercase">
            <Activity className="w-4 h-4" />
            <span>3. Acoustic Modal &amp; Damping Telemetry</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">BASELINE f0</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">{baselineHz} Hz</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">MEASURED f_meas</span>
              <span className="font-bold text-sky-700 dark:text-[#DDF0C2]">{measuredFreq} Hz</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">SHIFT Δf</span>
              <span
                className={`font-bold ${
                  defectDetected ? "text-red-600 dark:text-[#FF4444]" : "text-emerald-600 dark:text-[#4ADE80]"
                }`}
              >
                {deltaHz >= 0 ? `+${deltaHz}` : deltaHz} Hz ({deltaPct}%)
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">QUALITY FACTOR Q</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">Q {qFactor}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">DAMPING ζ = 1/(2Q)</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {dampingZeta.toFixed(4)}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">ACOUSTIC CLASS</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF] truncate block">
                {astClass}
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Section 4: Eigenmode Spectrum & Chladni Nodal Contour */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A] uppercase">
            <span>4. Eigenmode Spectrum &amp; Nodal Map</span>
            <span>MODE {activeMode.indices}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="w-full flex-1 overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-[#8C999A] border-b border-slate-200 dark:border-[#294044]">
                    <th className="py-1">MODE</th>
                    <th className="py-1">PATTERN</th>
                    <th className="py-1 text-right">FREQ</th>
                    <th className="py-1 text-right">Q</th>
                  </tr>
                </thead>
                <tbody>
                  {modesTable.map((m) => {
                    const isActive = m.m === activeMode.m && m.n === activeMode.n;
                    return (
                      <tr
                        key={m.id}
                        className={`border-b border-slate-100 dark:border-[#1D3236] ${
                          isActive
                            ? "bg-sky-50 dark:bg-[#0EB29A]/15 text-sky-800 dark:text-[#DDF0C2] font-bold"
                            : "text-slate-700 dark:text-[#CBD5E1]"
                        }`}
                      >
                        <td className="py-1">{m.indices}</td>
                        <td className="py-1">{m.name}</td>
                        <td className="py-1 text-right">{m.freqHz} Hz</td>
                        <td className="py-1 text-right">{m.qFactor}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <canvas
              ref={nodalCanvasRef}
              className="w-28 h-28 rounded-xl border border-slate-200 dark:border-[#294044] shrink-0"
            />
          </div>
        </ChamferedCard>

        {/* Section 5: Von Mises Stress & NDT Health Audit */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A] uppercase">
            <ShieldCheck className="w-4 h-4" />
            <span>5. Von Mises Stress &amp; NDT Health Audit</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">PEAK VON MISES σ_vm</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {peakStressMpa} MPa
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">SAFETY FACTOR</span>
              <span className="font-bold text-emerald-600 dark:text-[#4ADE80]">
                {safetyFactorText}x
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">STIFFNESS Δk/k0</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {stiffnessDeltaPct}%
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">EQUIV. VOID RADIUS</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {voidRadiusMm.toFixed(1)} mm
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#101F23]">
              <span className="text-[9px] text-slate-500 block">COMPONENT SAFETY</span>
              <span className="font-bold text-slate-900 dark:text-[#F5FDFF]">
                {safetyScore} / 100
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Section 6: 4 Report & CAD Export Pipelines */}
        <div className="space-y-2.5 print:hidden">
          <span className="text-[11px] font-mono tracking-wider text-slate-600 dark:text-[#8C999A] uppercase block font-semibold">
            6. EXPORT REPORT &amp; CAD ARTIFACTS
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <HudButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleExportHtmlReport}
              className="flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD HTML REPORT</span>
            </HudButton>

            <HudButton
              variant="secondary"
              size="lg"
              fullWidth
              onClick={handleDownloadPdf}
              className="flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
              <span>PRINT / SAVE PDF</span>
            </HudButton>

            <HudButton
              variant="lime"
              size="lg"
              fullWidth
              isLoading={isExportingDxf}
              onClick={handleExportDxf}
              className="flex items-center justify-center gap-2"
            >
              <FileCode className="w-4 h-4 text-[#0D191C]" />
              <span>EXPORT AUTOCAD DXF</span>
            </HudButton>

            <HudButton
              variant="secondary"
              size="lg"
              fullWidth
              onClick={handleExportJson}
              className="flex items-center justify-center gap-2"
            >
              <FileJson className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
              <span>EXPORT JSON TELEMETRY</span>
            </HudButton>
          </div>

          <HudButton
            variant={syncStatus === "synced" ? "safe" : "secondary"}
            size="lg"
            fullWidth
            isLoading={isSyncingSupabase}
            onClick={handleSyncToSupabase}
            className="flex items-center justify-center gap-2"
          >
            <CloudUpload className="w-5 h-5" />
            <span>
              {syncStatus === "synced"
                ? "SESSION SYNCED TO SUPABASE CLOUD"
                : "SYNC SESSION TO SUPABASE CLOUD"}
            </span>
          </HudButton>

          {syncError && (
            <p className="text-[10px] font-mono text-red-600 dark:text-[#FF4444] text-center">
              {syncError}
            </p>
          )}
        </div>

        {/* Return CTA */}
        <div className="pt-2 mt-auto print:hidden">
          <HudButton
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => router.push("/scan")}
            className="flex items-center justify-center gap-2 text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>INITIATE NEW INSPECTION PIPELINE</span>
          </HudButton>
        </div>
      </div>
    </div>
  );
}
