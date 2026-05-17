import { useState, useRef, useEffect } from 'react';
import { FaPlay, FaStop, FaCheck, FaXmark, FaTriangleExclamation } from 'react-icons/fa6';
import Chart from '../components/Chart';
import { runCPA } from '../lib/cpa';
import { tracePlot, keyGuessBars, heatmap as heatmapPlot, verticalMarker, argMax } from '../lib/plots';

async function loadBin(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`fetch ${url} failed with status ${res.status}`);
    return res.arrayBuffer();
}

async function loadMeta(url){
    const r = await fetch(url);
    const ct = r.headers.get('content-type') ?? '';
    if(!r.ok || ct.includes('text/html')) throw new Error(`${url} not found (got ${r.status})`);
    return r.json();
}

//re-view the flat buffers as row-per-trace typed-array slices (no copy)
function unpack(tracesBuf, ptBuf, meta){
    const N = meta.n_traces, T = meta.n_samples, B = meta.n_bytes ?? 16;
    const rawTraces = new Float32Array(tracesBuf);
    const rawPts = new Uint8Array(ptBuf);
    const traces = Array.from({length: N}, (_, i) => rawTraces.subarray(i * T, (i + 1) * T));
    const plaintexts = Array.from({length: N}, (_, i) => rawPts.subarray(i * B, (i + 1) * B));
    return {traces, plaintexts};
}

