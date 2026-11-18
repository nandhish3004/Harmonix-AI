"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface Point2D {
  x: number;
  y: number;
  label?: string;
}

export interface BoundaryDetectionState {
  polygonCoords: Point2D[];
  isLocked: boolean;
  isCalibrating: boolean;
  isAutoTracking: boolean;
  cameraActive: boolean;
  cameraError: string | null;
  edgeConfidence: number;
  aspectRatio: number;
  areaMm2: number;
  uploadedImageUrl: string | null;
  startVideoTracking: (
    videoElement: HTMLVideoElement,
    overlayCanvas?: HTMLCanvasElement | null,
    containerElement?: HTMLDivElement | null
  ) => Promise<void>;
  stopVideoTracking: () => void;
  setAutoTracking: (enabled: boolean) => void;
  detectOnce: () => boolean;
  processImageFile: (file: File) => void;
  clearUploadedImage: () => void;
  lockBoundary: () => void;
  unlockBoundary: () => void;
  updateCornerPoint: (index: number, x: number, y: number) => void;
  resetDefaultBoundary: () => void;
}

const DEFAULT_CORNERS: Point2D[] = [
  { x: 55, y: 55, label: "P1" },
  { x: 305, y: 55, label: "P2" },
  { x: 305, y: 315, label: "P3" },
  { x: 55, y: 315, label: "P4" },
];

/** Compute polygon area via Shoelace formula and bounding aspect ratio. */
function computeQuadMetrics(pts: Point2D[]): { aspectRatio: number; areaMm2: number } {
  if (pts.length < 4) return { aspectRatio: 1.0, areaMm2: 0 };
  let areaPx = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    areaPx += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  areaPx = Math.abs(areaPx) * 0.5;

  const topW = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const botW = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const leftH = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const rightH = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);

  const avgW = (topW + botW) * 0.5;
  const avgH = (leftH + rightH) * 0.5;
  const aspectRatio = avgH > 1 ? parseFloat((avgW / avgH).toFixed(2)) : 1.0;
  // Calibrated scale factor (~0.18 mm²/px² at standard working distance)
  const areaMm2 = Math.round(areaPx * 0.18);
  return { aspectRatio, areaMm2 };
}

/**
 * Pure TypeScript / Canvas Computer Vision:
 * Grayscale -> 3x3 Box/Gaussian Blur -> Sobel Edge Gradient -> Adaptive Threshold
 * -> Extremal Quadrilateral Corner Detection (P1..P4) + Optional Edge Overlay
 */
