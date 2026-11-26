"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Upload,
  Eye,
  Video,
  X,
  Cpu,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { Switch } from "@astryxdesign/core/Switch";
import { useBoundaryDetection } from "@/hooks/useBoundaryDetection";
import { detectBoardHF } from "@/utils/aiClient";
import { preloadVisionModels } from "@/utils/browserHf";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance } from "@/context/autopilot";
import { speak } from "@/utils/voice";

export default function WorkpieceScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const edgeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    polygonCoords,
    isLocked,
    isAutoTracking,
    cameraActive,
    cameraError,
    edgeConfidence,
    aspectRatio,
    areaMm2,
    uploadedImageUrl,
    startVideoTracking,
    setAutoTracking,
    detectOnce,
    detectInRoi,
    setCornersFromAi,
    getLatestCorners,
    processImageFile,
    clearUploadedImage,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  } = useBoundaryDetection();

  const [activePinIndex, setActivePinIndex] = useState<number | null>(null);
  const [showEdgeOverlay, setShowEdgeOverlay] = useState<boolean>(true);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isAiRunning, setIsAiRunning] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [aiEngine, setAiEngine] = useState<string>("On-device CV");
  const autoDetectedRef = useRef<boolean>(false);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  /** Save a small crop of the scanned board so the next screen can guess the material from its colour. */
  const saveThumbnail = (cw: number, ch: number) => {
    try {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const xs = polygonCoords.map((p) => p.x);
      const ys = polygonCoords.map((p) => p.y);
      const bx = Math.max(0, Math.min(...xs));
      const by = Math.max(0, Math.min(...ys));
      const bw = Math.max(20, Math.min(cw, Math.max(...xs)) - bx);
      const bh = Math.max(20, Math.min(ch, Math.max(...ys)) - by);

      let src: CanvasImageSource | null = null;
      let sw = 0;
      let sh = 0;
      if (uploadedImageUrl && previewImgRef.current && previewImgRef.current.naturalWidth > 0) {
        src = previewImgRef.current;
        sw = previewImgRef.current.naturalWidth;
        sh = previewImgRef.current.naturalHeight;
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        src = videoRef.current;
        sw = videoRef.current.videoWidth;
        sh = videoRef.current.videoHeight;
      }
      if (!src || sw === 0 || sh === 0) return;

      // map container (object-cover) coordinates back to source pixels
      const srcRatio = sw / sh;
      const dstRatio = cw / ch;
      let cropX = 0;
      let cropY = 0;
      let cropW = sw;
      let cropH = sh;
      if (srcRatio > dstRatio) {
        cropW = sh * dstRatio;
        cropX = (sw - cropW) / 2;
      } else {
        cropH = sw / dstRatio;
        cropY = (sh - cropH) / 2;
      }
      const k = cropW / cw;
      ctx.drawImage(src, cropX + bx * k, cropY + by * k, bw * k, bh * k, 0, 0, 96, 96);
      localStorage.setItem("harmonix_scan_thumb", c.toDataURL("image/jpeg", 0.8));
    } catch {
      // thumbnail is optional
    }
  };

  useEffect(() => {
    preloadVisionModels();
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      startVideoTracking(videoRef.current, edgeCanvasRef.current, containerRef.current);
    }
  }, [startVideoTracking]);

  // Automation 1: if there's no camera/photo after 4s, load a sample board so users never get stuck
  const userTouchedRef = useRef<boolean>(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!guideOpen && !userTouchedRef.current && !cameraActive && !uploadedImageUrl) {
        handleLoadSamplePcb();
        setScanMessage("No camera found — I loaded a sample board so you can try the app.");
      }
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, uploadedImageUrl, guideOpen]);

  // Automation 0: once the guide is closed and a real board (confidence >= 75) or uploaded photo is present, identify it automatically
  useEffect(() => {
    if (guideOpen || !(uploadedImageUrl || (cameraActive && edgeConfidence >= 75))) return;
    const t = setTimeout(() => {
      if (autoDetectedRef.current) return;
      autoDetectedRef.current = true;
      void handleAutoSegment();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideOpen, cameraActive, uploadedImageUrl, edgeConfidence]);

  // Autopilot: once locked, continue to the next screen automatically
  useAutoAdvance(isLocked && !guideOpen, 2200, () => handleConfirmAndProceed());

  // Automation 2b: for photos/sample boards, lock automatically once confidence is good
  useEffect(() => {
    if (!uploadedImageUrl || isLocked || edgeConfidence < 75) return;
    const t = setTimeout(() => {
      lockBoundary();
      setScanMessage("AI outlined your board. Tap Continue — or Unlock to adjust.");
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImageUrl, edgeConfidence, isLocked]);

  // Automation 2: auto-lock only when confidence >= 84, opposite sides are parallel (<18% skew), and quad stays steady
  const lastPolyRef = useRef<{ x: number; y: number }[] | null>(null);
  const stableCountRef = useRef<number>(0);
  useEffect(() => {
    const topW = Math.hypot(polygonCoords[1].x - polygonCoords[0].x, polygonCoords[1].y - polygonCoords[0].y);
    const botW = Math.hypot(polygonCoords[2].x - polygonCoords[3].x, polygonCoords[2].y - polygonCoords[3].y);
    const leftH = Math.hypot(polygonCoords[3].x - polygonCoords[0].x, polygonCoords[3].y - polygonCoords[0].y);
    const rightH = Math.hypot(polygonCoords[2].x - polygonCoords[1].x, polygonCoords[2].y - polygonCoords[1].y);
    const parallelOk =
      Math.max(topW, botW) > 10 &&
      Math.max(leftH, rightH) > 10 &&
      Math.abs(topW - botW) / Math.max(topW, botW) < 0.18 &&
      Math.abs(leftH - rightH) / Math.max(leftH, rightH) < 0.18;

    if (isLocked || edgeConfidence < 84 || !parallelOk || activePinIndex !== null) {
      stableCountRef.current = 0;
      lastPolyRef.current = polygonCoords;
      return;
    }
    const prev = lastPolyRef.current;
    if (prev && prev.length === polygonCoords.length) {
      const maxDelta = polygonCoords.reduce(
        (m, p, i) => Math.max(m, Math.hypot(p.x - prev[i].x, p.y - prev[i].y)),
        0
      );
      stableCountRef.current = maxDelta < 4 ? stableCountRef.current + 1 : 0;
    }
    lastPolyRef.current = polygonCoords;
    if (stableCountRef.current >= 22) {
      lockBoundary();
      stableCountRef.current = 0;
      setScanMessage("AI locked onto your board automatically. Tap Continue!");
      void speak("Board locked.", { interrupt: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygonCoords, edgeConfidence, isLocked, activePinIndex]);

  const handlePointerDown = (index: number) => {
    userTouchedRef.current = true;
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

  const handleAutoSegment = async () => {
    if (isLocked) unlockBoundary();
    setIsAiRunning(true);
    try {
      // Step A: Instantaneous (<20ms) OBB + Region-Growing + Sobel barrier CV snap
      const snapped = detectOnce();
      const snappedCorners = snapped ? getLatestCorners() : null;
      if (snapped) {
        setAiEngine("OBB + Region-Growing CV");
        setScanMessage("Snapped P1–P4 to workpiece contour. Identifying with Hugging Face…");
      }

      // Step B: Fast Hugging Face MobileViT + Spectral CV classification on <=224px cropped ROI
      if (containerRef.current && (cameraActive || uploadedImageUrl)) {
        const rect = containerRef.current.getBoundingClientRect();
        const cw = Math.round(rect.width) || 360;
        const ch = Math.round(rect.height) || 380;
        const S = 1;
        const snap = document.createElement("canvas");
        snap.width = cw * S;
        snap.height = ch * S;
        const sCtx = snap.getContext("2d");
        if (sCtx) {
          let src: CanvasImageSource | null = null;
          let sw = 0;
          let sh = 0;
          if (uploadedImageUrl) {
            const imgEl = new Image();
            imgEl.src = uploadedImageUrl;
            await new Promise<void>((r) => {
              imgEl.onload = () => r();
              imgEl.onerror = () => r();
            });
            src = imgEl;
            sw = imgEl.naturalWidth;
            sh = imgEl.naturalHeight;
          } else if (videoRef.current && videoRef.current.readyState >= 2) {
            src = videoRef.current;
            sw = videoRef.current.videoWidth;
            sh = videoRef.current.videoHeight;
          }
          if (src && sw > 0 && sh > 0) {
            const srcRatio = sw / sh;
            const dstRatio = cw / ch;
            let sx = 0;
            let sy = 0;
            let cropW = sw;
            let cropH = sh;
            if (srcRatio > dstRatio) {
              cropW = sh * dstRatio;
              sx = (sw - cropW) / 2;
            } else {
              cropH = sw / dstRatio;
              sy = (sh - cropH) / 2;
            }
            sCtx.drawImage(src, sx, sy, cropW, cropH, 0, 0, cw * S, ch * S);

            // Compact <=256x256 full-frame blob for fast Hugging Face YOLOS-Tiny inference
            const fullScale = Math.min(1, 256 / Math.max(cw, ch));
            const fullCanvas = document.createElement("canvas");
            fullCanvas.width = Math.max(64, Math.round(cw * fullScale));
            fullCanvas.height = Math.max(64, Math.round(ch * fullScale));
            const fullCtx = fullCanvas.getContext("2d");
            let fullBlob: Blob | null = null;
            if (fullCtx) {
              fullCtx.drawImage(snap, 0, 0, cw * S, ch * S, 0, 0, fullCanvas.width, fullCanvas.height);
              fullBlob = await new Promise<Blob | null>((r) =>
                fullCanvas.toBlob(r, "image/jpeg", 0.8)
              );
            } else {
              fullBlob = await new Promise<Blob | null>((r) => snap.toBlob(r, "image/jpeg", 0.8));
            }

            let cropBlob: Blob | undefined;
            if (snappedCorners && snappedCorners.length === 4) {
              const xs = snappedCorners.map((p) => p.x);
              const ys = snappedCorners.map((p) => p.y);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const minY = Math.min(...ys);
              const maxY = Math.max(...ys);
              const bw = maxX - minX;
              const bh = maxY - minY;
              const padX = bw * 0.06;
              const padY = bh * 0.06;
              const rx = Math.max(0, Math.round((minX - padX) * S));
              const ry = Math.max(0, Math.round((minY - padY) * S));
              const rw = Math.min(cw * S - rx, Math.round((bw + 2 * padX) * S));
              const rh = Math.min(ch * S - ry, Math.round((bh + 2 * padY) * S));
              if (rw > 20 && rh > 20) {
                const roiScale = Math.min(1, 224 / Math.max(rw, rh));
                const dstW = Math.min(224, Math.max(24, Math.round(rw * roiScale)));
                const dstH = Math.min(224, Math.max(24, Math.round(rh * roiScale)));
                const cropCanvas = document.createElement("canvas");
                cropCanvas.width = dstW;
                cropCanvas.height = dstH;
                const cropCtx = cropCanvas.getContext("2d");
                if (cropCtx) {
                  cropCtx.drawImage(snap, rx, ry, rw, rh, 0, 0, dstW, dstH);
                  const roi = await new Promise<Blob | null>((r) =>
                    cropCanvas.toBlob(r, "image/jpeg", 0.82)
                  );
                  if (roi) cropBlob = roi;
                }
              }
            }

            if (fullBlob) {
              // Only classify material if a real 4-sided workpiece contour was verified by CV (snapped)
              // or if YOLOS object detector returns an explicit foreground object bounding box
              const det = await detectBoardHF(fullBlob, snapped ? cropBlob : undefined);
              if (det && (snapped || det.boxNorm || det.box)) {
                let validObjectFound = snapped;
                if (det.boxNorm) {
                  const roiSnapped = detectInRoi(det.boxNorm);
                  if (roiSnapped) {
                    validObjectFound = true;
                  }
                } else if (!snapped && det.box) {
                  const kx = cw / fullCanvas.width;
                  const ky = ch / fullCanvas.height;
                  const x0 = Math.max(8, Math.round(det.box.xmin * kx));
                  const y0 = Math.max(8, Math.round(det.box.ymin * ky));
                  const x1 = Math.min(cw - 8, Math.round(det.box.xmax * kx));
                  const y1 = Math.min(ch - 8, Math.round(det.box.ymax * ky));
                  if (x1 - x0 > 40 && y1 - y0 > 40 && x1 - x0 < cw * 0.85 && y1 - y0 < ch * 0.85) {
                    setCornersFromAi([
                      { x: x0, y: y0, label: "P1" },
                      { x: x1, y: y0, label: "P2" },
                      { x: x1, y: y1, label: "P3" },
                      { x: x0, y: y1, label: "P4" },
                    ]);
                    validObjectFound = true;
                  }
                }

                if (validObjectFound) {
                  if (typeof window !== "undefined" && det.materialId) {
                    localStorage.setItem("harmonix_hf_material", det.materialId);
                    localStorage.setItem("harmonix_hf_material_label", det.label);
                  }
                  setAiEngine(`Hugging Face · ${det.model.split("/").pop()}`);
                  setScanMessage(
                    `Hugging Face verified "${det.label}" (${Math.round(det.score * 100)}% confidence).`
                  );
                  void speak("I found your board.", { interrupt: false });
                  setTimeout(() => setScanMessage(null), 4000);
                  return;
                }
              }
            }
          }
        }
      }
      setAiEngine("OBB + Region-Growing CV");

      if (!snapped) {
        const found = detectOnce();
        if (found) {
          setScanMessage("OBB region-growing CV snapped P1–P4 to workpiece.");
        } else if (!cameraActive && !uploadedImageUrl) {
          setScanMessage("No camera/photo yet — click SAMPLE or PHOTO below.");
        } else {
          setScanMessage(
            "No physical board or object detected in view — hold your workpiece clearly inside the frame away from walls."
          );
        }
      } else {
        setScanMessage("Workpiece contour snapped (on-device CV).");
      }
      setTimeout(() => setScanMessage(null), 3500);
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleLoadSamplePcb = () => {
    if (isLocked) unlockBoundary();
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 500;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Neutral light-gray workbench background
    ctx.fillStyle = "#E2E8F0";
    ctx.fillRect(0, 0, 480, 500);

    // Slight perspective PCB rectangle
    ctx.fillStyle = "#0F5132";
    ctx.beginPath();
    ctx.moveTo(75, 85);
    ctx.lineTo(410, 72);
    ctx.lineTo(422, 420);
    ctx.lineTo(62, 412);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Copper traces & IC chips
    ctx.strokeStyle = "#20C997";
    ctx.lineWidth = 2;
    for (let y = 130; y < 370; y += 35) {
      ctx.beginPath();
      ctx.moveTo(105, y);
      ctx.lineTo(375, y);
      ctx.stroke();
    }
    // BGA MCU
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(190, 195, 95, 95);
    ctx.fillStyle = "#CBD5E1";
    ctx.font = "bold 12px monospace";
    ctx.fillText("MCU-BGA", 210, 246);
    // Crystal
    ctx.fillStyle = "#94A3B8";
    ctx.fillRect(120, 140, 44, 24);
    // Mounting holes
    ctx.fillStyle = "#EAB308";
    [[95, 105], [388, 95], [398, 398], [85, 390]].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    c.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "sample-pcb.png", { type: "image/png" });
        processImageFile(file);
        setScanMessage("Sample FR4 PCB loaded — Sobel CV extracted P1–P4 automatically.");
        setTimeout(() => setScanMessage(null), 3500);
      }
    }, "image/png");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    userTouchedRef.current = true;
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
      setScanMessage("Image loaded — Sobel edge contour extracted.");
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  const handleConfirmAndProceed = () => {
    lockBoundary();
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_boundary", JSON.stringify(polygonCoords));
      localStorage.setItem("harmonix_plate_area", String(areaMm2));
      localStorage.setItem("harmonix_aspect_ratio", String(aspectRatio));
      const cRect = containerRef.current?.getBoundingClientRect();
      if (cRect && cRect.width > 0 && cRect.height > 0) {
        // Normalised outline + frame aspect so the AR view can overlay it exactly where it was scanned
        localStorage.setItem("harmonix_scan_aspect", String(cRect.width / cRect.height));
        localStorage.setItem(
          "harmonix_boundary_norm",
          JSON.stringify(polygonCoords.map((p) => ({ x: p.x / cRect.width, y: p.y / cRect.height })))
        );
        saveThumbnail(cRect.width, cRect.height);
      }
    }
    router.push("/material");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col select-none transition-colors duration-200">
      <HudHeader
        title="Scan Your Board"
        step="SCREEN 02 // 10"
        subtitle="Point at your board — AI finds the edges automatically."
        backHref="/setup"
      />

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* AR Viewport Frame */}
        <div
          ref={containerRef}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative w-full h-[380px] bg-slate-200 dark:bg-[#101F23] rounded-[16px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center cursor-crosshair touch-none shadow-sm"
        >
          {/* Live camera stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              uploadedImageUrl ? "hidden" : cameraActive ? "opacity-90" : "opacity-20"
            }`}
          />

          {/* Uploaded image fallback */}
          {uploadedImageUrl && (
            <img
              src={uploadedImageUrl}
              alt="Workpiece target"
              ref={previewImgRef}
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
          )}

          {/* Real-time Sobel CV Edge Detection Overlay */}
          <canvas
            ref={edgeCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity ${
              showEdgeOverlay ? "opacity-80" : "opacity-0"
            }`}
          />

          {/* AR grid */}
          <div className="absolute inset-0 ar-grid-bg opacity-35 dark:opacity-25 pointer-events-none" />

          {/* No-camera helper */}
          {!cameraActive && !uploadedImageUrl && (
            <div className="z-10 text-center px-6 py-3 bg-white/90 dark:bg-[#0D191C]/90 rounded-[12px] border border-slate-300 dark:border-[#294044] max-w-[260px] shadow-sm">
              <Video className="w-5 h-5 text-sky-600 dark:text-[#0EB29A] mx-auto mb-1" />
              <div className="text-[11px] font-mono font-bold text-slate-900 dark:text-[#F5FDFF]">
                {cameraError ? "CAMERA UNAVAILABLE" : "INITIALIZING OPTICS..."}
              </div>
              <p className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mt-0.5">
                Upload a PCB/plate photo below or drag P1–P4 manually.
              </p>
            </div>
          )}

          {/* Advanced AR Boundary Reticle Overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <linearGradient id="arScanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isLocked ? "#4ADE80" : "#0284C7"} stopOpacity="0.22" />
                <stop offset="100%" stopColor={isLocked ? "#0EB29A" : "#38BDF8"} stopOpacity="0.06" />
              </linearGradient>
            </defs>
            <polygon
              points={polygonCoords.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="url(#arScanGrad)"
              className={
                isLocked
                  ? "stroke-emerald-500 dark:stroke-[#4ADE80]"
                  : "stroke-sky-500 dark:stroke-[#0EB29A]"
              }
              strokeWidth="2"
              strokeDasharray={isLocked ? "none" : "6 4"}
            />
            {/* Precision L-bracket corner reticles at P1..P4 */}
            {polygonCoords.map((pt, idx) => {
              const prev = polygonCoords[(idx + 3) % 4];
              const next = polygonCoords[(idx + 1) % 4];
              const d1x = prev.x - pt.x;
              const d1y = prev.y - pt.y;
              const l1 = Math.hypot(d1x, d1y) || 1;
              const d2x = next.x - pt.x;
              const d2y = next.y - pt.y;
              const l2 = Math.hypot(d2x, d2y) || 1;
              const arm = 16;
              const p1x = pt.x + (d1x / l1) * arm;
              const p1y = pt.y + (d1y / l1) * arm;
              const p2x = pt.x + (d2x / l2) * arm;
              const p2y = pt.y + (d2y / l2) * arm;
              return (
                <path
                  key={`bracket-${idx}`}
                  d={`M ${p1x} ${p1y} L ${pt.x} ${pt.y} L ${p2x} ${p2y}`}
                  fill="none"
                  stroke={isLocked ? "#22C55E" : "#38BDF8"}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>

          {/* Compact Precision Corner Handles */}
          {polygonCoords.map((pt, idx) => (
            <div
              key={idx}
              onPointerDown={() => handlePointerDown(idx)}
              style={{
                left: `${pt.x}px`,
                top: `${pt.y}px`,
                transform: "translate(-50%, -50%)",
              }}
              className={`absolute w-6 h-6 rounded-full flex items-center justify-center font-mono text-[9px] font-extrabold cursor-grab active:cursor-grabbing transition-transform ring-2 ring-white/80 dark:ring-[#0D191C]/80 ${
                activePinIndex === idx ? "scale-125 z-30" : "z-20"
              } ${
                isLocked
                  ? "bg-emerald-600 text-white shadow-md dark:bg-[#4ADE80] dark:text-[#0D191C]"
                  : "bg-sky-600 text-white shadow-md dark:bg-[#0EB29A] dark:text-[#0D191C]"
              }`}
            >
              P{idx + 1}
            </div>
          ))}

          {/* Top Bar: Non-overlapping Status Pill + Viewport Controls */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2 z-20 pointer-events-none">
            <HudBadge
              variant={
                isLocked
                  ? "safe"
                  : uploadedImageUrl || (cameraActive && edgeConfidence > 0)
                  ? "teal"
                  : "warning"
              }
              dot
              className="max-w-[70%] truncate backdrop-blur-md"
            >
              {isLocked
                ? `LOCKED • ${edgeConfidence}%`
                : uploadedImageUrl
                ? `IMAGE CV • ${edgeConfidence}%`
                : cameraActive
                ? edgeConfidence === 0
                  ? "AIM AT BOARD"
                  : isAutoTracking
                  ? `AI TRACKING • ${edgeConfidence}%`
                  : "MANUAL PINS"
                : "MANUAL MODE"}
            </HudBadge>

            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setShowEdgeOverlay((v) => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
                  showEdgeOverlay
                    ? "bg-sky-600/90 border-sky-400 text-white dark:bg-[#0EB29A]/90 dark:border-[#0EB29A] dark:text-[#0D191C]"
                    : "bg-white/85 dark:bg-[#0D191C]/85 border-slate-300 dark:border-[#294044] text-slate-700 dark:text-[#8C999A]"
                }`}
                title="Toggle Sobel Edge Overlay"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={resetDefaultBoundary}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/85 dark:bg-[#0D191C]/85 backdrop-blur-md border border-slate-300 dark:border-[#294044] text-slate-700 dark:text-[#F5FDFF]"
                title="Reset Pins"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {uploadedImageUrl && (
                <button
                  type="button"
                  onClick={clearUploadedImage}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/85 dark:bg-[#0D191C]/85 backdrop-blur-md border border-slate-300 dark:border-[#294044] text-slate-700 dark:text-[#F5FDFF]"
                  title="Clear Photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom-Left Geometry Readout (never overlaps P1) */}
          <div className="absolute bottom-2.5 left-2.5 z-20 pointer-events-none bg-white/90 dark:bg-[#0D191C]/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-200 dark:border-[#294044] text-[10px] font-mono text-slate-600 dark:text-[#8C999A] shadow-xs">
            RATIO <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{aspectRatio}:1</span> ·{" "}
            <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">{areaMm2} mm²</span>
          </div>
        </div>

        <TestGuide kind="scan" open={guideOpen} onDone={() => setGuideOpen(false)} />

        {/* Professional AI Pipeline Telemetry Pill */}
        <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-white dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-xs shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-sky-500 dark:bg-[#0EB29A] animate-pulse shrink-0" />
            <span className="font-semibold text-slate-700 dark:text-[#F5FDFF] truncate">
              AI Pipeline: <span className="text-sky-700 dark:text-[#0EB29A]">{aiEngine}</span>
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-[#8C999A] shrink-0">
            {edgeConfidence}% conf
          </span>
        </div>
        {scanMessage && (
          <div className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-[#15282C] border border-sky-200 dark:border-[#0EB29A]/50 text-xs font-medium text-sky-900 dark:text-[#DDF0C2]">
            {scanMessage}
          </div>
        )}

        {/* Uniform Action Controls Bar (2x2 on mobile, 4-across on wider screens so labels never clip) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <HudButton
            variant="secondary"
            size="md"
            fullWidth
            isLoading={isAiRunning}
            onClick={handleAutoSegment}
          >
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-[#DDF0C2] shrink-0" />
            <span>AI Snap</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleLoadSamplePcb}
          >
            <Cpu className="w-4 h-4 text-emerald-600 dark:text-[#4ADE80] shrink-0" />
            <span>Sample</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 text-sky-600 dark:text-[#0EB29A] shrink-0" />
            <span>Photo</span>
          </HudButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <HudButton
            variant={isLocked ? "safe" : "secondary"}
            size="md"
            fullWidth
            onClick={isLocked ? unlockBoundary : lockBoundary}
          >
            {isLocked ? (
              <>
                <Unlock className="w-4 h-4 text-emerald-600 dark:text-inherit shrink-0" />
                <span>Unlock</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-sky-600 dark:text-[#0EB29A] shrink-0" />
                <span>Lock</span>
              </>
            )}
          </HudButton>
        </div>

        {/* Live CV Auto-Track Switch (Astryx Switch) */}
        {cameraActive && !uploadedImageUrl && !isLocked && (
          <div className="px-3.5 py-2.5 bg-white dark:bg-[#15282C] rounded-2xl border border-slate-200 dark:border-[#294044]">
            <Switch
              label="Continuous Live AI Edge Tracking"
              labelPosition="start"
              labelSpacing="spread"
              width="100%"
              size="sm"
              value={isAutoTracking}
              onChange={(checked: boolean) => setAutoTracking(checked)}
            />
          </div>
        )}

        {/* Geometric Telemetry Card */}
        <ChamferedCard className="p-3.5 space-y-2">
          <div className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider flex items-center justify-between font-semibold">
            <span>EDGE VECTOR COORDINATES</span>
            <span className="text-sky-600 dark:text-[#0EB29A]">SOBEL QUAD FIT</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            {polygonCoords.map((pt, i) => (
              <div
                key={i}
                className="p-2 bg-slate-50 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D] flex justify-between"
              >
                <span className="text-slate-500 dark:text-[#8C999A]">PIN P{i + 1}:</span>
                <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">
                  [{pt.x}, {pt.y}]
                </span>
              </div>
            ))}
          </div>
        </ChamferedCard>

        {/* Bottom CTA to proceed */}
        <div className="pt-1 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleConfirmAndProceed}
            className="flex items-center justify-center gap-2"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
