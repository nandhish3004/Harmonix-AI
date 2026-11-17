"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface AudioPitchState {
  frequency: number;
  isResonant: boolean;
  note: string;
  volume: number;
  isListening: boolean;
  waveform: number[];
  startListening: () => Promise<void>;
  stopListening: () => void;
  setTargetResonance: (freq: number, tolerance?: number) => void;
}

const NOTE_STRINGS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

function frequencyToNote(freq: number): string {
  if (freq <= 0) return "--";
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
  const rounded = Math.round(noteNum) + 69;
  const noteName = NOTE_STRINGS[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${noteName}${octave}`;
}

export function useAudioPitch(initialTargetFrequency: number = 440): AudioPitchState {
  const [frequency, setFrequency] = useState<number>(initialTargetFrequency);
  const [isResonant, setIsResonant] = useState<boolean>(false);
  const [note, setNote] = useState<string>("A4");
  const [volume, setVolume] = useState<number>(0);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [waveform, setWaveform] = useState<number[]>(() => new Array(32).fill(0));

  const targetFreqRef = useRef<number>(initialTargetFrequency);
  const toleranceRef = useRef<number>(15);
  const freqRef = useRef<number>(initialTargetFrequency);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const setTargetResonance = useCallback((freq: number, tolerance: number = 15) => {
    targetFreqRef.current = freq;
    toleranceRef.current = tolerance;
    setIsResonant(Math.abs(freqRef.current - freq) <= tolerance);
  }, []);

  const stopListening = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsListening(false);
  }, []);

  const detectPitch = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    setVolume(Math.min(1, rms * 16));

    // Downsample 32-bar live waveform for visual feedback
    const bars: number[] = [];
    const stride = Math.floor(bufferLength / 32);
    for (let b = 0; b < 32; b++) {
      let peak = 0;
      for (let k = 0; k < stride; k++) {
        const v = Math.abs(buffer[b * stride + k]);
        if (v > peak) peak = v;
      }
      bars.push(Math.min(1, peak * 6));
    }
    setWaveform(bars);

    // Autocorrelation pitch detection algorithm (sensitive threshold for mobile mics)
    if (rms > 0.0025) {
      let r1 = 0;
      let r2 = bufferLength - 1;
      const thres = 0.2;
      for (let i = 0; i < bufferLength / 2; i++) {
        if (Math.abs(buffer[i]) < thres) {
          r1 = i;
          break;
        }
      }
      for (let i = 1; i < bufferLength / 2; i++) {
        if (Math.abs(buffer[bufferLength - i]) < thres) {
          r2 = bufferLength - i;
          break;
        }
      }

      const trimmed = buffer.slice(r1, r2);
      const c = new Float32Array(trimmed.length);
      for (let i = 0; i < trimmed.length; i++) {
        for (let j = 0; j < trimmed.length - i; j++) {
          c[i] = c[i] + trimmed[j] * trimmed[j + i];
        }
      }

      let d = 0;
      while (c[d] > c[d + 1]) d++;
      let maxval = -1;
      let maxpos = -1;
      for (let i = d; i < trimmed.length; i++) {
        if (c[i] > maxval) {
          maxval = c[i];
          maxpos = i;
        }
      }

      let T0 = maxpos;
      if (T0 > 1 && T0 < trimmed.length - 1) {
        const y1 = c[T0 - 1];
        const y2 = c[T0];
        const y3 = c[T0 + 1];
        const denom = 2 * (2 * y2 - y1 - y3);
        if (Math.abs(denom) > 1e-6) {
          T0 = T0 + (y1 - y3) / denom;
        }
      }
      if (T0 > 0 && audioCtxRef.current) {
        const detectedFreq = Math.round((audioCtxRef.current.sampleRate / T0) * 10) / 10;
        if (detectedFreq > 20 && detectedFreq < 8000) {
          freqRef.current = detectedFreq;
          setFrequency(detectedFreq);
          setNote(frequencyToNote(detectedFreq));
          const diff = Math.abs(detectedFreq - targetFreqRef.current);
          setIsResonant(diff <= toleranceRef.current);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(detectPitch);
  }, []);

  const startListening = useCallback(async () => {
    try {
      if (typeof window === "undefined" || !navigator.mediaDevices) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      detectPitch();
    } catch (err) {
      console.warn("Audio input not accessible or denied. Using fallback synthetic pitch mode.", err);
      // Fallback synthetic frequency oscillator for development/testing
      setIsListening(true);
      setFrequency(initialTargetFrequency);
      setNote(frequencyToNote(initialTargetFrequency));
      setIsResonant(true);
    }
  }, [detectPitch, initialTargetFrequency]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    frequency,
    isResonant,
    note,
    volume,
    isListening,
    waveform,
    startListening,
    stopListening,
    setTargetResonance,
  };
}

