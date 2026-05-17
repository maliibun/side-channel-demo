import { useState, useRef } from 'react';
import { FaPlay, FaStop, FaCheck, FaTriangleExclamation } from 'react-icons/fa6';
import Chart from '../components/Chart';
import { recoverKey, resetSecret, peekSecret, bytesToHex } from '../lib/timing';
import { keyGuessBars, argMax } from '../lib/plots';

export default function TimingAttack(){
    const [endpoint, setEndpoint] = useState('vulnerable');
    const [running, setRunning] = useState(false);
    const [ampNs, setAmpNs] = useState(100000);
    const [samplesPerByte, setSamplesPerByte] = useState(3);
    const [progress, setProgress] = useState(null);
    const [recovered, setRecovered] = useState(new Uint8Array(0));
    const [secret, setSecret] = useState('');
    const abortRef = useRef(null);

    async function handleStart(){
        setRunning(true);
        setRecovered(new Uint8Array(0));
        setProgress(null);

        await resetSecret();
        setSecret(await peekSecret());

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const result = await recoverKey({
                endpoint,
                ampNs,
                samplesPerByte,
                signal: ctrl.signal,
                onProgress: p => {
                    setProgress(p);
                    setRecovered(p.recovered);
                },
            });
            if(result) setRecovered(result);
        } finally {
            setRunning(false);
        }
    }

    const recoveredHex = bytesToHex(recovered);
    const chartData = progress?.medians
        ? keyGuessBars(progress.medians, {[argMax(progress.medians)]: '#e74c3c'})
        : null;

    return (
        <div style={{padding: 24}}>
            <h2 style={{marginTop: 0}}>Live timing attack</h2>
            <p style={{color: '#666', maxWidth: 800}}>
                The <strong>vulnerable</strong> server uses a naive byte-by-byte comparison
                with early exit. Each matching byte adds <code>amp</code> nanoseconds of
                work. By measuring response times for all 256 candidate values at each
                position, we recover the secret one byte at a time. Switch the target to
                <strong> safe</strong> (<code>crypto.timingSafeEqual</code>) to watch the
                same attack code fail — the recovered key becomes random because there's
                no consistent timing signal to follow.
            </p>

            <div style={{display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', margin: '16px 0'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    Target:
                    <select
                        value={endpoint} disabled={running}
                        onChange={e => setEndpoint(e.target.value)}
                        style={{padding: '4px 8px'}}
                    >
                        <option value="vulnerable">vulnerable (naive compare)</option>
                        <option value="safe">safe (timingSafeEqual)</option>
                    </select>
                </label>
                <label>
                    Amplification (ns/byte):
                    <input
                        type="number" value={ampNs} disabled={running}
                        onChange={e => setAmpNs(Number(e.target.value))}
                        style={{marginLeft: 8, width: 100}}
                    />
                </label>
                <label>
                    Samples per guess:
                    <input
                        type="number" value={samplesPerByte} min={1} max={50} disabled={running}
                        onChange={e => setSamplesPerByte(Number(e.target.value))}
                        style={{marginLeft: 8, width: 60}}
                    />
                </label>
                <button
                    onClick={running ? () => abortRef.current?.abort() : handleStart}
                    style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', cursor: 'pointer'}}
                >
                    {running ? <><FaStop /> Stop</> : <><FaPlay /> Start attack</>}
                </button>
            </div>

            {secret && (
                <div style={{fontFamily: 'monospace', fontSize: 14, margin: '16px 0', lineHeight: 1.7}}>
                    <div>ground truth: <span style={{color: '#888'}}>{secret}</span></div>
                    <div>
                        recovered:    <span style={{color: '#27ae60'}}>{recoveredHex}</span>
                        <span style={{color: '#ccc'}}>{'··'.repeat(16 - recovered.length)}</span>
                    </div>
                    {progress && !progress.done && (
                        <div style={{color: '#888', fontSize: 12, marginTop: 4}}>
                            byte {progress.pos}, candidate {progress.candidate}/256
                        </div>
                    )}
                    {progress?.done && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            color: recoveredHex === secret ? '#27ae60' : '#e67e22',
                            fontSize: 13, marginTop: 4,
                        }}>
                            {recoveredHex === secret
                                ? <><FaCheck /> recovery complete</>
                                : <><FaTriangleExclamation /> recovery finished — check for mismatches</>}
                        </div>
                    )}
                </div>
            )}

            {chartData && (
                <Chart
                    data={chartData}
                    layout={{
                        title: `byte ${progress.pos} — candidate timings`,
                        xaxis: {title: 'candidate value (0–255)'},
                        yaxis: {title: 'median time (ns)'},
                        height: 400,
                    }}
                />
            )}
        </div>
    );
}
