/**
 * Voice guidance (Web Speech API). Works fully on-device, no network needed.
 * Voice can be turned on/off anywhere in the app; the choice is remembered.
 */
const KEY = "harmonix_voice";

export function isVoiceOn(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === "1";
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function setVoiceOn(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
  if (!on) cancelSpeech();
  window.dispatchEvent(new Event("harmonix-voice"));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Speaks a sentence and resolves when finished (or immediately if voice is off / unsupported). */
export function speak(text: string, opts?: { interrupt?: boolean; rate?: number }): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !isVoiceOn()) {
      resolve();
      return;
    }
    try {
      if (opts?.interrupt !== false) window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = opts?.rate ?? 0.98;
      u.pitch = 1;
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
      // Safety net: some browsers never fire onend
      setTimeout(finish, Math.max(2500, text.length * 95));
    } catch {
      resolve();
    }
  });
}
