import { useState, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { runCPAWithHeatmap } from '../lib/cpa.js';

function PlotDiv({ data, layout, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) Plotly.react(ref.current, data, layout);
  }, [data, layout]);
  return <div ref={ref} style={style} />;
}

const BASE_LAYOUT = {
  margin: { t: 40, r: 20, b: 50, l: 60 },
  height: 280,
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { size: 12 },
};

async function loadBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.arrayBuffer();
}

export default function RealTraces() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [peakCorr, setPeakCorr] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [sampleTrace, setSampleTrace] = useState(null);
  const [recovered, setRecovered] = useState(null);
  const [groundTruth, setGroundTruth] = useState(null);
  const [byteIdx, setByteIdx] = useState(0);
  const dataRef = useRef(null);
  const metaRef = useRef(null);

  useEffect(() => {
    setStatus('loading');
    Promise.all([
      loadBin('/data/ascad_traces.bin'),
      loadBin('/data/ascad_plaintexts.bin'),
      fetch('/data/ascad_meta.json').then(r => {
        const ct = r.headers.get('content-type') ?? '';
        if (!r.ok || ct.includes('text/html')) throw new Error(`ascad_meta.json not found (got ${r.status})`);
        return r.json();
      }),
    ])
      .then(([tracesBuf, ptBuf, meta]) => {
        dataRef.current = { tracesBuf, ptBuf };
        metaRef.current = meta;
        setStatus('ready');
      })
      .catch(e => {
        setError(e.message);
        setStatus('error');
      });
  }, []);

  async function handleRun() {
    const { tracesBuf, ptBuf } = dataRef.current;
    const meta = metaRef.current;
    const N = meta.n_traces;
    const T = meta.n_samples;
    const B = meta.n_bytes ?? 16;

    const rawTraces = new Float32Array(tracesBuf);
    const rawPts = new Uint8Array(ptBuf);

    const traces = Array.from({ length: N }, (_, i) =>
      rawTraces.subarray(i * T, (i + 1) * T)
    );
    const plaintexts = Array.from({ length: N }, (_, i) =>
      rawPts.subarray(i * B, (i + 1) * B)
    );

    setSampleTrace(Array.from(traces[0]));
    setRunning(true);
    setRecovered(null);
    setPeakCorr(null);
    setHeatmap(null);
    setProgress(0);
    setGroundTruth(meta.key ? meta.key[byteIdx] : null);

    const { peakCorr: pc } = await runCPAWithHeatmap(
      traces, plaintexts, byteIdx,
      (g, pc, hm) => {
        setProgress(Math.round((g / 255) * 100));
        setPeakCorr(new Float32Array(pc));
        setHeatmap(new Float32Array(hm));
      }
    );

    let best = 0;
    for (let i = 1; i < 256; i++) if (pc[i] > pc[best]) best = i;
    setRecovered(best);
    setRunning(false);
  }

  const leakSamples = metaRef.current?.leak_samples ?? null;
  const leakSample = leakSamples ? leakSamples[byteIdx] : null;
  const T = metaRef.current?.n_samples ?? 100;
  const truth = groundTruth;

  const traceData = sampleTrace
    ? [{ type: 'scatter', mode: 'lines', y: sampleTrace, line: { color: '#9b59b6', width: 1 } }]
    : [];

  const traceAnnotations = leakSample !== null && sampleTrace ? {
    shapes: [{
      type: 'line', x0: leakSample, x1: leakSample,
      y0: 0, y1: 1, yref: 'paper',
      line: { color: '#e74c3c', width: 1.5, dash: 'dot' },
    }],
    annotations: [{
      x: leakSample, y: 1, yref: 'paper',
      text: `leak @ ${leakSample}`, showarrow: false,
      font: { size: 11, color: '#e74c3c' }, xanchor: 'left', yanchor: 'top',
    }],
  } : {};

  const corrData = peakCorr
    ? [{
        type: 'bar',
        x: Array.from({ length: 256 }, (_, i) => i),
        y: Array.from(peakCorr),
        marker: {
          color: Array.from({ length: 256 }, (_, i) => {
            if (recovered !== null && i === recovered) return '#e74c3c';
            if (truth !== null && i === truth) return '#27ae60';
            return '#9b59b6';
          }),
        },
      }]
    : [];

  const hmData = heatmap
    ? [{
        type: 'heatmap',
        z: Array.from({ length: 256 }, (_, g) =>
          Array.from({ length: T }, (_, s) => heatmap[g * T + s])
        ),
        colorscale: 'Plasma',
        showscale: true,
      }]
    : [];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Real traces — ASCAD</h2>
      <p style={{ color: '#666', maxWidth: 860 }}>
        Synthetic traces formatted identically to the ASCAD dataset — 2000 traces × 700 samples,
        each leaking <code>HW(SBOX[plaintext[b] ⊕ key[b]])</code> at a known sample point with
        Gaussian noise. The same CPA code as the simulated tab runs here unmodified. Drop real
        ASCAD <code>.bin</code> files into <code>public/data/</code> and it works on real silicon too.
      </p>

      {status === 'loading' && (
        <p style={{ color: '#888' }}>Loading trace data…</p>
      )}

      {status === 'error' && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '12px 16px', maxWidth: 700 }}>
          <strong>Data not found.</strong> Preprocess the ASCAD dataset offline and place these files
          in <code>client/public/data/</code>:
          <ul style={{ marginTop: 8, fontSize: 13 }}>
            <li><code>ascad_traces.bin</code> — N×T <code>Float32Array</code>, row-major</li>
            <li><code>ascad_plaintexts.bin</code> — N×16 <code>Uint8Array</code></li>
            <li><code>ascad_meta.json</code> — <code>{'{ "n_traces": N, "n_samples": T, "n_bytes": 16, "key": [...] }'}</code></li>
          </ul>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 0 }}>
            Error: {error}
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', margin: '16px 0' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Key byte index (0–15)
              <input
                type="number" min={0} max={15} value={byteIdx}
                disabled={running}
                onChange={e => setByteIdx(Math.max(0, Math.min(15, Number(e.target.value))))}
                style={{ width: 80 }}
              />
            </label>
            <button
              onClick={handleRun}
              disabled={running}
              style={{ padding: '8px 18px', cursor: running ? 'not-allowed' : 'pointer' }}
            >
              {running ? `Running CPA… ${progress}%` : 'Run CPA'}
            </button>
          </div>

          {recovered !== null && (
            <div style={{ fontFamily: 'monospace', fontSize: 14, margin: '12px 0 20px', lineHeight: 1.8 }}>
              {truth !== null && (
                <>
                  <span>ground truth: </span>
                  <span style={{ color: '#888' }}>0x{truth.toString(16).padStart(2, '0')}</span>
                  {'  '}
                </>
              )}
              <span>recovered: </span>
              <span style={{ color: truth === null || recovered === truth ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
                0x{recovered.toString(16).padStart(2, '0')}
              </span>
              {'  '}
              {truth !== null && (
                <span style={{ color: recovered === truth ? '#27ae60' : '#e74c3c', fontSize: 12 }}>
                  {recovered === truth ? '✓ correct' : '✗ mismatch'}
                </span>
              )}
            </div>
          )}

          {sampleTrace && (
            <PlotDiv
              data={traceData}
              layout={{
                ...BASE_LAYOUT,
                ...traceAnnotations,
                title: `Sample power trace — byte ${byteIdx} leak marked`,
                xaxis: { title: 'sample index' },
                yaxis: { title: 'power (a.u.)' },
              }}
              style={{ width: '100%' }}
            />
          )}

          {peakCorr && (
            <PlotDiv
              data={corrData}
              layout={{
                ...BASE_LAYOUT,
                title: 'Peak |correlation| per key guess — green = truth, red = recovered',
                xaxis: { title: 'key guess (0–255)' },
                yaxis: { title: '|r|', range: [0, 1] },
              }}
              style={{ width: '100%', marginTop: 16 }}
            />
          )}

          {heatmap && (
            <PlotDiv
              data={hmData}
              layout={{
                ...BASE_LAYOUT,
                title: 'Correlation heatmap — guess × sample',
                xaxis: { title: 'sample index' },
                yaxis: { title: 'key guess' },
                height: 380,
              }}
              style={{ width: '100%', marginTop: 16 }}
            />
          )}
        </>
      )}
    </div>
  );
}
