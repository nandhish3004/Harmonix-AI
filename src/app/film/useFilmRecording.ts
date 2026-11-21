"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Captures the chosen browser tab, including the 3D scene and film captions. */
export function useFilmRecording() {
  const [recording, setRecording] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const downloadRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") return false;
    setMessage(null);
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setMessage("This browser cannot record a tab. Try a current version of Chrome or Edge on a secure connection.");
      return false;
    }
    let stream: MediaStream | null = null;
    try {
      // The user explicitly selects what to share. Audio is not recorded.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return false; }
      const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (mountedRef.current) setMessage("Recording failed. Please try again or use your browser's screen recorder."); };
      recorder.onstop = () => {
        stream?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mountedRef.current) return;
        setRecording(false);
        if (!chunks.length) { setMessage("No video was captured. Please try again."); return; }
        const mime = recorder.mimeType || "video/webm";
        const blob = new Blob(chunks, { type: mime });
        const url = URL.createObjectURL(blob);
        if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
        downloadRef.current = url;
        setDownload({ url, name: `harmonix-inspection-film.${mime.includes("mp4") ? "mp4" : "webm"}` });
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (recorder.state !== "inactive") recorder.stop(); }, { once: true });
      recorder.start(1000);
      setRecording(true);
      setDownload(null);
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (mountedRef.current) setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Sharing was cancelled. Select this browser tab to record the film." : "Could not start recording. Try Chrome or Edge and select this browser tab.");
      return false;
    }
  }, []);

  return { recording, download, message, setMessage, start, stop };
}
