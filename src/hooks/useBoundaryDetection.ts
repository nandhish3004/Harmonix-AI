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
  aspectRatio: number;
  areaMm2: number;
  startVideoTracking: (videoElement: HTMLVideoElement) => Promise<void>;
  stopVideoTracking: () => void;
  lockBoundary: () => void;
  unlockBoundary: () => void;
  updateCornerPoint: (index: number, x: number, y: number) => void;
  resetDefaultBoundary: () => void;
}

const DEFAULT_CORNERS: Point2D[] = [
  { x: 45, y: 160, label: "P1" },
  { x: 348, y: 160, label: "P2" },
  { x: 348, y: 580, label: "P3" },
  { x: 45, y: 580, label: "P4" },
];

export function useBoundaryDetection(): BoundaryDetectionState {
  const [polygonCoords, setPolygonCoords] = useState<Point2D[]>(DEFAULT_CORNERS);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<number>(1.38);
  const [areaMm2, setAreaMm2] = useState<number>(14250);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const updateCornerPoint = useCallback((index: number, x: number, y: number) => {
    if (isLocked) return;
    setPolygonCoords((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], x, y };
      }
      return next;
    });
  }, [isLocked]);

  const lockBoundary = useCallback(() => {
    setIsLocked(true);
    setIsCalibrating(false);
  }, []);

  const unlockBoundary = useCallback(() => {
    setIsLocked(false);
  }, []);

  const resetDefaultBoundary = useCallback(() => {
    setPolygonCoords(DEFAULT_CORNERS);
    setIsLocked(false);
  }, []);

  const processFrame = useCallback(() => {
    if (!isLocked && isCalibrating && videoRef.current) {
      // In a full WebAssembly / OpenCV environment, cv.findContours or SDF gradient descent executes here.
      // We calculate dynamic geometric parameters based on detected/dragged polygon points.
      const p1 = polygonCoords[0];
      const p2 = polygonCoords[1];
      const p3 = polygonCoords[2];
      const p4 = polygonCoords[3];

      if (p1 && p2 && p3 && p4) {
        const width = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const height = Math.hypot(p4.x - p1.x, p4.y - p1.y);
        if (height > 0) {
          setAspectRatio(parseFloat((width / height).toFixed(2)));
          setAreaMm2(Math.round(width * height * 0.12));
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [isLocked, isCalibrating, polygonCoords]);

  const startVideoTracking = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      videoRef.current = videoElement;
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
      }
      setIsCalibrating(true);
      processFrame();
    } catch (err) {
      console.warn("Camera stream not available. Continuing with virtual AR target plane.", err);
      setIsCalibrating(true);
      processFrame();
    }
  }, [processFrame]);

  const stopVideoTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
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
    aspectRatio,
    areaMm2,
    startVideoTracking,
    stopVideoTracking,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  };
}

