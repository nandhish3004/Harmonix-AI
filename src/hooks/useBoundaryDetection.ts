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
  setCornersFromAi: (corners: Point2D[]) => void;
  getLatestCorners: () => Point2D[];
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

  // 2. 5x5 Box-Blurred RGB Map + 3x3 Grayscale Blur + Combined RGB/YCbCr Skin Mask with 1px Dilation
  const blurR = new Float32Array(total);
  const blurG = new Float32Array(total);
  const blurB = new Float32Array(total);
  const blurred = new Float32Array(total);
  const rawSkinMask = new Uint8Array(total);
  const skinMask = new Uint8Array(total);

  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const i = y * procW + x;
      const dIdx = i * 4;
      const r = data[dIdx];
      const g = data[dIdx + 1];
      const b = data[dIdx + 2];
      const rgbSkin =
        r > 95 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r - g > 15 &&
        r - b > 15 &&
        Math.abs(r - g) < 110;
      const yLum = gray[i];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const ycbcrSkin = yLum > 35 && cb >= 77 && cb <= 128 && cr >= 133 && cr <= 175 && r > g;
      if (rgbSkin || ycbcrSkin) {
        rawSkinMask[i] = 1;
      }

      const x0 = Math.max(0, x - 2);
      const x1 = Math.min(procW - 1, x + 2);
      const y0 = Math.max(0, y - 2);
      const y1 = Math.min(procH - 1, y + 2);
      let sr = 0, sg = 0, sb = 0, sgray = 0, cnt = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const j = yy * procW + xx;
          const p = j * 4;
          sr += data[p];
          sg += data[p + 1];
          sb += data[p + 2];
          sgray += gray[j];
          cnt++;
        }
      }
      blurR[i] = sr / cnt;
      blurG[i] = sg / cnt;
      blurB[i] = sb / cnt;
      blurred[i] = sgray / cnt;
    }
  }

  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const i = y * procW + x;
      if (!rawSkinMask[i]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= procH) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < procW) {
            skinMask[ny * procW + nx] = 1;
          }
        }
      }
    }
  }

  // 3. Pure Sobel Edge Magnitude (used strictly as barrier — never mixed with colorDist)
  const mag = new Float32Array(total);
  let sumMag = 0;
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
      const m = Math.abs(gx) + Math.abs(gy);
      mag[i] = m;
      sumMag += m;
    }
  }

  const meanMag = sumMag / total;
  const edgeBarrier = Math.max(95, meanMag * 3.1);

  // 4. Multi-Seed Region Growing across 42 interior seed points
  const seedCoords: [number, number][] = [];
  for (const u of [0.18, 0.3, 0.42, 0.5, 0.58, 0.7, 0.82]) {
    for (const v of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
      seedCoords.push([Math.round(u * procW), Math.round(v * procH)]);
    }
  }

  const visitedGlobal = new Uint8Array(total);
  const queue = new Int32Array(total);
  const cxFrame = procW * 0.5;
  const cyFrame = procH * 0.5;
  const maxDist = Math.hypot(cxFrame, cyFrame);

  let bestScore = -1;
  let bestCorners: Point2D[] | null = null;
  let bestProcCorners: { x: number; y: number }[] | null = null;
  let bestRegionPixels: number[] = [];
  let bestFillRatio = 0;

  for (const [sx, sy] of seedCoords) {
    if (sx < margin || sx >= procW - margin || sy < margin || sy >= procH - margin) continue;
    const startIdx = sy * procW + sx;
    if (skinMask[startIdx] || visitedGlobal[startIdx]) continue;

    const sr = blurR[startIdx];
    const sg = blurG[startIdx];
    const sb = blurB[startIdx];

    const visitedLocal = new Uint8Array(total);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    visitedLocal[startIdx] = 1;
    visitedGlobal[startIdx] = 1;

    const regionPixels: number[] = [];
    let minX = procW, maxX = 0, minY = procH, maxY = 0;
    let sumX = 0, sumY = 0;

    while (head < tail) {
      const idx = queue[head++];
      const px = idx % procW;
      const py = (idx - px) / procW;

      regionPixels.push(idx);
      sumX += px;
      sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;

      // 4-connected growth bounded by seed similarity and step-edge barriers
      const neighbors = [
        px > 2 ? idx - 1 : -1,
        px < procW - 3 ? idx + 1 : -1,
        py > 2 ? idx - procW : -1,
        py < procH - 3 ? idx + procW : -1,
      ];
      for (const nIdx of neighbors) {
        if (nIdx < 0 || visitedLocal[nIdx] || skinMask[nIdx]) continue;
        const seedDiff =
          Math.abs(blurR[nIdx] - sr) +
          Math.abs(blurG[nIdx] - sg) +
          Math.abs(blurB[nIdx] - sb);
        if (seedDiff >= 62) continue;

        const stepDiff =
          Math.abs(blurR[nIdx] - blurR[idx]) +
          Math.abs(blurG[nIdx] - blurG[idx]) +
          Math.abs(blurB[nIdx] - blurB[idx]);
        if (stepDiff >= 28 || mag[nIdx] >= edgeBarrier) continue;

        visitedLocal[nIdx] = 1;
        visitedGlobal[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }

    const areaCount = regionPixels.length;
    if (areaCount < total * 0.035) continue;

    // Reject regions touching 2 or more outer borders of the frame (walls, shirts, tables)
    let bordersTouched = 0;
    if (minX <= 5) bordersTouched++;
    if (maxX >= procW - 6) bordersTouched++;
    if (minY <= 5) bordersTouched++;
    if (maxY >= procH - 6) bordersTouched++;
    if (bordersTouched >= 2) continue;

    // 5. Minimum-Area Oriented Bounding Box (OBB) Corner Reconstruction (occlusion-immune)
    const centroidX = sumX / areaCount;
    const centroidY = sumY / areaCount;

    const boundaryX: number[] = [];
    const boundaryY: number[] = [];
    for (let k = 0; k < areaCount; k++) {
      const idx = regionPixels[k];
      const px = idx % procW;
      const py = (idx - px) / procW;
      const isBnd =
        px <= 2 ||
        px >= procW - 3 ||
        py <= 2 ||
        py >= procH - 3 ||
        !visitedLocal[idx - 1] ||
        !visitedLocal[idx + 1] ||
        !visitedLocal[idx - procW] ||
        !visitedLocal[idx + procW];
      if (isBnd) {
        boundaryX.push(px);
        boundaryY.push(py);
      }
    }
    if (boundaryX.length < 12) continue;

    let bestRad = 0;
    let minObbArea = Infinity;
    for (let deg = -45; deg <= 45; deg += 1.5) {
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let b = 0; b < boundaryX.length; b++) {
        const dx = boundaryX[b] - centroidX;
        const dy = boundaryY[b] - centroidY;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      const obbArea = (uMax - uMin) * (vMax - vMin);
      if (obbArea < minObbArea) {
        minObbArea = obbArea;
        bestRad = rad;
      }
    }

    const optCos = Math.cos(bestRad);
    const optSin = Math.sin(bestRad);
    const sampleStep = Math.max(1, Math.floor(areaCount / 1600));
    const uVals: number[] = [];
    const vVals: number[] = [];
    for (let k = 0; k < areaCount; k += sampleStep) {
      const idx = regionPixels[k];
      const px = idx % procW;
      const py = (idx - px) / procW;
      const dx = px - centroidX;
      const dy = py - centroidY;
      uVals.push(dx * optCos + dy * optSin);
      vVals.push(-dx * optSin + dy * optCos);
    }
    uVals.sort((a, b) => a - b);
    vVals.sort((a, b) => a - b);

    const pLow = Math.floor(0.01 * (uVals.length - 1));
    const pHigh = Math.ceil(0.99 * (uVals.length - 1));
    const u0 = uVals[pLow];
    const u1 = uVals[pHigh];
    const v0 = vVals[pLow];
    const v1 = vVals[pHigh];

    const obbBoxArea = Math.max(1, (u1 - u0) * (v1 - v0));
    if (obbBoxArea > total * 0.72) continue;

    const obbFillRatio = areaCount / obbBoxArea;
    if (obbFillRatio < 0.48) continue;

    const backProject = (u: number, v: number) => ({
      x: Math.max(3, Math.min(procW - 4, centroidX + u * optCos - v * optSin)),
      y: Math.max(3, Math.min(procH - 4, centroidY + u * optSin + v * optCos)),
    });

    const rawQuad = [
      backProject(u0, v0),
      backProject(u1, v0),
      backProject(u1, v1),
      backProject(u0, v1),
    ];

    const bgDiff = Math.abs(sr - bgR) + Math.abs(sg - bgG) + Math.abs(sb - bgB);
    const distToCenter = Math.hypot(centroidX - cxFrame, centroidY - cyFrame);
    const centrality = Math.max(0.15, 1.0 - 0.85 * (distToCenter / Math.max(1, maxDist)));
    let score =
      areaCount *
      Math.pow(Math.min(1, obbFillRatio), 1.5) *
      centrality *
      (1 + Math.min(1.5, bgDiff / 80));
    if (bordersTouched === 1) score *= 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestRegionPixels = regionPixels;
      bestFillRatio = Math.min(1, obbFillRatio);
      bestProcCorners = rawQuad;
      const scaleX = targetWidth / procW;
      const scaleY = targetHeight / procH;
      bestCorners = rawQuad.map((pt, idx) => ({
        x: Math.round(Math.max(8, Math.min(targetWidth - 8, pt.x * scaleX))),
        y: Math.round(Math.max(8, Math.min(targetHeight - 8, pt.y * scaleY))),
        label: `P${idx + 1}`,
      }));
    }
  }

  // 6. Render overlay highlighting segmented interior + crisp reconstructed OBB quad perimeter
  if (overlayCanvas) {
    overlayCanvas.width = procW;
    overlayCanvas.height = procH;
    const overlayCtx = overlayCanvas.getContext("2d");
    if (overlayCtx) {
      const overlayData = overlayCtx.createImageData(procW, procH);
      for (const idx of bestRegionPixels) {
        const oIdx = idx * 4;
        overlayData.data[oIdx] = 14;
        overlayData.data[oIdx + 1] = 178;
        overlayData.data[oIdx + 2] = 154;
        overlayData.data[oIdx + 3] = 55;
      }
      overlayCtx.putImageData(overlayData, 0, 0);

      if (bestProcCorners && bestProcCorners.length === 4) {
        overlayCtx.save();
        overlayCtx.strokeStyle = "rgba(52, 211, 153, 0.96)";
        overlayCtx.lineWidth = 2;
        overlayCtx.lineJoin = "round";
        overlayCtx.beginPath();
        overlayCtx.moveTo(bestProcCorners[0].x, bestProcCorners[0].y);
        for (let c = 1; c < 4; c++) {
          overlayCtx.lineTo(bestProcCorners[c].x, bestProcCorners[c].y);
        }
        overlayCtx.closePath();
        overlayCtx.stroke();
        overlayCtx.restore();
      }
    }
  }

  if (!bestCorners) {
    return { corners: null, confidence: 28 };
  }

  const confidence = Math.min(99, Math.round(68 + bestFillRatio * 30));
  return { corners: bestCorners, confidence };
}

