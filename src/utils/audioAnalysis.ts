/**
 * Acoustic analysis for tap-testing.
 * - Radix-2 FFT with Hann window and zero padding
 * - Parabolic (log-magnitude) interpolation => sub-bin frequency accuracy
 * - Half-power (-3 dB) bandwidth => quality factor Q
 */

export interface SpectralPeak {
  hz: number;
  db: number;
}

export interface TapAnalysis {
  peakHz: number;
  qFactor: number;
  snrDb: number;
  peaks: SpectralPeak[];
  waveformPreview?: number[];
  spectrumPreview?: { hz: number; mag: number }[];
}

export interface AmbientCalibrationProfile {
  ambientRms: number;
  ambientMagSpectrum: Float64Array;
  micType: "mems-mobile" | "wideband";
  noiseFloorDb: number;
  sampleRate: number;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

/**
 * Transient impulse gate: checks RMS attack ratio AND crest factor (peak / rms >= 3.4)
 * so finger/pen taps on phones, PCBs, acrylic, or metal plates trigger reliably
 * while stationary background hum is ignored.
 */
export function isSharpTapImpulse(samples: Float32Array, ambientRms: number): boolean {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    sum += samples[i] * samples[i];
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  const crest = peak / Math.max(1e-6, rms);
  return rms > Math.max(0.014, ambientRms * 2.6) && crest >= 3.4;
}

/**
 * Characterize the room noise floor, normalized ambient PSD (per sqrt(sample)),
 * and detect MEMS mobile hardware roll-off vs wideband microphone response.
 */
export function buildAmbientProfile(
  chunks: Float32Array[],
  sampleRate: number
): AmbientCalibrationProfile {
  const N = 65536;
  const half = N / 2;
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const usable = Math.min(totalLen, 16384);

  const combined = new Float64Array(Math.max(2048, usable));
  let writeIdx = 0;
  let sumSq = 0;
  for (const ch of chunks) {
    for (let i = 0; i < ch.length && writeIdx < combined.length; i++, writeIdx++) {
      combined[writeIdx] = ch[i];
      sumSq += ch[i] * ch[i];
    }
  }
  const actualCount = Math.max(1, writeIdx);
  const ambientRms = Math.max(0.0015, Math.sqrt(sumSq / actualCount));
  const noiseFloorDb = Math.round(
    Math.max(-90, Math.min(-10, 20 * Math.log10(ambientRms)))
  );

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let mean = 0;
  for (let i = 0; i < actualCount; i++) mean += combined[i];
  mean /= actualCount;

  const invSqrtN = 1 / Math.sqrt(actualCount);
  for (let i = 0; i < actualCount; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, actualCount - 1)));
    re[i] = (combined[i] - mean) * w;
  }
  fftInPlace(re, im);

  const ambientMagSpectrum = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    ambientMagSpectrum[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * invSqrtN;
  }

  // Compare 50-150 Hz energy vs 350-1200 Hz energy to detect mobile MEMS HPF roll-off
  const binHz = sampleRate / N;
  const loA = Math.max(2, Math.floor(50 / binHz));
  const loB = Math.min(half - 1, Math.ceil(150 / binHz));
  const midA = Math.max(2, Math.floor(350 / binHz));
  const midB = Math.min(half - 1, Math.ceil(1200 / binHz));
  let lowEnergy = 0;
  for (let i = loA; i <= loB; i++) lowEnergy += ambientMagSpectrum[i];
  lowEnergy /= Math.max(1, loB - loA + 1);
  let midEnergy = 0;
  for (let i = midA; i <= midB; i++) midEnergy += ambientMagSpectrum[i];
  midEnergy /= Math.max(1, midB - midA + 1);

  const isMobileUa =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const micType: "mems-mobile" | "wideband" =
    isMobileUa || lowEnergy < midEnergy * 0.45 ? "mems-mobile" : "wideband";

  return {
    ambientRms,
    ambientMagSpectrum,
    micType,
    noiseFloorDb,
    sampleRate,
  };
}

function windowRms(samples: Float32Array, start: number, end: number): number {
  const s = Math.max(0, start);
  const e = Math.min(samples.length, end);
  if (e <= s) return 0;
  let sum = 0;
  for (let i = s; i < e; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (e - s));
}

