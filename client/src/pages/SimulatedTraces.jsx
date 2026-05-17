import { useState, useRef } from 'react';
import { FaPlay, FaStop, FaCheck, FaXmark } from 'react-icons/fa6';
import Chart from '../components/Chart';
import { generateSimTraces, runCPA } from '../lib/cpa';
import { tracePlot, keyGuessBars, heatmap as heatmapPlot, argMax } from '../lib/plots';

export default function SimulatedTraces(){
    const [keyByte, setKeyByte] = useState(0xab);
    const [nTraces, setNTraces] = useState(200);
    const [sigma, setSigma] = useState(2);
    const [running, setRunning] = useState(false);
    const [peakCorr, setPeakCorr] = useState(null);
    const [heatmap, setHeatmap] = useState(null);
    const [sampleTrace, setSampleTrace] = useState(null);
    const [recovered, setRecovered] = useState(null);
    const [progress, setProgress] = useState(0);
    const abortRef = useRef(null);

    async function handleRun(){
        setRunning(true);
        setRecovered(null);
        setPeakCorr(null);
        setHeatmap(null);
        setProgress(0);
        await new Promise(r => setTimeout(r, 0));

        const { traces, plaintexts } = generateSimTraces(keyByte, nTraces, sigma);
        setSampleTrace(Array.from(traces[0]));

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const result = await runCPA(
            traces, plaintexts, 0,
            (g, pc) => {
                setProgress(Math.round((g / 255) * 100));
                setPeakCorr(new Float32Array(pc));
            },
            ctrl.signal,
        );

        if(result){
            setHeatmap(new Float32Array(result.heatmap));
            setRecovered(argMax(result.peakCorr));
        }
        setRunning(false);
    }

    const T = sampleTrace?.length ?? 100;
    const highlights = {
        ...(recovered !== null ? {[recovered]: '#e74c3c'} : {}),
        [keyByte]: '#27ae60',
    };

    return (
        <div style={{padding: 24}}>
            <h2 style={{marginTop: 0}}>Simulated power traces — CPA</h2>
            <p style={{color: '#666', maxWidth: 860}}>
                Each trace is a synthetic power measurement. One sample at position 50
                leaks <code>HW(SBOX[plaintext ^ key])</code>; the rest is Gaussian noise.
                CPA computes the Pearson correlation between power hypotheses and trace
                columns for all 256 key guesses — the correct guess peaks.
            </p>

            <div style={{display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', margin: '16px 0'}}>
                <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13}}>
                    Key byte (0–255)
                    <input
                        type="number" min={0} max={255} value={keyByte} disabled={running}
                        onChange={e => setKeyByte(Math.max(0, Math.min(255, Number(e.target.value))))}
                        style={{width: 80}}
                    />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13}}>
                    Traces (N)
                    <input
                        type="number" min={50} max={2000} step={50} value={nTraces} disabled={running}
                        onChange={e => setNTraces(Number(e.target.value))}
                        style={{width: 80}}
                    />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13}}>
                    Noise σ
                    <input
                        type="number" min={0} max={10} step={0.5} value={sigma} disabled={running}
                        onChange={e => setSigma(Number(e.target.value))}
                        style={{width: 70}}
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
                    <span>key byte: </span>
                    <span style={{color: '#888'}}>0x{keyByte.toString(16).padStart(2, '0')}</span>
                    {'  '}
                    <span>recovered: </span>
                    <span style={{color: recovered === keyByte ? '#27ae60' : '#e74c3c', fontWeight: 600}}>
                        0x{recovered.toString(16).padStart(2, '0')}
                    </span>
                    {'  '}
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: recovered === keyByte ? '#27ae60' : '#e74c3c', fontSize: 12,
                    }}>
                        {recovered === keyByte
                            ? <><FaCheck /> correct</>
                            : <><FaXmark /> mismatch — try more traces or less noise</>}
                    </span>
                </div>
            )}

            {sampleTrace && (
                <Chart
                    data={tracePlot(sampleTrace)}
                    layout={{
                        title: 'Sample power trace (1 of N)',
                        xaxis: {title: 'sample index'},
                        yaxis: {title: 'power (a.u.)'},
                    }}
                />
            )}

            {peakCorr && (
                <Chart
                    data={keyGuessBars(peakCorr, highlights)}
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
                    data={heatmapPlot(heatmap, 256, T)}
                    layout={{
                        title: 'Correlation heatmap — guess × sample',
                        xaxis: {title: 'sample index'},
                        yaxis: {title: 'key guess'},
                        height: 380,
                    }}
                    style={{marginTop: 16}}
                />
            )}
        </div>
    );
}
