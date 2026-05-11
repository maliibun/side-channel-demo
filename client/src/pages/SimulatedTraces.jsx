import { useState, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { generateSimTraces, runCPAWithHeatmap } from '../lib/cpa.js';

function PlotDiv({ data, layout, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) Plotly.react(ref.current, data, layout);
  }, [data, layout]);
  return <div ref={ref} style={style} />;
}

const BASE_LAYOUT = {
  margin: { t: 40, r: 20, b: 50, l: 60 },
  height: 260,
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { size: 12 },
};

export default function SimulatedTraces() {
  const [keyByte, setKeyByte] = useState(0xab);
  const [nTraces, setNTraces] = useState(200);
  const [sigma, setSigma] = useState(2);
  const [running, setRunning] = useState(false);
  const [peakCorr, setPeakCorr] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [sampleTrace, setSampleTrace] = useState(null);
  const [recovered, setRecovered] = useState(null);
  const [progress, setProgress] = useState(0);
  const stateRef = useRef({});

  async function handleRun() {
    setRunning(true);
    setRecovered(null);
    setPeakCorr(null);
    setHeatmap(null);
    setProgress(0);

    await new Promise(r => setTimeout(r, 0));

    const { traces, plaintexts } = generateSimTraces(keyByte, nTraces, sigma);
    setSampleTrace(Array.from(traces[0]));

    const T = traces[0].length;
    stateRef.current = { T };

    const { peakCorr: pc, heatmap: hm } = await runCPAWithHeatmap(
      traces, plaintexts, 0,
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

  const T = stateRef.current.T ?? 100;

  const traceData = sampleTrace
    ? [{ type: 'scatter', mode: 'lines', y: sampleTrace, line: { color: '#3498db', width: 1 } }]
    : [];

  const corrData = peakCorr
    ? [{
        type: 'bar',
        x: Array.from({ length: 256 }, (_, i) => i),
        y: Array.from(peakCorr),
        marker: {
          color: Array.from({ length: 256 }, (_, i) => {
            if (recovered !== null && i === recovered) return '#e74c3c';
            if (i === keyByte) return '#27ae60';
            return '#3498db';
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
        colorscale: 'Viridis',
        showscale: true,
      }]
    : [];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Simulated power traces — CPA</h2>
      <p style={{ color: '#666', maxWidth: 860 }}>
        Each trace is a synthetic power measurement. One sample at position 50
        leaks <code>HW(SBOX[plaintext ⊕ key])</code>; the rest is Gaussian noise.
        CPA computes the Pearson correlation between power hypotheses and trace
        columns for all 256 key guesses — the correct guess peaks.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', margin: '16px 0' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Key byte (0–255)
          <input
            type="number" min={0} max={255} value={keyByte}
            disabled={running}
            onChange={e => setKeyByte(Math.max(0, Math.min(255, Number(e.target.value))))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Traces (N)
          <input
            type="number" min={50} max={2000} step={50} value={nTraces}
            disabled={running}
            onChange={e => setNTraces(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Noise σ
          <input
            type="number" min={0} max={10} step={0.5} value={sigma}
            disabled={running}
            onChange={e => setSigma(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ padding: '8px 18px', cursor: running ? 'not-allowed' : 'pointer' }}
        >
          {running ? `Running… ${progress}%` : 'Run CPA'}
        </button>
      </div>

      {recovered !== null && (
        <div style={{ fontFamily: 'monospace', fontSize: 14, margin: '12px 0 20px', lineHeight: 1.8 }}>
          <span>key byte: </span>
          <span style={{ color: '#888' }}>0x{keyByte.toString(16).padStart(2, '0')}</span>
          {'  '}
          <span>recovered: </span>
          <span style={{ color: recovered === keyByte ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
            0x{recovered.toString(16).padStart(2, '0')}
          </span>
          {'  '}
          <span style={{ color: recovered === keyByte ? '#27ae60' : '#e74c3c', fontSize: 12 }}>
            {recovered === keyByte ? '✓ correct' : '✗ mismatch — try more traces or less noise'}
          </span>
        </div>
      )}

      {sampleTrace && (
        <PlotDiv
          data={traceData}
          layout={{
            ...BASE_LAYOUT,
            title: 'Sample power trace (1 of N)',
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
    </div>
  );
}