export function useBoundaryDetection(): BoundaryDetectionState {
  const [polygonCoords, setPolygonCoords] = useState<Point2D[]>(DEFAULT_CORNERS);

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
  const latestCornersRef = useRef<Point2D[]>(DEFAULT_CORNERS);

  const isLockedRef = useRef(isLocked);
  const isAutoTrackingRef = useRef(isAutoTracking);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);
  useEffect(() => {
    isAutoTrackingRef.current = isAutoTracking;
  }, [isAutoTracking]);
  useEffect(() => {
    latestCornersRef.current = polygonCoords;
  }, [polygonCoords]);

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
      latestCornersRef.current = next;
      return next;
    });
  }, []);

  const setCornersFromAi = useCallback((corners: Point2D[]) => {
    if (isLockedRef.current || corners.length !== 4) return;
    const labeled = corners.map((c, idx) => ({
      x: Math.round(c.x),
      y: Math.round(c.y),
      label: c.label ?? `P${idx + 1}`,
    }));
    latestCornersRef.current = labeled;
    setPolygonCoords(labeled);
  }, []);

  const getLatestCorners = useCallback(() => latestCornersRef.current, []);

  const lockBoundary = useCallback(() => {
    setIsLocked(true);
    setIsAutoTracking(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("harmonix_boundary", JSON.stringify(latestCornersRef.current));
      } catch {
        // ignore storage quota errors
      }
    }
  }, []);

  const unlockBoundary = useCallback(() => {
    setIsLocked(false);
  }, []);

  const resetDefaultBoundary = useCallback(() => {
    latestCornersRef.current = DEFAULT_CORNERS;
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
      latestCornersRef.current = result.corners;
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
    setCornersFromAi,
    getLatestCorners,
    processImageFile,
    clearUploadedImage,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  };
}