export function analyzeTapSignal(
  samples: Float32Array,
  sampleRate: number,
  minHz = 100,
  maxHz = 4000,
  ambientProfile?: AmbientCalibrationProfile
): TapAnalysis | null {
  // Find global peak sample
  let peakIdx = 0;
  let peakVal = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peakVal) {
      peakVal = a;
      peakIdx = i;
    }
  }

  // Physical Tap Decay Envelope Verification (reject continuous rising speech or steady hum)
  const ambFloor = ambientProfile?.ambientRms ?? 0.0025;
  if (peakIdx >= 192) {
    const preRms = windowRms(samples, peakIdx - 1024, peakIdx - 128);
    const attackRms = windowRms(samples, peakIdx - 32, peakIdx + 256);
    if (attackRms / Math.max(preRms, ambFloor, 1e-5) < 2.2) {
      return null;
    }
  }

  const w1End = peakIdx + Math.round(0.025 * sampleRate);
  const w3End = peakIdx + Math.round(0.12 * sampleRate);
  if (samples.length >= w3End && w3End > w1End) {
    const rmsW1 = windowRms(samples, peakIdx, w1End);
    const rmsW3 = windowRms(samples, w1End, w3End);
    if (rmsW1 <= rmsW3 * 1.15) {
      return null;
    }
  }

  // Focus FFT on the 85ms post-impact ring-down burst using a Half-Hann Impact Window
  // (weight = 1.0 at the impact peak so transient tap energy is never muted by a symmetric Hann start!)
  const preLead = 32;
  const startIdx = Math.max(0, peakIdx - preLead);
  const aligned = samples.subarray(startIdx);
  const maxImpactLen = Math.min(aligned.length, Math.max(2048, Math.round(0.085 * sampleRate)));
  const usable = maxImpactLen;
  if (usable < 1024) return null;

  const N = 65536; // zero-padded size => ~0.7 Hz bins at 48 kHz
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // Remove DC and apply Half-Hann Force-Exponential Impact Window
  let mean = 0;
  for (let i = 0; i < usable; i++) mean += aligned[i];
  mean /= usable;
  const flatTopEnd = Math.min(usable, Math.round(0.012 * sampleRate));
  for (let i = 0; i < usable; i++) {
    let w = 1.0;
    if (i < preLead) {
      w = 0.5 * (1 - Math.cos((Math.PI * i) / preLead));
    } else if (i >= flatTopEnd) {
      w = 0.5 * (1 + Math.cos((Math.PI * (i - flatTopEnd)) / Math.max(1, usable - flatTopEnd)));
    }
    re[i] = (aligned[i] - mean) * w;
  }

  fftInPlace(re, im);

  const half = N / 2;
  const binHz = sampleRate / N;
  const mag = new Float64Array(half);
  const ambScale = Math.sqrt(usable);
  const ambSpec = ambientProfile?.ambientMagSpectrum;
  const isMobileMems = ambientProfile?.micType === "mems-mobile";

  for (let i = 0; i < half; i++) {
    let m = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    if (ambSpec && i < ambSpec.length) {
      // Spectral Pre-Whitening against stationary room/mic noise spectrum
      m = Math.max(0, m - 1.15 * ambSpec[i] * ambScale);
    }
    if (isMobileMems) {
      const f = i * binHz;
      if (f >= 40 && f < 240) {
        // +3 dB/oct MEMS low-frequency roll-off compensation
        const gainDb = 3.0 * Math.log2(240 / f);
        m *= Math.pow(10, gainDb / 20);
      }
    }
    mag[i] = m;
  }

  const lo = Math.max(2, Math.floor(minHz / binHz));
  const hi = Math.min(half - 2, Math.floor(maxHz / binHz));

  // local maxima list
  const cand: { i: number; m: number }[] = [];
  for (let i = lo; i <= hi; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > 1e-12) {
      cand.push({ i, m: mag[i] });
    }
  }
  if (cand.length === 0) return null;
  cand.sort((a, b) => b.m - a.m);

  // noise floor = median magnitude in range (guarded away from zero after spectral subtraction)
  const sorted = Array.from(mag.subarray(lo, hi + 1)).sort((a, b) => a - b);
  const rawMedian = sorted[Math.floor(sorted.length / 2)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const medianVal = Math.max(rawMedian, p75 * 0.35, 1e-9);
  const snrDb = Math.round(20 * Math.log10(cand[0].m / medianVal));
  if (snrDb < 8) return null;

  const refine = (i: number): number => {
    const a = Math.log(mag[i - 1] + 1e-18);
    const b = Math.log(mag[i] + 1e-18);
    const c = Math.log(mag[i + 1] + 1e-18);
    const denom = a - 2 * b + c;
    const delta = Math.abs(denom) > 1e-12 ? (0.5 * (a - c)) / denom : 0;
    return (i + Math.max(-0.5, Math.min(0.5, delta))) * binHz;
  };

  const peaks: SpectralPeak[] = [];
  for (const c of cand) {
    const hz = refine(c.i);
    if (peaks.every((p) => Math.abs(p.hz - hz) > 40)) {
      peaks.push({ hz: Math.round(hz * 10) / 10, db: 20 * Math.log10(c.m / cand[0].m) });
    }
    if (peaks.length >= 3) break;
  }

  // Half-power bandwidth around the strongest peak => Q = f0 / bw
  const top = cand[0];
  const halfPower = top.m / Math.SQRT2;
  let l = top.i;
  while (l > lo && mag[l] > halfPower) l--;
  let r = top.i;
  while (r < hi && mag[r] > halfPower) r++;
  // linear interpolation of the crossing points
  const lf = l + (halfPower - mag[l]) / Math.max(1e-18, mag[l + 1] - mag[l]);
  const rf = r - 1 + (mag[r - 1] - halfPower) / Math.max(1e-18, mag[r - 1] - mag[r]);
  const bw = Math.max(binHz * 2, (rf - lf) * binHz);
  const f0 = refine(top.i);
  const qBw = Math.max(5, Math.min(2000, Math.round(f0 / bw)));

  // Ring-down envelope decay fit over 6 sub-windows following the impact peak
  const decaySlice = aligned.subarray(Math.min(64, usable), usable);
  let q = qBw;
  const subCount = 6;
  const subLen = Math.floor(decaySlice.length / subCount);
  if (subLen >= 128) {
    let sumT = 0;
    let sumY = 0;
    let sumTT = 0;
    let sumTY = 0;
    let validPts = 0;
    for (let k = 0; k < subCount; k++) {
      let s2 = 0;
      const off = k * subLen;
      for (let j = 0; j < subLen; j++) {
        const v = decaySlice[off + j] - mean;
        s2 += v * v;
      }
      const subRms = Math.sqrt(s2 / subLen);
      if (subRms > 1e-6) {
        const tk = ((k + 0.5) * subLen) / sampleRate;
        const yk = Math.log(subRms);
        sumT += tk;
        sumY += yk;
        sumTT += tk * tk;
        sumTY += tk * yk;
        validPts++;
      }
    }
    if (validPts >= 3) {
      const denom = validPts * sumTT - sumT * sumT;
      if (Math.abs(denom) > 1e-9) {
        const slope = (validPts * sumTY - sumT * sumY) / denom;
        if (slope < -0.5) {
          const qDecay = Math.max(5, Math.min(2000, (-Math.PI * f0) / slope));
          q = Math.round(0.6 * qDecay + 0.4 * qBw);
        }
      }
    }
  }

  // Build compact waveform & spectrum preview arrays for the live oscilloscope HUD
  const waveformPreview: number[] = [];
  const waveSpan = Math.min(aligned.length, Math.round(0.055 * sampleRate));
  const wPeak = Math.max(1e-5, peakVal);
  for (let k = 0; k < 120; k++) {
    const idx = Math.min(aligned.length - 1, Math.floor((k / 120) * waveSpan));
    waveformPreview.push(Math.max(-1, Math.min(1, (aligned[idx] - mean) / wPeak)));
  }

  const spectrumPreview: { hz: number; mag: number }[] = [];
  const numBins = 64;
  const maxMag = Math.max(1e-12, top.m);
  for (let b = 0; b < numBins; b++) {
    const bLo = Math.floor(lo + (b / numBins) * (hi - lo));
    const bHi = Math.max(bLo + 1, Math.floor(lo + ((b + 1) / numBins) * (hi - lo)));
    let localMax = 0;
    for (let i = bLo; i < bHi && i <= hi; i++) {
      if (mag[i] > localMax) localMax = mag[i];
    }
    const centerHz = Math.round(((bLo + bHi) * 0.5) * binHz);
    spectrumPreview.push({ hz: centerHz, mag: Math.min(1, localMax / maxMag) });
  }

  return {
    peakHz: Math.round(f0 * 10) / 10,
    qFactor: q,
    snrDb,
    peaks,
    waveformPreview,
    spectrumPreview,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Simple averaging decimator to 16 kHz (what AST models expect). */
export function resampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return samples;
  const ratio = sampleRate / 16000;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = start; k < end; k++) s += samples[k];
    out[i] = s / Math.max(1, end - start);
  }
  return out;
}

/** 16-bit PCM mono WAV encoder. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
