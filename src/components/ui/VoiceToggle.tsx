"use client";

import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isVoiceOn, setVoiceOn } from "@/utils/voice";

export const VoiceToggle: React.FC = () => {
  const [on, setOn] = useState<boolean>(false);

  useEffect(() => {
    setOn(isVoiceOn());
    const h = () => setOn(isVoiceOn());
    window.addEventListener("harmonix-voice", h);
    return () => window.removeEventListener("harmonix-voice", h);
  }, []);

  return (
    <button
      onClick={() => setVoiceOn(!on)}
      aria-label={on ? "Turn voice guidance off" : "Turn voice guidance on"}
      title={on ? "Voice guidance: ON" : "Voice guidance: OFF"}
      className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
        on
          ? "bg-sky-50 border-sky-300 text-sky-700 dark:bg-[#1C332E] dark:border-[#0EB29A] dark:text-[#0EB29A]"
          : "bg-slate-100 border-slate-200 text-slate-500 dark:bg-[#15282C] dark:border-[#294044] dark:text-[#8C999A]"
      }`}
    >
      {on ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
};
