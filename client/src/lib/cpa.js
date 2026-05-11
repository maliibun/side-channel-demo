import { SBOX, HW } from './aes.js';

function pearson(xs, ys, n) {
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

export function runCPA(traces, plaintexts, byteIdx) {
  const N = traces.length;
  const T = traces[0].length;
  const hyp = new Float32Array(N);
  const correlations = new Float32Array(256);

  for (let g = 0; g < 256; g++) {
    for (let t = 0; t < N; t++) {
      hyp[t] = HW[SBOX[plaintexts[t][byteIdx] ^ g]];
    }
    let best = 0;
    for (let s = 0; s < T; s++) {
      const col = new Float32Array(N);
      for (let t = 0; t < N; t++) col[t] = traces[t][s];
      const r = Math.abs(pearson(hyp, col, N));
      if (r > best) best = r;
    }
    correlations[g] = best;
  }
  return correlations;
}

export async function runCPAWithHeatmap(traces, plaintexts, byteIdx, onSample) {
  const N = traces.length;
  const T = traces[0].length;
  const hyp = new Float32Array(N);
  const heatmap = new Float32Array(256 * T);
  const peakCorr = new Float32Array(256);

  for (let g = 0; g < 256; g++) {
    for (let t = 0; t < N; t++) {
      hyp[t] = HW[SBOX[plaintexts[t][byteIdx] ^ g]];
    }
    for (let s = 0; s < T; s++) {
      const col = new Float32Array(N);
      for (let t = 0; t < N; t++) col[t] = traces[t][s];
      const r = pearson(hyp, col, N);
      heatmap[g * T + s] = Math.abs(r);
      if (Math.abs(r) > peakCorr[g]) peakCorr[g] = Math.abs(r);
    }
    if (g % 16 === 15) {
      onSample?.(g, peakCorr, heatmap);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  onSample?.(255, peakCorr, heatmap);
  return { peakCorr, heatmap };
}

export function generateSimTraces(keyByte, N, sigma, T = 100, leakSample = 50) {
  const traces = [];
  const plaintexts = [];
  for (let i = 0; i < N; i++) {
    const p = Math.random() * 256 | 0;
    plaintexts.push(new Uint8Array([p]));
    const trace = new Float32Array(T);
    for (let s = 0; s < T; s++) {
      trace[s] = (Math.random() - 0.5) * 2 * sigma;
    }
    trace[leakSample] += HW[SBOX[p ^ keyByte]];
    traces.push(trace);
  }
  return { traces, plaintexts };
}
