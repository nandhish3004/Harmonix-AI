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

export function analyzeTapSignal(
  samples: Float32Array,
  sampleRate: number,
  minHz = 100,
  maxHz = 4000
): TapAnalysis | null {
  const usable = Math.min(samples.length, 32768);
  if (usable < 2048) return null;

  const N = 65536; // zero-padded size => ~0.7 Hz bins at 48 kHz
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // remove DC and apply Hann window
  let mean = 0;
  for (let i = 0; i < usable; i++) mean += samples[i];
  mean /= usable;
  for (let i = 0; i < usable; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (usable - 1)));
    re[i] = (samples[i] - mean) * w;
  }

  fftInPlace(re, im);

  const half = N / 2;
  const binHz = sampleRate / N;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);

  const lo = Math.max(2, Math.floor(minHz / binHz));
  const hi = Math.min(half - 2, Math.floor(maxHz / binHz));

  // local maxima list
  const cand: { i: number; m: number }[] = [];
  for (let i = lo; i <= hi; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) cand.push({ i, m: mag[i] });
  }
  if (cand.length === 0) return null;
  cand.sort((a, b) => b.m - a.m);

  // noise floor = median magnitude in range
  const sorted = Array.from(mag.subarray(lo, hi + 1)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-12;

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
  const q = Math.max(5, Math.min(2000, Math.round(f0 / bw)));

  return {
    peakHz: Math.round(f0 * 10) / 10,
    qFactor: q,
    snrDb: Math.round(20 * Math.log10(top.m / median)),
    peaks,
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