export function detectQuadFromSource(
  source: HTMLVideoElement | HTMLImageElement,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  overlayCanvas: HTMLCanvasElement | null,
  workCanvas: HTMLCanvasElement
): { corners: Point2D[] | null; confidence: number } {
  if (srcWidth === 0 || srcHeight === 0 || targetWidth === 0 || targetHeight === 0) {
    return { corners: null, confidence: 0 };
  }

  // Processing resolution for fast real-time CV
  const procW = 200;
  const procH = Math.max(120, Math.round((targetHeight / targetWidth) * procW));
  workCanvas.width = procW;
  workCanvas.height = procH;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { corners: null, confidence: 0 };

  // Draw source with object-cover crop matching the viewport
  const srcRatio = srcWidth / srcHeight;
  const dstRatio = procW / procH;
  let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight;
  if (srcRatio > dstRatio) {
    sw = srcHeight * dstRatio;
    sx = (srcWidth - sw) * 0.5;
  } else {
    sh = srcWidth / dstRatio;
    sy = (srcHeight - sh) * 0.5;
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, procW, procH);

  const imgData = ctx.getImageData(0, 0, procW, procH);
  const data = imgData.data;
  const total = procW * procH;

  // 1. Grayscale luminance + outer-border background color estimation
  const gray = new Float32Array(total);
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const i = y * procW + x;
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      if (y < 6 || y >= procH - 6 || x < 6 || x >= procW - 6) {
        bgR += r;
        bgG += g;
        bgB += b;
        bgCount++;
      }
    }
  }
  if (bgCount > 0) {
    bgR /= bgCount;
    bgG /= bgCount;
    bgB /= bgCount;
  }

  // 2. 3x3 Gaussian-weighted blur to suppress noise
  const blurred = new Float32Array(total);
  for (let y = 1; y < procH - 1; y++) {
    for (let x = 1; x < procW - 1; x++) {
      const i = y * procW + x;
      blurred[i] =
        (gray[i - procW - 1] + 2 * gray[i - procW] + gray[i - procW + 1] +
          2 * gray[i - 1] + 4 * gray[i] + 2 * gray[i + 1] +
          gray[i + procW - 1] + 2 * gray[i + procW] + gray[i + procW + 1]) /
        16;
    }
  }

  // 3. Sobel Edge Magnitude
  const mag = new Float32Array(total);
  let sumMag = 0;
  let maxMag = 0;
  const margin = 4;

  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const i = y * procW + x;
      const gx =
        -blurred[i - procW - 1] + blurred[i - procW + 1] -
        2 * blurred[i - 1] + 2 * blurred[i + 1] -
        blurred[i + procW - 1] + blurred[i + procW + 1];
      const gy =
        -blurred[i - procW - 1] - 2 * blurred[i - procW] - blurred[i - procW + 1] +
        blurred[i + procW - 1] + 2 * blurred[i + procW] + blurred[i + procW + 1];
      const rawMag = Math.abs(gx) + Math.abs(gy);

      // Combine gradient magnitude with border-contrast saliency and reject skin tones
      const dIdx = i * 4;
      const r = data[dIdx];
      const g = data[dIdx + 1];
      const b = data[dIdx + 2];
      const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      const isSkin =
        r > 95 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r - g > 15 &&
        r - b > 15 &&
        Math.abs(r - g) < 110;
      const m = isSkin ? rawMag * 0.35 : rawMag + colorDist * 0.22;

      mag[i] = m;
      sumMag += m;
      if (m > maxMag) maxMag = m;
    }
  }

  const meanMag = sumMag / total;
  const threshold = Math.max(68, meanMag * 2.7);

  // 4. Build binary edge mask (dilated 1px) so broken object borders connect cleanly
  const edgeMask = new Uint8Array(total);
  const dilated = new Uint8Array(total);
  let edgeCount = 0;
  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const i = y * procW + x;
      if (mag[i] >= threshold) {
        edgeMask[i] = 1;
        edgeCount++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            dilated[(y + dy) * procW + (x + dx)] = 1;
          }
        }
      }
    }
  }

  if (edgeCount < 30) {
    return { corners: null, confidence: Math.min(25, edgeCount) };
  }

  // 5. Connected-component labeling (BFS) to isolate foreground workpiece from room/tile background
  const visited = new Uint8Array(total);
  const cxFrame = procW * 0.5;
  const cyFrame = procH * 0.5;
  const queue = new Int32Array(total);

  let bestScore = -1;
  let bestCorners: Point2D[] | null = null;
  let bestPixels: number[] = [];

  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const start = y * procW + x;
      if (!dilated[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      const compPixels: number[] = [];
      let minX = procW, maxX = 0, minY = procH, maxY = 0;
      let sumX = 0, sumY = 0;
      let minSum = Infinity, maxSum = -Infinity;
      let minDiff = Infinity, maxDiff = -Infinity;
      let p1x = 0, p1y = 0, p2x = 0, p2y = 0, p3x = 0, p3y = 0, p4x = 0, p4y = 0;

      while (head < tail) {
        const idx = queue[head++];
        const px = idx % procW;
        const py = (idx - px) / procW;

        if (edgeMask[idx]) {
          compPixels.push(idx);
          sumX += px;
          sumY += py;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          const s = px + py;
          const d = px - py;
          if (s < minSum) { minSum = s; p1x = px; p1y = py; }
          if (d > maxDiff) { maxDiff = d; p2x = px; p2y = py; }
          if (s > maxSum) { maxSum = s; p3x = px; p3y = py; }
          if (d < minDiff) { minDiff = d; p4x = px; p4y = py; }
        }

        // 8-neighbors
        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < margin || ny >= procH - margin) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            if (nx < margin || nx >= procW - margin) continue;
            const nIdx = ny * procW + nx;
            if (dilated[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue[tail++] = nIdx;
            }
          }
        }
      }

      if (compPixels.length < 28) continue;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const boxArea = bw * bh;
      const frameArea = procW * procH;
      // Reject tiny noise or full-frame background spans (> 78% of frame)
      if (boxArea < frameArea * 0.04 || boxArea > frameArea * 0.78) continue;

      const centroidX = sumX / compPixels.length;
      const centroidY = sumY / compPixels.length;
      const distToCenter = Math.hypot(centroidX - cxFrame, centroidY - cyFrame) / Math.hypot(cxFrame, cyFrame);
      const centrality = Math.max(0.15, 1.0 - distToCenter * 1.15);
      const score = compPixels.length * centrality;

      if (score > bestScore) {
        bestScore = score;
        bestPixels = compPixels;
        const scaleX = targetWidth / procW;
        const scaleY = targetHeight / procH;
        bestCorners = [
          { x: Math.round(p1x * scaleX), y: Math.round(p1y * scaleY), label: "P1" },
          { x: Math.round(p2x * scaleX), y: Math.round(p2y * scaleY), label: "P2" },
          { x: Math.round(p3x * scaleX), y: Math.round(p3y * scaleY), label: "P3" },
          { x: Math.round(p4x * scaleX), y: Math.round(p4y * scaleY), label: "P4" },
        ];
      }
    }
  }

  // Render overlay highlighting the locked foreground object edges
  if (overlayCanvas) {
    overlayCanvas.width = procW;
    overlayCanvas.height = procH;
    const overlayCtx = overlayCanvas.getContext("2d");
    if (overlayCtx) {
      const overlayData = overlayCtx.createImageData(procW, procH);
      for (let i = 0; i < total; i++) {
        if (edgeMask[i]) {
          const oIdx = i * 4;
          overlayData.data[oIdx] = 14;
          overlayData.data[oIdx + 1] = 178;
          overlayData.data[oIdx + 2] = 154;
          overlayData.data[oIdx + 3] = 95;
        }
      }
      for (const idx of bestPixels) {
        const oIdx = idx * 4;
        overlayData.data[oIdx] = 52;
        overlayData.data[oIdx + 1] = 211;
        overlayData.data[oIdx + 2] = 153;
        overlayData.data[oIdx + 3] = 245;
      }
      overlayCtx.putImageData(overlayData, 0, 0);
    }
  }

  if (!bestCorners) {
    return { corners: null, confidence: 28 };
  }

  const confidence = Math.min(99, Math.round(62 + (bestPixels.length / total) * 520));
  return { corners: bestCorners, confidence };
}

