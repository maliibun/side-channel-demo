import { useState, useRef, useEffect } from 'react';
import { FaPlay, FaStop, FaTriangleExclamation } from 'react-icons/fa6';
import Card from '../components/Card';
import Chart from '../components/Chart';
import Field from '../components/Field';
import StatusPill from '../components/StatusPill';
import ControlBar from '../components/ControlBar';
import ExplainOn from '../components/ExplainOn';
import CPU3D from '../components/CPU3D';
import Histogram from '../components/Histogram';
import Waveform from '../components/Waveform';
import Rankplot from '../components/Rankplot';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { runCPA } from '../lib/cpa';
import { argMax, maxOf, heatmap as heatmapPlot } from '../lib/plots';

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

//rank of `truth` among 256 candidates in peakCorr (1 = best)
function rankOf(peakCorr, truth){
    const t = peakCorr[truth];
    let rank = 1;
    for(let i = 0; i < 256; i++){
        if(i !== truth && peakCorr[i] > t) rank++;
    }
    return rank;
}

//pick milestones that build the rank-vs-traces curve (geometric so early progress is visible)
function buildMilestones(totalN){
    const candidates = [50, 100, 200, 400, 800, 1600, totalN];
    const seen = new Set();
    return candidates.filter(n => n <= totalN && !seen.has(n) && seen.add(n));
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
    const [ranks, setRanks] = useState([]);
    const [maxTraces, setMaxTraces] = useState(2000);
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
                setMaxTraces(meta.n_traces ?? 2000);
                setStatus('ready');
                //preview the first trace right away so the waveform card isn't empty
                if(meta.n_samples){
                    const view = new Float32Array(tracesBuf, 0, meta.n_samples);
                    setSampleTrace(Array.from(view));
                }
            })
            .catch(e => {
                setError(e.message);
                setStatus('error');
            });
    }, []);

    async function handleRun(){
        const meta = metaRef.current;
        const unpacked = unpack(dataRef.current.tracesBuf, dataRef.current.ptBuf, meta);
        //clip to user-selected maxTraces
        const n = Math.min(Math.max(50, maxTraces), unpacked.traces.length);
        const traces = unpacked.traces.slice(0, n);
        const plaintexts = unpacked.plaintexts.slice(0, n);

        setSampleTrace(Array.from(traces[0]));
        setRunning(true);
        setRecovered(null);
        setPeakCorr(null);
        setHeatmap(null);
        setLeakSample(null);
        setRanks([]);
        setProgress(0);
        const truth = meta.key?.[byteIdx] ?? null;
        setGroundTruth(truth);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        //rank-vs-traces curve: run CPA on growing subsets of traces, record rank at each milestone
        //the final milestone's result is also the "full" CPA we display
        const totalN = traces.length;
        const milestones = buildMilestones(totalN);
        const milestoneRanks = [];
        let finalResult = null;

        for(let mi = 0; mi < milestones.length; mi++){
            if(ctrl.signal.aborted) break;
            const n = milestones[mi];
            const subTraces = traces.slice(0, n);
            const subPts = plaintexts.slice(0, n);

            const result = await runCPA(
                subTraces, subPts, byteIdx,
                (g, pc) => {
                    //overall progress: each milestone weighted equally
                    const milestoneFrac = (g + 1) / 256;
                    const overall = (mi + milestoneFrac) / milestones.length;
                    setProgress(Math.round(overall * 100));
                    setPeakCorr(new Float32Array(pc));
                },
                ctrl.signal,
            );
            if(!result) break;
            finalResult = result;

            if(truth !== null){
                milestoneRanks.push({n, rank: rankOf(result.peakCorr, truth)});
                setRanks([...milestoneRanks]);
            }
        }

        if(finalResult){
            const T = traces[0].length;
            setPeakCorr(new Float32Array(finalResult.peakCorr));
            setHeatmap(new Float32Array(finalResult.heatmap));
            setRecovered(argMax(finalResult.peakCorr));
            //leak sample = where the heatmap row for the ground-truth key peaks
            if(truth !== null){
                const row = finalResult.heatmap.subarray(truth * T, (truth + 1) * T);
                setLeakSample(argMax(row));
            }
        }
        setRunning(false);
    }

    const meta = metaRef.current;
    const T = meta?.n_samples ?? 700;
    const totalN = maxTraces;
    const datasetN = meta?.n_traces ?? 2000;

    const currentRank = ranks.length ? ranks[ranks.length - 1].rank : null;
    const converged = currentRank === 1;
    const pillKind = running ? 'live'
        : recovered === null ? 'neutral'
        : recovered === groundTruth ? 'ok' : 'bad';
    const pillLabel = running ? `running ${progress}%`
        : recovered === null ? 'idle'
        : recovered === groundTruth ? 'recovered' : 'mismatch';

    return (
        <div className="demo">
            <header className="demo__head">
                <h2>Real traces (ASCAD)</h2>
            </header>

            {status === 'loading' && <p className="muted mono">Loading trace data…</p>}

            {status === 'error' && (
                <Card title={<span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}><FaTriangleExclamation /> Data not found</span>}>
                    <p style={{marginTop: 0, color: 'var(--ink-2)'}}>
                        Preprocess the ASCAD dataset offline and place these files in <code>client/public/data/</code>:
                    </p>
                    <ul className="mono" style={{fontSize: 12.5}}>
                        <li><code>ascad_traces.bin</code> - NxT Float32Array</li>
                        <li><code>ascad_plaintexts.bin</code> - Nx16 Uint8Array</li>
                        <li><code>ascad_meta.json</code> - {'{n_traces, n_samples, n_bytes, key}'}</li>
                    </ul>
                    <p className="muted mono" style={{fontSize: 12, marginBottom: 0}}>Error: {error}</p>
                </Card>
            )}

            {status === 'ready' && (
                <>
                    <ControlBar>
                        <ExplainOn
                            title="ASCAD attack controls"
                            body={<>
                                <p><strong>AES</strong> (Advanced Encryption Standard) is the symmetric cipher the world runs on - your phone, your bank, TLS, disk encryption. AES-128 takes a 16-byte (128-bit) secret key and turns plaintext into ciphertext through repeated rounds of substitution and mixing. The first step of each encryption uses a lookup table called the <strong>S-box</strong> on <code>plaintext ^ key</code>, and that's exactly the operation CPA targets.</p>
                                <p><strong>EM</strong> = electromagnetic. When a chip switches transistors it emits tiny radio-frequency bursts. A pickup coil held over the package records those bursts as a "trace" - a list of voltage samples over time.</p>
                                <p><strong>ASCAD</strong> (ANSSI SCA Database) is the standard public dataset for side-channel research, released by France's national cybersecurity agency in 2018. It contains 60,000 real EM traces captured from an ATMega8515 microcontroller running AES-128 - the same kind of 8-bit chip you'd find in legacy smart cards. The data shipped with this demo is a preprocessed slice of that dataset (originally distributed as HDF5; converted here to flat binary so the browser can load it).</p>
                                <p><strong>Key byte index (0-15)</strong>: which of the 16 AES key bytes to attack. Each byte is recovered independently - to get the full 128-bit key you'd repeat the attack 16 times.</p>
                                <p><strong>Max traces</strong>: cap the number of traces fed to CPA. Internally CPA runs at growing trace counts (50, 100, 200, ... up to this cap) so the guessing-entropy curve descends point-by-point. Lower cap = faster, but possibly worse final rank.</p>
                            </>}
                        >
                            <div className="controls">
                                <Field label="Key byte index (0-15)">
                                    <input type="number" min={0} max={15} value={byteIdx} disabled={running}
                                        onChange={e => setByteIdx(Math.max(0, Math.min(15, Number(e.target.value))))} />
                                </Field>
                                <Field label="Target subkey">
                                    <div className="readout mono">k{byteIdx} (S-box out)</div>
                                </Field>
                                <Field label={`Max traces (50-${datasetN})`}>
                                    <input
                                        type="number" min={50} max={datasetN} step={50}
                                        value={maxTraces} disabled={running}
                                        onChange={e => setMaxTraces(Math.max(50, Math.min(datasetN, Number(e.target.value))))}
                                    />
                                </Field>
                                <Field label="Current rank">
                                    <div className="readout mono">
                                        {currentRank === null ? '-' : `#${currentRank}`}
                                        {currentRank !== null && (
                                            <span className={'readout__tag ' + (converged ? 'readout__tag--ok' : 'readout__tag--warn')}>
                                                {converged ? 'recovered' : 'searching'}
                                            </span>
                                        )}
                                    </div>
                                </Field>
                                <div className="controls__actions">
                                    {!running
                                        ? <PrimaryButton icon={<FaPlay />} onClick={handleRun}>Run attack</PrimaryButton>
                                        : <SecondaryButton icon={<FaStop />} onClick={() => abortRef.current?.abort()}>Stop ({progress}%)</SecondaryButton>}
                                </div>
                            </div>
                        </ExplainOn>
                    </ControlBar>

                    <ExplainOn
                        title="Physical attack setup"
                        body={<>
                            <p>Side-channel attacks need physical access to the target. The attacker places an <strong>EM probe</strong> (electromagnetic pickup coil, often a few mm of wire wound into a loop) directly above the chip's package. As current flows through the chip's transistors during encryption, it generates a tiny magnetic field that induces a measurable voltage in the coil - that's the trace.</p>
                            <p>Crucially, the attacker doesn't need to open the chip or read its memory. The leakage radiates through the plastic packaging on its own. This is what makes side channels so dangerous: any device you can physically touch (or get close to) is potentially vulnerable.</p>
                            <p>The <strong>red rings</strong> in the 3D view represent EM bursts being captured into the trace dataset. Their pulse rate speeds up while an attack is in progress.</p>
                        </>}
                    >
                        <div className="cpu3d-wrap">
                            <div className="cpu3d-wrap__head">
                                <h3>Target - physical setup</h3>
                                <StatusPill kind={running ? 'live' : 'neutral'}>
                                    {running ? 'capturing EM' : 'idle'}
                                </StatusPill>
                            </div>
                            <CPU3D attacking={running} />
                        </div>
                    </ExplainOn>

                    <div className="grid grid--2">
                        <ExplainOn
                            title="Guessing entropy"
                            body={<>
                                <p>What is <strong>rank</strong>? After CPA, each of the 256 candidate key bytes gets a correlation score. Sort those scores from highest to lowest; the rank of the <em>true</em> key is its position in that list. Rank 1 = it scored highest = key recovered. Rank 128 is no better than random guessing.</p>
                                <p>Each dot on the curve is one CPA run at that many traces (the x-axis is log-scaled). With only 50 traces there isn't enough data and the rank bounces around. Around 200-400 traces the truth pulls ahead of the noise and rank drops to 1, where it stays for the rest of the run.</p>
                                <p>This is the standard side-channel paper plot - it answers <em>how many traces an attacker needs</em>. Curves that hit rank 1 with fewer traces mean the implementation leaks more.</p>
                            </>}
                        >
                            <Card
                                title="Guessing entropy"
                                right={<span className="muted mono">{currentRank !== null ? `current rank #${currentRank}` : 'idle'}</span>}
                            >
                                <Rankplot points={ranks} maxN={totalN} empty="no attack - press Run attack" />
                            </Card>
                        </ExplainOn>

                        <ExplainOn
                            title="EM trace from the chip"
                            body={<>
                                <p>A single trace from the dataset - the EM signal recorded during one AES encryption on the target chip. The full set has thousands of these; this card shows the first.</p>
                                <p>After CPA finishes, the <strong>red dashed window</strong> marks the <em>point-of-interest (POI)</em>: the sample index where the chip's emissions leak the most key information. CPA finds this position automatically by scanning every sample - you don't need to know it ahead of time.</p>
                            </>}
                        >
                            <Card title="EM trace - ATMega8515" right={<span className="muted mono">{T} samples · 100 MS/s</span>}>
                                <Waveform
                                    data={sampleTrace}
                                    height="em"
                                    leak={leakSample !== null
                                        ? {start: Math.max(0, leakSample - 20), end: Math.min(T, leakSample + 20), label: `POI: t≈${leakSample}`}
                                        : null}
                                    empty="awaiting trace acquisition"
                                />
                            </Card>
                        </ExplainOn>
                    </div>

                    <ExplainOn
                        title="Correlation - real EM traces"
                        body={<>
                            <p>One bar per candidate value of key byte k<sub>{byteIdx}</sub>. Bar height = peak |Pearson correlation| between the leakage prediction <code>HW(SBOX[plaintext ^ candidate])</code> and the real EM measurements.</p>
                            <p>With enough traces, the <strong>true byte</strong> rises clearly above the noise floor. Same algorithm, same shape as the simulated tab - only difference is that the signal is real electromagnetic emissions from a physical chip.</p>
                            <p><strong>Green</strong> bar = ground truth (from the dataset metadata). <strong>Red</strong> bar = what CPA picked. They should overlap.</p>
                        </>}
                    >
                        <Card
                            title={`Correlation per key-byte hypothesis - k${byteIdx}`}
                            right={<StatusPill kind={pillKind}>{pillLabel}</StatusPill>}
                        >
                            <Histogram
                                values={peakCorr}
                                peakIdx={recovered ?? -1}
                                truthIdx={groundTruth ?? -1}
                                yLabels={['1.0', '0.5', '0.0']}
                                empty="Press Run attack to start CPA."
                                formatTip={v => `ρ = ${v.toFixed(3)}`}
                            />
                            <div className="histogram__legend">
                                <span className="mono muted">candidate 0x00</span>
                                <span className="mono muted">
                                    peak ρ = {peakCorr ? maxOf(peakCorr).toFixed(3) : '-'}
                                    {recovered !== null && groundTruth !== null && recovered === groundTruth && (
                                        <span className="readout__tag readout__tag--ok" style={{marginLeft: 8}}>correct</span>
                                    )}
                                </span>
                                <span className="mono muted">0xFF</span>
                            </div>
                        </Card>
                    </ExplainOn>

                    <ExplainOn
                        title="Dataset metadata"
                        body={<>
                            <p>Properties of the trace set: the target chip, the cipher, how many traces and how long each one is, and the leakage model CPA assumes.</p>
                            <p><strong>Leakage model</strong> = the formula the attacker bets the chip leaks. <code>HW(SBOX(p ^ k))</code> means "Hamming weight of the S-box output of plaintext XOR key" - i.e. CPA predicts that, at the leak moment, the chip's power/EM is proportional to how many 1-bits are in the S-box output. This model fits unprotected 8-bit microcontrollers like the one in ASCAD remarkably well.</p>
                            <p>This repo ships ASCAD-format traces (compatible with the file layout from ANSSI's public dataset) so the demo runs offline. Drop a real <code>.bin</code> derived from the original HDF5 dataset into <code>client/public/data/</code> and the same CPA code attacks genuine silicon emissions.</p>
                        </>}
                    >
                        <Card title="Dataset metadata" right={<StatusPill kind="neutral">ASCAD-format</StatusPill>}>
                            <div className="meta">
                                <div className="meta__cell"><span className="meta__label">Target</span><span className="meta__val mono">ATMega8515 @ 4 MHz</span></div>
                                <div className="meta__cell"><span className="meta__label">Cipher</span><span className="meta__val mono">AES-128</span></div>
                                <div className="meta__cell"><span className="meta__label">Traces</span><span className="meta__val mono">{totalN}</span></div>
                                <div className="meta__cell"><span className="meta__label">Samples / trace</span><span className="meta__val mono">{T}</span></div>
                                <div className="meta__cell"><span className="meta__label">Key bytes</span><span className="meta__val mono">{meta?.n_bytes ?? 16}</span></div>
                                <div className="meta__cell"><span className="meta__label">Leakage model</span><span className="meta__val mono">HW(SBOX(p ^ k))</span></div>
                            </div>
                        </Card>
                    </ExplainOn>

                    {heatmap && (
                        <ExplainOn
                            title="Correlation heatmap (advanced)"
                            body={<>
                                <p>The full correlation matrix CPA computed: <strong>256 rows</strong> (candidate key bytes) x <strong>{T} columns</strong> (sample positions in time). Each cell holds the |Pearson correlation| at that (candidate, sample) pair. Brighter = stronger correlation.</p>
                                <p>How to read it: the brightest column tells you <em>when</em> the chip leaks (the point-of-interest). Within that column, the brightest row tells you <em>which</em> key byte. One bright pixel reveals both pieces of information.</p>
                                <p>In a real attack on unknown hardware you don't know the leak position in advance - this scan-everything view is exactly how you'd find it. Look for one hot pixel against a uniformly cool background.</p>
                            </>}
                        >
                            <Card title="Correlation heatmap" right={<span className="muted mono">guess × sample</span>}>
                                <Chart
                                    data={heatmapPlot(heatmap, 256, T, {
                                        colorscale: 'Hot',
                                        //clip noise floor at 30% of peak so the bright cell pops
                                        zmin: maxOf(heatmap) * 0.3,
                                        zmax: maxOf(heatmap),
                                    })}
                                    layout={{
                                        xaxis: {title: 'sample index'},
                                        yaxis: {title: 'key guess'},
                                        height: 360,
                                        margin: {t: 10, r: 10, b: 40, l: 60},
                                    }}
                                />
                            </Card>
                        </ExplainOn>
                    )}
                </>
            )}
        </div>
    );
}
