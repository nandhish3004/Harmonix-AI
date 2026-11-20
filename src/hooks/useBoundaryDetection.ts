"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface Point2D {
  x: number;
  y: number;
  label?: string;
}

export interface TrackState {
  cx: number;
  cy: number;
  r: number;
  g: number;
  b: number;
  rad: number;
}

export interface NormalizedBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
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
  detectInRoi: (boxNorm: NormalizedBox) => boolean;
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
  workCanvas: HTMLCanvasElement,
  prevTrack: TrackState | null = null,
  roiNorm: NormalizedBox | null = null
): { corners: Point2D[] | null; confidence: number; track: TrackState | null } {
  if (srcWidth === 0 || srcHeight === 0 || targetWidth === 0 || targetHeight === 0) {
    return { corners: null, confidence: 0, track: null };
  }

  // GPU downsampled processing resolution for <2ms real-time CV
  const procW = 144;
  const procH = Math.max(96, Math.round((targetHeight / targetWidth) * procW));
  workCanvas.width = procW;
  workCanvas.height = procH;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { corners: null, confidence: 0, track: null };

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

  // 1. Grayscale luminance + outer-border background color + raw skin mask
  const gray = new Float32Array(total);
  const rawSkinMask = new Uint8Array(total);
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const i = y * procW + x;
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const yLum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = yLum;
      if (y < 5 || y >= procH - 5 || x < 5 || x >= procW - 5) {
        bgR += r;
        bgG += g;
        bgB += b;
        bgCount++;
      }
      const rgbSkin =
        r > 95 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r - g > 15 &&
        r - b > 15 &&
        Math.abs(r - g) < 110;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const ycbcrSkin = yLum > 35 && cb >= 77 && cb <= 128 && cr >= 133 && cr <= 175 && r > g;
      if (rgbSkin || ycbcrSkin) {
        rawSkinMask[i] = 1;
      }
    }
  }
  if (bgCount > 0) {
    bgR /= bgCount;
    bgG /= bgCount;
    bgB /= bgCount;
  }

  // 2. Fast 5-tap cross-neighborhood smoothing kernel + 1px skin mask dilation
  const blurR = new Float32Array(total);
  const blurG = new Float32Array(total);
  const blurB = new Float32Array(total);
  const blurred = new Float32Array(total);
  const skinMask = new Uint8Array(total);

  for (let y = 0; y < procH; y++) {
    const yUp = y > 0 ? y - 1 : 0;
    const yDn = y < procH - 1 ? y + 1 : procH - 1;
    const rowOff = y * procW;
    const upOff = yUp * procW;
    const dnOff = yDn * procW;

    for (let x = 0; x < procW; x++) {
      const i = rowOff + x;
      const iL = rowOff + (x > 0 ? x - 1 : 0);
      const iR = rowOff + (x < procW - 1 ? x + 1 : procW - 1);
      const iT = upOff + x;
      const iB = dnOff + x;

      const pC = i * 4;
      const pL = iL * 4;
      const pR = iR * 4;
      const pT = iT * 4;
      const pB = iB * 4;

      blurR[i] = (data[pC] * 2 + data[pL] + data[pR] + data[pT] + data[pB]) / 6;
      blurG[i] = (data[pC + 1] * 2 + data[pL + 1] + data[pR + 1] + data[pT + 1] + data[pB + 1]) / 6;
      blurB[i] = (data[pC + 2] * 2 + data[pL + 2] + data[pR + 2] + data[pT + 2] + data[pB + 2]) / 6;
      blurred[i] = (gray[i] * 2 + gray[iL] + gray[iR] + gray[iT] + gray[iB]) / 6;

      if (rawSkinMask[i]) {
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
  }

  // 3. 3-Channel Color-Sobel Edge Magnitude + 3x3 Morphological Dilation Edge Barrier
  const mag = new Float32Array(total);
  let sumMag = 0;
  const margin = 4;

  const sobelAt = (buf: Float32Array, idx: number): number => {
    const gx =
      -buf[idx - procW - 1] + buf[idx - procW + 1] -
      2 * buf[idx - 1] + 2 * buf[idx + 1] -
      buf[idx + procW - 1] + buf[idx + procW + 1];
    const gy =
      -buf[idx - procW - 1] - 2 * buf[idx - procW] - buf[idx - procW + 1] +
      buf[idx + procW - 1] + 2 * buf[idx + procW] + buf[idx + procW + 1];
    return Math.abs(gx) + Math.abs(gy);
  };

  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const i = y * procW + x;
      const mGray = sobelAt(blurred, i);
      const mR = sobelAt(blurR, i);
      const mG = sobelAt(blurG, i);
      const mB = sobelAt(blurB, i);
      const m = Math.max(mGray, mR, mG, mB);
      mag[i] = m;
      sumMag += m;
    }
  }

  const meanMag = sumMag / total;
  const edgeBarrier = Math.max(58, meanMag * 2.2);

  // Build thresholded edge mask + 3x3 morphological dilation to seal 1-2px perimeter gaps
  const rawEdgeMask = new Uint8Array(total);
  const edgeBarrierMask = new Uint8Array(total);
  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const i = y * procW + x;
      if (mag[i] >= edgeBarrier) {
        rawEdgeMask[i] = 1;
      }
    }
  }
  for (let y = margin; y < procH - margin; y++) {
    for (let x = margin; x < procW - margin; x++) {
      const i = y * procW + x;
      if (!rawEdgeMask[i]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        for (let dx = -1; dx <= 1; dx++) {
          edgeBarrierMask[ny * procW + (x + dx)] = 1;
        }
      }
    }
  }

  // Optional normalized ROI clamping (when guided by Hugging Face object detector)
  let roiX0 = 2;
  let roiY0 = 2;
  let roiX1 = procW - 3;
  let roiY1 = procH - 3;
  if (roiNorm) {
    const padX = (roiNorm.xmax - roiNorm.xmin) * 0.08;
    const padY = (roiNorm.ymax - roiNorm.ymin) * 0.08;
    roiX0 = Math.max(2, Math.floor((roiNorm.xmin - padX) * procW));
    roiY0 = Math.max(2, Math.floor((roiNorm.ymin - padY) * procH));
    roiX1 = Math.min(procW - 3, Math.ceil((roiNorm.xmax + padX) * procW));
    roiY1 = Math.min(procH - 3, Math.ceil((roiNorm.ymax + padY) * procH));
  }
  const roiBoxArea = Math.max(1, (roiX1 - roiX0 + 1) * (roiY1 - roiY0 + 1));

  // 4. Seeds: strict interior grid inside roiNorm if provided, else prevTrack + 42 grid seeds
  const seedCoords: [number, number][] = [];
  if (roiNorm) {
    const rwNorm = roiNorm.xmax - roiNorm.xmin;
    const rhNorm = roiNorm.ymax - roiNorm.ymin;
    for (const u of [0.22, 0.36, 0.5, 0.64, 0.78]) {
      for (const v of [0.22, 0.36, 0.5, 0.64, 0.78]) {
        seedCoords.push([
          Math.round((roiNorm.xmin + u * rwNorm) * procW),
          Math.round((roiNorm.ymin + v * rhNorm) * procH),
        ]);
      }
    }
  } else {
    if (prevTrack) {
      const tcx = Math.round(prevTrack.cx);
      const tcy = Math.round(prevTrack.cy);
      seedCoords.push(
        [tcx, tcy],
        [tcx - 6, tcy - 6],
        [tcx + 6, tcy - 6],
        [tcx - 6, tcy + 6],
        [tcx + 6, tcy + 6]
      );
    }
    for (const u of [0.18, 0.3, 0.42, 0.5, 0.58, 0.7, 0.82]) {
      for (const v of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
        seedCoords.push([Math.round(u * procW), Math.round(v * procH)]);
      }
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
  let bestEdgeSupport = 0;
  let bestTrack: TrackState | null = null;

  const sampleMag = (px: number, py: number): number => {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (ix < 2 || ix >= procW - 2 || iy < 2 || iy >= procH - 2) return 0;
    return mag[iy * procW + ix];
  };

  for (const [sx, sy] of seedCoords) {
    if (sx < roiX0 || sx > roiX1 || sy < roiY0 || sy > roiY1) continue;
    if (sx < margin || sx >= procW - margin || sy < margin || sy >= procH - margin) continue;
    const startIdx = sy * procW + sx;
    if (skinMask[startIdx] || edgeBarrierMask[startIdx] || visitedGlobal[startIdx]) continue;

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

      // 4-connected growth bounded by seed similarity, ROI bounds, and dilated color-Sobel barrier
      const neighbors = [
        px > roiX0 ? idx - 1 : -1,
        px < roiX1 ? idx + 1 : -1,
        py > roiY0 ? idx - procW : -1,
        py < roiY1 ? idx + procW : -1,
      ];
      for (const nIdx of neighbors) {
        if (nIdx < 0 || visitedLocal[nIdx] || skinMask[nIdx] || edgeBarrierMask[nIdx]) continue;
        const seedDiff =
          Math.abs(blurR[nIdx] - sr) +
          Math.abs(blurG[nIdx] - sg) +
          Math.abs(blurB[nIdx] - sb);
        if (seedDiff >= 62) continue;

        const stepDiff =
          Math.abs(blurR[nIdx] - blurR[idx]) +
          Math.abs(blurG[nIdx] - blurG[idx]) +
          Math.abs(blurB[nIdx] - blurB[idx]);
        if (stepDiff >= 28) continue;

        visitedLocal[nIdx] = 1;
        visitedGlobal[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }

    const areaCount = regionPixels.length;
    const minAreaRequired = roiNorm ? Math.max(total * 0.015, roiBoxArea * 0.14) : total * 0.035;
    if (areaCount < minAreaRequired) continue;

    // Reject regions touching 2 or more outer borders of the frame (walls, shirts, tables)
    let bordersTouched = 0;
    if (minX <= 5) bordersTouched++;
    if (maxX >= procW - 6) bordersTouched++;
    if (minY <= 5) bordersTouched++;
    if (maxY >= procH - 6) bordersTouched++;
    if (!roiNorm && bordersTouched >= 2) continue;

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

    const isTrackedMatch =
      prevTrack !== null &&
      Math.hypot(centroidX - prevTrack.cx, centroidY - prevTrack.cy) <= 0.22 * maxDist &&
      Math.abs(sr - prevTrack.r) + Math.abs(sg - prevTrack.g) + Math.abs(sb - prevTrack.b) <= 48;

    let smoothedRad = bestRad;
    if (isTrackedMatch && prevTrack && Math.abs(bestRad - prevTrack.rad) < (12 * Math.PI) / 180) {
      smoothedRad = 0.7 * prevTrack.rad + 0.3 * bestRad;
    }

    const optCos = Math.cos(smoothedRad);
    const optSin = Math.sin(smoothedRad);
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

    // Interior texture homogeneity check: reject noisy shirts/walls/hair (high RGB std dev)
    let sumRReg = 0, sumGReg = 0, sumBReg = 0;
    const statStep = Math.max(1, Math.floor(areaCount / 400));
    let statCount = 0;
    for (let k = 0; k < areaCount; k += statStep) {
      const idx = regionPixels[k];
      sumRReg += blurR[idx];
      sumGReg += blurG[idx];
      sumBReg += blurB[idx];
      statCount++;
    }
    const meanRReg = sumRReg / Math.max(1, statCount);
    const meanGReg = sumGReg / Math.max(1, statCount);
    const meanBReg = sumBReg / Math.max(1, statCount);
    let varSum = 0;
    for (let k = 0; k < areaCount; k += statStep) {
      const idx = regionPixels[k];
      const dr = blurR[idx] - meanRReg;
      const dg = blurG[idx] - meanGReg;
      const db = blurB[idx] - meanBReg;
      varSum += dr * dr + dg * dg + db * db;
    }
    const colorStd = Math.sqrt(varSum / Math.max(1, 3 * statCount));
    if (colorStd > 62) continue;

    // 4-Side Directional Caliper Projection within +-6px band around u0, u1, v0, v1
    const snapCaliperU = (baseU: number): number => {
      let bestU = baseU;
      let bestStrength = -1;
      for (let du = -6; du <= 6; du++) {
        const candU = baseU + du;
        let sumStr = 0;
        for (let s = 0; s < 16; s++) {
          const v = v0 + (0.1 + (s / 15) * 0.8) * (v1 - v0);
          const wx = centroidX + candU * optCos - v * optSin;
          const wy = centroidY + candU * optSin + v * optCos;
          sumStr += Math.min(sampleMag(wx, wy), edgeBarrier * 3.5);
        }
        const avgStr = (sumStr / 16) * (1 - 0.02 * Math.abs(du));
        if (avgStr > bestStrength) {
          bestStrength = avgStr;
          bestU = candU;
        }
      }
      return bestStrength >= meanMag * 1.1 ? bestU : baseU;
    };

    const snapCaliperV = (baseV: number): number => {
      let bestV = baseV;
      let bestStrength = -1;
      for (let dv = -6; dv <= 6; dv++) {
        const candV = baseV + dv;
        let sumStr = 0;
        for (let s = 0; s < 16; s++) {
          const u = u0 + (0.1 + (s / 15) * 0.8) * (u1 - u0);
          const wx = centroidX + u * optCos - candV * optSin;
          const wy = centroidY + u * optSin + candV * optCos;
          sumStr += Math.min(sampleMag(wx, wy), edgeBarrier * 3.5);
        }
        const avgStr = (sumStr / 16) * (1 - 0.02 * Math.abs(dv));
        if (avgStr > bestStrength) {
          bestStrength = avgStr;
          bestV = candV;
        }
      }
      return bestStrength >= meanMag * 1.1 ? bestV : baseV;
    };

    let u0Snap = snapCaliperU(u0);
    let u1Snap = snapCaliperU(u1);
    let v0Snap = snapCaliperV(v0);
    let v1Snap = snapCaliperV(v1);
    if (u1Snap - u0Snap < 10) {
      u0Snap = u0;
      u1Snap = u1;
    }
    if (v1Snap - v0Snap < 10) {
      v0Snap = v0;
      v1Snap = v1;
    }

    const backProject = (u: number, v: number) => ({
      x: Math.max(3, Math.min(procW - 4, centroidX + u * optCos - v * optSin)),
      y: Math.max(3, Math.min(procH - 4, centroidY + u * optSin + v * optCos)),
    });

    const rawQuad = [
      backProject(u0Snap, v0Snap),
      backProject(u1Snap, v0Snap),
      backProject(u1Snap, v1Snap),
      backProject(u0Snap, v1Snap),
    ];

    // Check interior skin fraction across core of reconstructed quad (ignore 12% edge rim where fingers hold)
    let interiorSkinHits = 0;
    const interiorGrid = 8;
    for (let gy = 0; gy < interiorGrid; gy++) {
      const vv = v0Snap + (0.14 + (gy / (interiorGrid - 1)) * 0.72) * (v1Snap - v0Snap);
      for (let gx = 0; gx < interiorGrid; gx++) {
        const uu = u0Snap + (0.14 + (gx / (interiorGrid - 1)) * 0.72) * (u1Snap - u0Snap);
        const ix = Math.round(centroidX + uu * optCos - vv * optSin);
        const iy = Math.round(centroidY + uu * optSin + vv * optCos);
        if (ix >= 0 && ix < procW && iy >= 0 && iy < procH && skinMask[iy * procW + ix]) {
          interiorSkinHits++;
        }
      }
    }
    if (interiorSkinHits / (interiorGrid * interiorGrid) > 0.08) continue;

    // Per-Side & Perimeter Edge-Support Verification along all 4 reconstructed edges
    const edgeThreshold = meanMag * 1.15;
    let supportedSamples = 0;
    const samplesPerSide = 16;
    const sideSupport = [0, 0, 0, 0];
    for (let side = 0; side < 4; side++) {
      const a = rawQuad[side];
      const b = rawQuad[(side + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      let sideHits = 0;
      for (let s = 0; s < samplesPerSide; s++) {
        const t = 0.08 + (s / (samplesPerSide - 1)) * 0.84;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const peakEdge = Math.max(
          sampleMag(px, py),
          sampleMag(px + nx, py + ny),
          sampleMag(px - nx, py - ny)
        );
        if (peakEdge >= edgeThreshold) {
          supportedSamples++;
          sideHits++;
        }
      }
      sideSupport[side] = sideHits / samplesPerSide;
    }
    const edgeSupportRatio = supportedSamples / (4 * samplesPerSide);
    const sortedSides = [...sideSupport].sort((a, b) => a - b);
    // Allow 1 side to be partially occluded by the holding hand while requiring 3 strong sides
    const minWeakSide = roiNorm ? 0.14 : 0.18;
    const minStrongSides = roiNorm ? 0.25 : 0.34;
    const meanEdgeReq = roiNorm ? 0.34 : 0.44;
    if (
      sortedSides[0] < minWeakSide ||
      sortedSides[1] < minStrongSides ||
      edgeSupportRatio < meanEdgeReq
    ) {
      continue;
    }

    const bgDiff = Math.abs(sr - bgR) + Math.abs(sg - bgG) + Math.abs(sb - bgB);
    const distToCenter = Math.hypot(centroidX - cxFrame, centroidY - cyFrame);
    const centrality = Math.max(0.15, 1.0 - 0.85 * (distToCenter / Math.max(1, maxDist)));
    let score =
      areaCount *
      Math.pow(Math.min(1, obbFillRatio), 1.5) *
      Math.pow(edgeSupportRatio, 2.2) *
      centrality *
      (1 + Math.min(1.5, bgDiff / 80));
    if (bordersTouched === 1) score *= 0.2;
    if (isTrackedMatch) score *= 2.2;

    if (score > bestScore) {
      bestScore = score;
      bestRegionPixels = regionPixels;
      bestFillRatio = Math.min(1, obbFillRatio);
      bestEdgeSupport = edgeSupportRatio;
      bestProcCorners = rawQuad;
      bestTrack = {
        cx: centroidX,
        cy: centroidY,
        r: sr,
        g: sg,
        b: sb,
        rad: smoothedRad,
      };
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
      if (!bestCorners) {
        overlayCtx.clearRect(0, 0, procW, procH);
      } else {
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
  }

  if (!bestCorners) {
    return { corners: null, confidence: 0, track: null };
  }

  const quality = Math.min(1, 0.55 * bestFillRatio + 0.45 * bestEdgeSupport);
  const confidence = Math.min(99, Math.round(62 + quality * 36));
  return { corners: bestCorners, confidence, track: bestTrack };
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
  const trackStateRef = useRef<TrackState | null>(null);
  const targetCornersRef = useRef<Point2D[]>(DEFAULT_CORNERS);
  const smoothCornersRef = useRef<{ x: number; y: number }[]>(
    DEFAULT_CORNERS.map((p) => ({ x: p.x, y: p.y }))
  );

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
        if (smoothCornersRef.current[index]) {
          smoothCornersRef.current[index] = { x, y };
        }
        if (targetCornersRef.current[index]) {
          targetCornersRef.current[index] = { ...targetCornersRef.current[index], x, y };
        }
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
    targetCornersRef.current = labeled;
    smoothCornersRef.current = labeled.map((c) => ({ x: c.x, y: c.y }));
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
    trackStateRef.current = null;
    latestCornersRef.current = DEFAULT_CORNERS;
    targetCornersRef.current = DEFAULT_CORNERS;
    smoothCornersRef.current = DEFAULT_CORNERS.map((p) => ({ x: p.x, y: p.y }));
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

    let result: { corners: Point2D[] | null; confidence: number; track: TrackState | null } = {
      corners: null,
      confidence: 0,
      track: null,
    };

    if (uploadedImgRef.current && uploadedImgRef.current.complete) {
      result = detectQuadFromSource(
        uploadedImgRef.current,
        uploadedImgRef.current.naturalWidth,
        uploadedImgRef.current.naturalHeight,
        targetW,
        targetH,
        overlayCanvasRef.current,
        workCanvas,
        trackStateRef.current
      );
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      result = detectQuadFromSource(
        videoRef.current,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        targetW,
        targetH,
        overlayCanvasRef.current,
        workCanvas,
        trackStateRef.current
      );
    }

    setEdgeConfidence(result.confidence);
    if (result.track) trackStateRef.current = result.track;
    if (result.corners) {
      latestCornersRef.current = result.corners;
      targetCornersRef.current = result.corners;
      smoothCornersRef.current = result.corners.map((c) => ({ x: c.x, y: c.y }));
      setPolygonCoords(result.corners);
      return true;
    }
    return false;
  }, [getWorkCanvas]);

  const detectInRoi = useCallback(
    (boxNorm: NormalizedBox): boolean => {
      const workCanvas = getWorkCanvas();
      const container = containerRef.current;
      if (!workCanvas || !container) return false;
      const rect = container.getBoundingClientRect();
      const targetW = rect.width || 360;
      const targetH = rect.height || 380;

      let result: { corners: Point2D[] | null; confidence: number; track: TrackState | null } = {
        corners: null,
        confidence: 0,
        track: null,
      };

      if (uploadedImgRef.current && uploadedImgRef.current.complete) {
        result = detectQuadFromSource(
          uploadedImgRef.current,
          uploadedImgRef.current.naturalWidth,
          uploadedImgRef.current.naturalHeight,
          targetW,
          targetH,
          overlayCanvasRef.current,
          workCanvas,
          null,
          boxNorm
        );
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        result = detectQuadFromSource(
          videoRef.current,
          videoRef.current.videoWidth,
          videoRef.current.videoHeight,
          targetW,
          targetH,
          overlayCanvasRef.current,
          workCanvas,
          null,
          boxNorm
        );
      }

      if (result.corners) {
        setEdgeConfidence(result.confidence);
        if (result.track) trackStateRef.current = result.track;
        latestCornersRef.current = result.corners;
        targetCornersRef.current = result.corners;
        smoothCornersRef.current = result.corners.map((c) => ({ x: c.x, y: c.y }));
        setPolygonCoords(result.corners);
        return true;
      }
      return false;
    },
    [getWorkCanvas]
  );

  const processImageFile = useCallback(
    (file: File) => {
      trackStateRef.current = null;
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
    trackStateRef.current = null;
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
        const trackingActive =
          !isLockedRef.current &&
          isAutoTrackingRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          !uploadedImgRef.current;

        // Run fast region-growing OBB detector at 20 Hz (every 3rd frame)
        if (frameTick % 3 === 0 && trackingActive && videoRef.current) {
          const workCanvas = getWorkCanvas();
          const container = containerRef.current;
          if (workCanvas && container) {
            const rect = container.getBoundingClientRect();
            const res = detectQuadFromSource(
              videoRef.current,
              videoRef.current.videoWidth,
              videoRef.current.videoHeight,
              rect.width || 360,
              rect.height || 380,
              overlayCanvasRef.current,
              workCanvas,
              trackStateRef.current
            );
            trackStateRef.current = res.track;
            setEdgeConfidence(res.confidence);
            if (res.corners) {
              targetCornersRef.current = res.corners;
            }
          }
        }

        // True 60 FPS pin interpolation with deadband for zero jitter when steady
        if (trackingActive && targetCornersRef.current.length === 4) {
          const cur = smoothCornersRef.current;
          const tgt = targetCornersRef.current;
          const prev = latestCornersRef.current;
          let changed = false;
          const nextCoords: Point2D[] = new Array(4);

          for (let idx = 0; idx < 4; idx++) {
            const dx = tgt[idx].x - cur[idx].x;
            const dy = tgt[idx].y - cur[idx].y;
            const dist = Math.hypot(dx, dy);
            if (dist >= 1.2) {
              cur[idx].x += dx * 0.28;
              cur[idx].y += dy * 0.28;
            }
            const rx = Math.round(cur[idx].x);
            const ry = Math.round(cur[idx].y);
            if (!prev[idx] || Math.abs(rx - prev[idx].x) >= 1 || Math.abs(ry - prev[idx].y) >= 1) {
              changed = true;
            }
            nextCoords[idx] = { x: rx, y: ry, label: tgt[idx].label ?? `P${idx + 1}` };
          }

          if (changed) {
            latestCornersRef.current = nextCoords;
            setPolygonCoords(nextCoords);
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
    detectInRoi,
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