export default function RealTraces(){
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
    const [leakSample, setLeakSample] = useState(null);
    const dataRef = useRef(null);
    const metaRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        setStatus('loading');
        Promise.all([
            loadBin('/data/ascad_traces.bin'),
            loadBin('/data/ascad_plaintexts.bin'),
            loadMeta('/data/ascad_meta.json'),
        ])
            .then(([tracesBuf, ptBuf, meta]) => {
                dataRef.current = {tracesBuf, ptBuf};
                metaRef.current = meta;
                setStatus('ready');
            })
            .catch(e => {
                setError(e.message);
                setStatus('error');
            });
    }, []);

    async function handleRun(){
        const meta = metaRef.current;
        const { traces, plaintexts } = unpack(dataRef.current.tracesBuf, dataRef.current.ptBuf, meta);

        setSampleTrace(Array.from(traces[0]));
        setRunning(true);
        setRecovered(null);
        setPeakCorr(null);
        setHeatmap(null);
        setLeakSample(null);
        setProgress(0);
        const truth = meta.key?.[byteIdx] ?? null;
        setGroundTruth(truth);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const result = await runCPA(
            traces, plaintexts, byteIdx,
            (g, pc) => {
                setProgress(Math.round((g / 255) * 100));
                setPeakCorr(new Float32Array(pc));
            },
            ctrl.signal,
        );

        if(result){
            const T = traces[0].length;
            setHeatmap(new Float32Array(result.heatmap));
            setRecovered(argMax(result.peakCorr));
            //leak sample = where the heatmap row for the ground-truth key peaks
            if(truth !== null){
                const row = result.heatmap.subarray(truth * T, (truth + 1) * T);
                setLeakSample(argMax(row));
            }
        }
        setRunning(false);
    }

    const meta = metaRef.current;
    const T = meta?.n_samples ?? 100;

    const traceLayout = {
        title: leakSample !== null
            ? `Sample power trace — byte ${byteIdx} leak at sample ${leakSample}`
            : 'Sample power trace (run CPA to locate the leak)',
        xaxis: {title: 'sample index'},
        yaxis: {title: 'power (a.u.)'},
        ...(leakSample !== null ? verticalMarker(leakSample, `leak @ ${leakSample}`) : {}),
    };

    const highlights = {
        ...(recovered !== null ? {[recovered]: '#e74c3c'} : {}),
        ...(groundTruth !== null ? {[groundTruth]: '#27ae60'} : {}),
    };

    return (
        <div style={{padding: 24}}>
            <h2 style={{marginTop: 0}}>Real traces — ASCAD</h2>
            <p style={{color: '#666', maxWidth: 860}}>
                Synthetic traces formatted identically to the ASCAD dataset — 2000 traces × 700 samples,
                each leaking <code>HW(SBOX[plaintext[b] ^ key[b]])</code> at a known sample point with
                Gaussian noise. The same CPA code as the simulated tab runs here unmodified. Drop real
                ASCAD <code>.bin</code> files into <code>public/data/</code> and it works on real silicon too.
            </p>

            {status === 'loading' && <p style={{color: '#888'}}>Loading trace data…</p>}

            {status === 'error' && (
                <div style={{background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '12px 16px', maxWidth: 700}}>
                    <strong style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
                        <FaTriangleExclamation /> Data not found.
                    </strong> Preprocess the ASCAD dataset offline and place these files
                    in <code>client/public/data/</code>:
                    <ul style={{marginTop: 8, fontSize: 13}}>
                        <li><code>ascad_traces.bin</code> — N×T <code>Float32Array</code>, row-major</li>
                        <li><code>ascad_plaintexts.bin</code> — N×16 <code>Uint8Array</code></li>
                        <li><code>ascad_meta.json</code> — <code>{'{ "n_traces": N, "n_samples": T, "n_bytes": 16, "key": [...] }'}</code></li>
                    </ul>
                    <p style={{fontSize: 12, color: '#888', marginBottom: 0}}>Error: {error}</p>
                </div>
            )}

            {status === 'ready' && (
                <>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', margin: '16px 0'}}>
                        <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13}}>
                            Key byte index (0–15)
                            <input
                                type="number" min={0} max={15} value={byteIdx} disabled={running}
                                onChange={e => setByteIdx(Math.max(0, Math.min(15, Number(e.target.value))))}
                                style={{width: 80}}
                            />
                        </label>
                        <button
                            onClick={running ? () => abortRef.current?.abort() : handleRun}
                            style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', cursor: 'pointer'}}
                        >
                            {running ? <><FaStop /> Stop ({progress}%)</> : <><FaPlay /> Run CPA</>}
                        </button>
                    </div>

                    {recovered !== null && (
                        <div style={{fontFamily: 'monospace', fontSize: 14, margin: '12px 0 20px', lineHeight: 1.8}}>
                            {groundTruth !== null && (
                                <>
                                    <span>ground truth: </span>
                                    <span style={{color: '#888'}}>0x{groundTruth.toString(16).padStart(2, '0')}</span>
                                    {'  '}
                                </>
                            )}
                            <span>recovered: </span>
                            <span style={{color: groundTruth === null || recovered === groundTruth ? '#27ae60' : '#e74c3c', fontWeight: 600}}>
                                0x{recovered.toString(16).padStart(2, '0')}
                            </span>
                            {'  '}
                            {groundTruth !== null && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    color: recovered === groundTruth ? '#27ae60' : '#e74c3c', fontSize: 12,
                                }}>
                                    {recovered === groundTruth ? <><FaCheck /> correct</> : <><FaXmark /> mismatch</>}
                                </span>
                            )}
                        </div>
                    )}

                    {sampleTrace && (
                        <Chart data={tracePlot(sampleTrace, '#9b59b6')} layout={traceLayout} />
                    )}

                    {peakCorr && (
                        <Chart
                            data={keyGuessBars(peakCorr, highlights, '#9b59b6')}
                            layout={{
                                title: 'Peak |correlation| per key guess — green = truth, red = recovered',
                                xaxis: {title: 'key guess (0–255)'},
                                yaxis: {title: '|r|', range: [0, 1]},
                            }}
                            style={{marginTop: 16}}
                        />
                    )}

                    {heatmap && (
                        <Chart
                            data={heatmapPlot(heatmap, 256, T, 'Plasma')}
                            layout={{
                                title: 'Correlation heatmap — guess × sample',
                                xaxis: {title: 'sample index'},
                                yaxis: {title: 'key guess'},
                                height: 380,
                            }}
                            style={{marginTop: 16}}
                        />
                    )}
                </>
            )}
        </div>
    );
}
