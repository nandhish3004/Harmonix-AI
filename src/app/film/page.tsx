"use client";

import { useEffect, useState } from "react";
import { Compass, Expand, Info, Pause, Play, RotateCcw, X } from "lucide-react";
import LabWorld, { chapters } from "./LabWorld";
import { useFilmRecording } from "./useFilmRecording";
import "./film.css";

const CHAPTER_TIME = 8;
const TOTAL_TIME = chapters.length * CHAPTER_TIME;
const timeLabel = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

export default function FilmPage() {
  const [playing, setPlaying] = useState(true);
  const [chapter, setChapter] = useState(0);
  const [time, setTime] = useState(0);
  const [science, setScience] = useState(false);
  const [recordHelp, setRecordHelp] = useState(false);
  const [error, setError] = useState(false);
  const { recording, download, message, setMessage, start: startRecording, stop: stopRecording } = useFilmRecording();

  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), frame = 0;
    // Wall time, not frame count: slow rendering should not slow the film itself.
    // Reset on visibility changes so a background tab doesn't skip ahead.
    const visibilityChange = () => { last = performance.now(); };
    document.addEventListener("visibilitychange", visibilityChange);
    const tick = (now: number) => {
      if (now-last >= 100) {
        const dt = document.hidden ? 0 : (now-last)/1000;
        last=now; setTime(t => Math.min(TOTAL_TIME,t+dt));
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibilityChange); };
  }, [playing]);
  useEffect(() => {
    if (playing) setChapter(Math.min(chapters.length-1,Math.floor(time/CHAPTER_TIME)));
    if (time >= TOTAL_TIME) { setPlaying(false); if(recording) stopRecording(); }
  }, [time,playing,recording,stopRecording]);

  const jump = (index: number) => {
    const selected=Math.max(0,Math.min(chapters.length-1,index));
    setChapter(selected); setTime(selected*CHAPTER_TIME);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || science || recordHelp ||
          (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(chapters.length - 1, chapter + (event.key === "ArrowRight" ? 1 : -1)));
      setChapter(next);
      setTime(next * CHAPTER_TIME);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chapter, science, recordHelp]);
  const play = () => { if(time>=TOTAL_TIME) jump(0); setPlaying(true); };
  const startFilm = () => { setTime(0); setChapter(0); setPlaying(true); };
  const record = async () => {
    setRecordHelp(false);
    if (await startRecording()) startFilm();
  };
  return <div className="film-page">
    <LabWorld chapter={chapter} progress={(time % CHAPTER_TIME)/CHAPTER_TIME} guided={playing} onInteract={() => setPlaying(false)} onMarker={i => { jump(i); setPlaying(false); }} onError={() => setError(true)} />
    <div className="film-cinematic-frame" aria-hidden="true" />
    <header className="film-header">
      <div className="film-brand"><span className="film-mark">✳</span><span><b>HARMONIX AR</b><small>AN INTERACTIVE FILM</small></span></div>
      <div className="film-header-actions">
        {download && <a href={download.url} download={download.name} className="film-chip download">↓ <span>Download video</span></a>}
        <button className="film-chip" onClick={() => { setPlaying(false); }}><Compass size={15}/><span>Explore 3D</span></button>
        <button className={`film-chip ${recording ? "recording" : ""}`} onClick={() => recording ? stopRecording() : setRecordHelp(true)}><span className="record-dot">●</span><span>{recording ? "Stop recording" : "Record video"}</span></button>
      </div>
    </header>
    <>
      <div className="film-hint">{playing ? "GUIDED FILM · ← / → CHAPTERS · DRAG TO EXPLORE" : "← / → CHAPTERS · DRAG TO ORBIT · SCROLL TO ZOOM"}</div>
      {recording && <div className="film-rec"><span>●</span> REC {timeLabel(time)} / {timeLabel(TOTAL_TIME)} — keep this tab visible</div>}
      <footer className="film-controls">
        <button className="film-play" onClick={() => playing ? setPlaying(false) : play()} aria-label={playing ? "Pause film" : "Play film"}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
        <nav className="film-timeline" aria-label="Film chapters">{chapters.map((c,i) => <button key={c.title} onClick={() => {jump(i); setPlaying(false);}} aria-label={`Jump to ${c.title}`} className={chapter===i ? "active" : ""}><span>{c.title}</span><i><b style={{width:`${Math.max(0,Math.min(100,(time-i*CHAPTER_TIME)/CHAPTER_TIME*100))}%`}}/></i></button>)}</nav>
        <span className="film-time">{timeLabel(time)} / {timeLabel(TOTAL_TIME)}</span>
        <button className="film-control-icon" onClick={startFilm} aria-label="Restart film"><RotateCcw size={17}/></button>
        <button className="film-control-icon" onClick={() => { if(!document.fullscreenElement) void document.documentElement.requestFullscreen?.(); else void document.exitFullscreen?.(); }} aria-label="Toggle fullscreen"><Expand size={17}/></button>
      </footer>
      <button className="film-science" onClick={() => setScience(true)}><Info size={15}/> MODEL NOTES</button>
    </>
    {science && <div className="film-dialog-backdrop" onClick={() => setScience(false)}><section className="film-dialog" role="dialog" aria-modal="true" aria-labelledby="science-heading" onClick={e=>e.stopPropagation()}><button className="film-dialog-close" aria-label="Close" onClick={() => setScience(false)}><X size={20}/></button><div className="film-card-kicker">MODEL NOTES</div><h2 id="science-heading">An ideal model, not a measurement</h2><p>The plate uses a Kirchhoff–Love thin-plate solution for a simply supported, homogeneous isotropic aluminium rectangle: 240 × 180 × 1.6 mm, E = 68.9 GPa, density = 2700 kg/m³ and Poisson ratio = 0.33. Mode shape is sin(mπx/a) sin(nπy/b).</p><p>Displayed frequencies are theoretical. Motion is slowed and displacement exaggerated. Equipment, supports, actuator coupling, the inspector and workshop are illustrative and not incorporated into the model.</p><p>Real materials, fixtures, damping and defects change the response. The automated workflow is dramatized rather than running live AI. The phone shows static captures of the real app with example data; its sample scan is not the illustrated plate. Chemistry, sand motion, AR tracking and sensor readings are not simulated. This film must not be used for inspection decisions.</p></section></div>}
    {recordHelp && <div className="film-dialog-backdrop" onClick={() => setRecordHelp(false)}><section className="film-dialog" role="dialog" aria-modal="true" aria-labelledby="record-heading" onClick={e=>e.stopPropagation()}><button className="film-dialog-close" aria-label="Close" onClick={() => setRecordHelp(false)}><X size={20}/></button><div className="film-card-kicker">SAVE THE FILM</div><h2 id="record-heading">Record this browser tab</h2><p>When prompted, select <strong>this browser tab</strong>. The film restarts and records the scene and controls. Keep the tab visible until the film ends, or stop recording early.</p><p>The recording is silent and stored on your device. Anything visible in the selected tab may be captured. Video resolution depends on your display and browser.</p><button className="film-dialog-action" onClick={record}>SELECT TAB & START</button></section></div>}
    {message && <div className="film-message" role="status">{message}<button onClick={() => setMessage(null)} aria-label="Dismiss"><X size={16}/></button></div>}
    {error && <div className="film-error">3D view unavailable. Try a browser with WebGL enabled, then reload this page.</div>}
  </div>;
}