export function useBoundaryDetection(): BoundaryDetectionState {
  const [polygonCoords, setPolygonCoords] = useState<Point2D[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("harmonix_boundary");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 4) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return DEFAULT_CORNERS;
  });

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [isAutoTracking, setIsAutoTracking] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [edgeConfidence, setEdgeConfidence] = useState<number>(0);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const metrics = computeQuadMetrics(polygonCoords);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadedImgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isLockedRef = useRef(isLocked);
  const isAutoTrackingRef = useRef(isAutoTracking);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);
  useEffect(() => {
    isAutoTrackingRef.current = isAutoTracking;
  }, [isAutoTracking]);

  const getWorkCanvas = useCallback(() => {
    if (!workCanvasRef.current && typeof document !== "undefined") {
      workCanvasRef.current = document.createElement("canvas");
    }
    return workCanvasRef.current;
  }, []);

  const updateCornerPoint = useCallback((index: number, x: number, y: number) => {
    if (isLockedRef.current) return;
    // Manual drag pauses auto-tracking so CV doesn't fight the user's fingers
    setIsAutoTracking(false);
    setPolygonCoords((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], x, y };
      }
      return next;
    });
  }, []);

  const lockBoundary = useCallback(() => {
    setIsLocked(true);
    setIsAutoTracking(false);
  }, []);

  const unlockBoundary = useCallback(() => {
    setIsLocked(false);
  }, []);

  const resetDefaultBoundary = useCallback(() => {
    setPolygonCoords(DEFAULT_CORNERS);
    setIsLocked(false);
  }, []);

  const detectOnce = useCallback((): boolean => {
    const workCanvas = getWorkCanvas();
    const container = containerRef.current;
    if (!workCanvas || !container) return false;
    const rect = container.getBoundingClientRect();
    const targetW = rect.width || 360;
    const targetH = rect.height || 380;

    let result: { corners: Point2D[] | null; confidence: number } = { corners: null, confidence: 0 };

    if (uploadedImgRef.current && uploadedImgRef.current.complete) {
      result = detectQuadFromSource(
        uploadedImgRef.current,
        uploadedImgRef.current.naturalWidth,
        uploadedImgRef.current.naturalHeight,
        targetW,
        targetH,
        overlayCanvasRef.current,
        workCanvas
      );
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      result = detectQuadFromSource(
        videoRef.current,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        targetW,
        targetH,
        overlayCanvasRef.current,
        workCanvas
      );
    }

    setEdgeConfidence(result.confidence);
    if (result.corners) {
      setPolygonCoords(result.corners);
      return true;
    }
    return false;
  }, [getWorkCanvas]);

  const processImageFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setUploadedImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setIsLocked(false);
      const img = new Image();
      img.onload = () => {
        uploadedImgRef.current = img;
        detectOnce();
      };
      img.src = url;
    },
    [detectOnce]
  );

  const clearUploadedImage = useCallback(() => {
    uploadedImgRef.current = null;
    setUploadedImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const startVideoTracking = useCallback(
    async (
      videoElement: HTMLVideoElement,
      overlayCanvas?: HTMLCanvasElement | null,
      containerElement?: HTMLDivElement | null
    ) => {
      videoRef.current = videoElement;
      if (overlayCanvas !== undefined) overlayCanvasRef.current = overlayCanvas;
      if (containerElement !== undefined) containerRef.current = containerElement;

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          streamRef.current = stream;
          videoElement.srcObject = stream;
          await videoElement.play().catch(() => {});
          setCameraActive(true);
          setCameraError(null);
        } else {
          setCameraActive(false);
          setCameraError("Camera API unavailable in this browser.");
        }
      } catch (err) {
        setCameraActive(false);
        setCameraError(
          err instanceof Error ? err.message : "Camera permission denied or no camera found."
        );
      }

      setIsCalibrating(true);

      let frameTick = 0;
      const loop = () => {
        frameTick++;
        // Run CV at ~15 Hz to keep UI smooth
        if (
          frameTick % 4 === 0 &&
          !isLockedRef.current &&
          isAutoTrackingRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          !uploadedImgRef.current
        ) {
          const workCanvas = getWorkCanvas();
          const container = containerRef.current;
          if (workCanvas && container) {
            const rect = container.getBoundingClientRect();
            const { corners, confidence } = detectQuadFromSource(
              videoRef.current,
              videoRef.current.videoWidth,
              videoRef.current.videoHeight,
              rect.width || 360,
              rect.height || 380,
              overlayCanvasRef.current,
              workCanvas
            );
            setEdgeConfidence(confidence);
            if (corners) {
              // Adaptive One-Euro style velocity smoothing
              setPolygonCoords((prev) =>
                prev.map((p, idx) => {
                  const delta = Math.hypot(corners[idx].x - p.x, corners[idx].y - p.y);
                  const alpha = delta < 5 ? 0.1 : delta < 16 ? 0.25 : 0.5;
                  return {
                    ...p,
                    x: Math.round(p.x * (1 - alpha) + corners[idx].x * alpha),
                    y: Math.round(p.y * (1 - alpha) + corners[idx].y * alpha),
                  };
                })
              );
            }
          }
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    },
    [getWorkCanvas]
  );

  const stopVideoTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setIsCalibrating(false);
  }, []);

  useEffect(() => {
    return () => {
      stopVideoTracking();
    };
  }, [stopVideoTracking]);

  return {
    polygonCoords,
    isLocked,
    isCalibrating,
    isAutoTracking,
    cameraActive,
    cameraError,
    edgeConfidence,
    aspectRatio: metrics.aspectRatio,
    areaMm2: metrics.areaMm2,
    uploadedImageUrl,
    startVideoTracking,
    stopVideoTracking,
    setAutoTracking: setIsAutoTracking,
    detectOnce,
    processImageFile,
    clearUploadedImage,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  };
}
