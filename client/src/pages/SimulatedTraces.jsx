import { useState, useRef } from 'react';
import { FaPlay, FaStop, FaCheck, FaXmark } from 'react-icons/fa6';
import Card from '../components/Card';
import Chart from '../components/Chart';
import Field from '../components/Field';
import StatusPill from '../components/StatusPill';
import ControlBar from '../components/ControlBar';
import ExplainOn from '../components/ExplainOn';
import Histogram from '../components/Histogram';
import Waveform from '../components/Waveform';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { generateSimTraces, runCPA } from '../lib/cpa';
import { argMax, maxOf, heatmap as heatmapPlot } from '../lib/plots';

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
            setRecovered(argMax(result.peakCorr));
            setHeatmap(new Float32Array(result.heatmap));
        }
        setRunning(false);
    }

    //convergence rows - true byte vs top 3 ghost peaks
    let convergence = null;
    if(peakCorr){
        const truth = peakCorr[keyByte] ?? 0;
        const ghosts = Array.from(peakCorr)
            .map((c, b) => [b, c])
            .filter(([b]) => b !== keyByte)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        convergence = { truth, ghosts };
    }

    const pillKind = running ? 'live'
        : recovered === null ? 'neutral'
        : recovered === keyByte ? 'ok' : 'bad';
    const pillLabel = running ? `running ${progress}%`
        : recovered === null ? 'idle'
        : recovered === keyByte ? 'recovered' : 'mismatch';

    return (
        <div className="demo">
            <header className="demo__head">
                <h2>Simulated traces (CPA)</h2>
            </header>

            <ControlBar>
                <ExplainOn
                    title="CPA controls"
                    body={<>
                        <p><strong>AES</strong> (Advanced Encryption Standard) is the symmetric block cipher used by basically every encrypted system you touch - TLS, disk encryption, messaging apps. AES-128 has a 16-byte secret key and encrypts data 16 bytes at a time. The very first thing it does to a block is compute <code>SBOX[plaintext ^ key]</code> for each byte, and that one operation is the target of this whole demo.</p>
                        <p><strong>CPA</strong> = Correlation Power Analysis. The idea: when a chip computes <code>SBOX[plaintext ^ key]</code>, the power it draws scales with the <em>Hamming weight</em> of the result - the count of 1-bits in that byte (e.g. <code>HW(0xFF)=8</code>, <code>HW(0x01)=1</code>). For each candidate key, predict that power; the candidate whose prediction correlates best with the real measurements is the right one.</p>
                        <p><strong>Key byte (0-255)</strong>: the secret value we pretend the chip is using. CPA's job is to find it.</p>
                        <p><strong>Traces (N)</strong>: how many synthetic power measurements to generate. Each trace = one AES encryption with a random plaintext. More traces = less noise = cleaner peak.</p>
                        <p><strong>Noise sigma</strong>: standard deviation of the Gaussian noise added to every sample. High sigma buries the leak; you need many more traces to recover.</p>
                    </>}
                >
                    <div className="controls">
                        <Field label="Key byte (0-255)">
                            <input type="number" min={0} max={255} value={keyByte} disabled={running}
                                onChange={e => setKeyByte(Math.max(0, Math.min(255, Number(e.target.value))))} />
                        </Field>
                        <Field label="Traces (N)">
                            <input type="number" min={50} max={2000} step={50} value={nTraces} disabled={running}
                                onChange={e => setNTraces(Number(e.target.value))} />
                        </Field>
                        <Field label="Noise sigma">
                            <input type="number" min={0} max={10} step={0.5} value={sigma} disabled={running}
                                onChange={e => setSigma(Number(e.target.value))} />
                        </Field>
                        <Field label="Best guess">
                            <div className="readout mono">
                                {recovered === null ? '··' : '0x' + recovered.toString(16).padStart(2, '0').toUpperCase()}
                                {recovered !== null && (
                                    <span className={'readout__tag ' + (recovered === keyByte ? 'readout__tag--ok' : 'readout__tag--bad')}>
                                        {recovered === keyByte ? 'correct' : 'mismatch'}
                                    </span>
                                )}
                            </div>
                        </Field>
                        <div className="controls__actions">
                            {!running
                                ? <PrimaryButton icon={<FaPlay />} onClick={handleRun}>Acquire traces</PrimaryButton>
                                : <SecondaryButton icon={<FaStop />} onClick={() => abortRef.current?.abort()}>Stop ({progress}%)</SecondaryButton>}
                        </div>
                    </div>
                </ExplainOn>
            </ControlBar>

            <div className="grid grid--2">
                <ExplainOn
                    title="Correlation per key-byte"
                    body={<>
                        <p>One bar per candidate key byte (0 through 255). Bar height = peak <strong>Pearson correlation</strong> |ρ| between the predicted leakage <code>HW(SBOX[plaintext ^ candidate])</code> and the power values measured across all traces.</p>
                        <p><strong>Pearson ρ</strong> is a number from 0 to 1: 0 means the prediction and the measurement are unrelated; 1 means they move in lockstep. We use |ρ| (absolute value) because both positive and negative correlations are evidence of a relationship.</p>
                        <p>The correct candidate produces a clear peak (typically 0.4 to 0.9). Wrong candidates stay near the noise floor (under 0.1). Red = the candidate CPA picked, green = ground truth - they should overlap.</p>
                    </>}
                >
                    <Card title="Correlation per key-byte hypothesis" right={<span className="muted mono">ρ ∈ [0, 1]</span>}>
                        <Histogram
                            values={peakCorr}
                            peakIdx={recovered ?? -1}
                            truthIdx={keyByte}
                            yLabels={['1.0', '0.5', '0.0']}
                            empty="Press Acquire traces to run CPA."
                            formatTip={v => `ρ = ${v.toFixed(3)}`}
                        />
                        <div className="histogram__legend">
                            <span className="mono muted">candidate 0x00</span>
                            <span className="mono muted">peak ρ = {peakCorr ? maxOf(peakCorr).toFixed(3) : '-'}</span>
                            <span className="mono muted">0xFF</span>
                        </div>
                    </Card>
                </ExplainOn>

                <ExplainOn
                    title="Power trace"
                    body={<>
                        <p>One synthetic power trace - a list of power values over time, like what an oscilloscope would record from a probe on the chip during one AES encryption.</p>
                        <p>This trace leaks at exactly one sample point: at that sample the value equals <code>HW(SBOX[plaintext ^ key])</code> plus Gaussian noise. Everywhere else is pure noise.</p>
                        <p>The <strong>red dashed window</strong> marks the leak position. To the eye, a single trace looks like random noise - only statistics across hundreds of traces reveal the leak.</p>
                    </>}
                >
                    <Card title="Power trace (sample)" right={<span className="muted mono">µV over time</span>}>
                        <Waveform
                            data={sampleTrace}
                            leak={sampleTrace ? {start: 45, end: 55, label: 'S-box leak'} : null}
                            empty="no acquisition - press Acquire traces"
                        />
                    </Card>
                </ExplainOn>
            </div>

            {convergence && (
                <ExplainOn
                    title="Convergence"
                    body={<>
                        <p>A close-up on the top 4 correlations: the true key (red bar) and the three highest-scoring wrong candidates. Wrong-but-high-scoring candidates are called <em>ghost peaks</em> - they correlate with the data by coincidence.</p>
                        <p>A successful attack shows the true key clearly ahead of the ghosts. If a ghost is close to the true key, the attack is borderline - feed it more traces or lower the noise sigma.</p>
                    </>}
                >
                    <Card title="Convergence" right={<span className="muted mono">true byte ρ vs. ghost peaks</span>}>
                        <div className="convergence">
                            <div className="convergence__row">
                                <span className="convergence__label mono">true k = 0x{keyByte.toString(16).padStart(2, '0').toUpperCase()}</span>
                                <div className="convergence__bar">
                                    <div className="convergence__fill convergence__fill--true" style={{width: (convergence.truth * 100) + '%'}} />
                                </div>
                                <span className="mono">{convergence.truth.toFixed(3)}</span>
                            </div>
                            {convergence.ghosts.map(([b, c]) => (
                                <div className="convergence__row" key={b}>
                                    <span className="convergence__label mono">ghost 0x{b.toString(16).padStart(2, '0').toUpperCase()}</span>
                                    <div className="convergence__bar">
                                        <div className="convergence__fill convergence__fill--ghost" style={{width: (c * 100) + '%'}} />
                                    </div>
                                    <span className="mono">{c.toFixed(3)}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </ExplainOn>
            )}

            {heatmap && (
                <ExplainOn
                    title="Correlation heatmap (advanced)"
                    body={<>
                        <p>The full correlation matrix CPA computed: <strong>256 rows</strong> (one per candidate key byte) × <strong>{sampleTrace?.length ?? 100} columns</strong> (one per sample position in the trace). Each cell holds the |Pearson correlation| at that (candidate, sample) pair. Brighter = stronger correlation.</p>
                        <p>How to read it: the brightest column tells you <em>when</em> the chip leaks in time. Within that column, the brightest row tells you <em>which</em> key byte the chip is processing. One bright pixel reveals both pieces of information at once.</p>
                        <p>In real-world attacks you usually don't know the leak position in advance - this scan-everything view is exactly how you'd find it. Look for a single hot pixel against an otherwise cool background.</p>
                    </>}
                >
                    <Card title="Correlation heatmap" right={<span className="muted mono">guess × sample</span>}>
                        <Chart
                            data={heatmapPlot(heatmap, 256, sampleTrace?.length ?? 100, {
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
        </div>
    );
}
