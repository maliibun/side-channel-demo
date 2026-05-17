import { useState, useRef, useEffect } from 'react';
import Card from '../components/Card';
import Field from '../components/Field';
import StatusPill from '../components/StatusPill';
import ControlBar from '../components/ControlBar';
import ExplainOn from '../components/ExplainOn';
import Histogram from '../components/Histogram';
import AttackLog from '../components/AttackLog';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { FaPlay, FaStop } from 'react-icons/fa6';
import { recoverKey, resetSecret, peekSecret, bytesToHex } from '../lib/timing';
import { argMax } from '../lib/plots';

export default function TimingAttack(){
    const [endpoint, setEndpoint] = useState('vulnerable');
    const [running, setRunning] = useState(false);
    const [ampNs, setAmpNs] = useState(100000);
    const [samplesPerByte, setSamplesPerByte] = useState(3);
    const [progress, setProgress] = useState(null);
    const [recovered, setRecovered] = useState(new Uint8Array(0));
    const [secret, setSecret] = useState('');
    const [log, setLog] = useState([]);
    const abortRef = useRef(null);

    //pre-fetch the server's current secret so the original-secret row is visible on load
    useEffect(() => {
        peekSecret().then(setSecret).catch(() => {});
    }, []);

    async function handleStart(){
        setRunning(true);
        setRecovered(new Uint8Array(0));
        setProgress(null);
        setLog([]);

        await resetSecret();
        const newSecret = await peekSecret();
        setSecret(newSecret);

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

                    //log every time a byte is locked in (candidate === 256, !done)
                    if(p.medians && p.candidate === 256 && !p.done){
                        const arr = Array.from(p.medians);
                        const peakIdx = argMax(arr);
                        const lo = Math.min(...arr);
                        const hi = arr[peakIdx];
                        const delta = Math.round(hi - lo);
                        const t = endpoint === 'vulnerable' ? 'ok' : 'noise';
                        setLog(l => [{
                            t,
                            msg: `byte ${String(p.pos).padStart(2, '0')} → 0x${peakIdx.toString(16).padStart(2, '0').toUpperCase()}  (Δt = ${delta} ns, samples=${samplesPerByte})`,
                        }, ...l].slice(0, 60));
                    }
                    if(p.done){
                        const allMatch = bytesToHex(p.recovered) === newSecret;
                        setLog(l => [{
                            t: allMatch ? 'done' : 'bad',
                            msg: allMatch ? 'Recovered 16/16 bytes — attack complete.' : 'Attack finished with mismatches.',
                        }, ...l]);
                    }
                },
            });
            if(result) setRecovered(result);
        } finally {
            setRunning(false);
        }
    }

    const recoveredHex = bytesToHex(recovered);
    const histPeak = progress?.medians ? argMax(progress.medians) : -1;
    const allDone = progress?.done;
    const success = allDone && recoveredHex === secret;
    const pillKind = running ? 'live' : success ? 'ok' : allDone ? 'bad' : 'neutral';
    const pillLabel = running ? 'attacking…' : success ? 'recovered' : `${recovered.length}/16`;

    //derive y-axis tick labels for the histogram (max / mid / min ns)
    let yLabels = null;
    if(progress?.medians){
        const arr = Array.from(progress.medians);
        const lo = Math.min(...arr), hi = Math.max(...arr);
        yLabels = [`${Math.round(hi)} ns`, `${Math.round((hi + lo) / 2)} ns`, `${Math.round(lo)} ns`];
    }

    return (
        <div className="demo">
            <header className="demo__head">
                <h2>Live timing attack</h2>
            </header>

            <ControlBar>
                <ExplainOn
                    title="Attack parameters"
                    body={<>
                        <p>The attack measures how long the server takes to verify a guessed key. Tiny timing differences leak the answer.</p>
                        <p><strong>Target</strong>: <em>vulnerable</em> compares the guess against the secret byte-by-byte and returns the instant it spots a mismatch — so the more matching bytes at the start of the guess, the longer the response. That's the leak. <em>safe</em> uses <code>crypto.timingSafeEqual</code>, which always compares every byte (constant time) so the response duration reveals nothing.</p>
                        <p><strong>Amplification</strong> (ns/byte): extra nanoseconds of CPU busy-waiting per matching byte. The real timing leak is far too small to see in a browser demo; amplification scales it up so you can watch the attack succeed. Set to 0 for the realistic (very hard) case.</p>
                        <p><strong>Samples per guess</strong>: how many times each candidate byte gets timed. We take the <em>median</em> of those samples — not the mean — because one slow request from a GC pause or scheduler hiccup would skew the mean badly but barely affects the median. More samples = less noise but slower attack.</p>
                    </>}
                >
                    <div className="controls">
                        <Field label="Target">
                            <select value={endpoint} disabled={running} onChange={e => setEndpoint(e.target.value)}>
                                <option value="vulnerable">vulnerable (naive compare)</option>
                                <option value="safe">safe (timingSafeEqual)</option>
                            </select>
                        </Field>
                        <Field label="Amplification (ns/byte)">
                            <input type="number" value={ampNs} disabled={running}
                                onChange={e => setAmpNs(Number(e.target.value))} />
                        </Field>
                        <Field label="Samples per guess">
                            <input type="number" value={samplesPerByte} min={1} max={50} disabled={running}
                                onChange={e => setSamplesPerByte(Number(e.target.value))} />
                        </Field>
                        <div className="controls__actions">
                            {!running
                                ? <PrimaryButton icon={<FaPlay />} onClick={handleStart}>Start attack</PrimaryButton>
                                : <SecondaryButton icon={<FaStop />} onClick={() => abortRef.current?.abort()}>Stop</SecondaryButton>}
                        </div>
                    </div>
                </ExplainOn>
            </ControlBar>

            <div className="grid grid--2">
                <ExplainOn
                    title="Recovered key"
                    body={<>
                        <p>AES uses a 128-bit (16-byte) secret key. The attack recovers it one byte at a time, position 0 first then position 1, and so on.</p>
                        <p>The first row is the <em>ground truth</em> — the actual secret currently on the server. The second row is what the attack has guessed so far. A pulsing cell marks the position being attacked right now.</p>
                        <p>Cell colors: <strong>green</strong> = guess matches the truth, <strong>red</strong> = guess is wrong. Against the <em>safe</em> target, all guesses come out random (mostly red) because there's no timing signal to follow.</p>
                    </>}
                >
                    <Card title="Recovered key" right={<StatusPill kind={pillKind}>{pillLabel}</StatusPill>}>
                        <div className="keystack">
                            <div className="keystack__label mono">original secret</div>
                            <div className="keygrid keygrid--ref">
                                {Array.from({length: 16}, (_, i) => {
                                    const val = secret
                                        ? parseInt(secret.slice(i * 2, i * 2 + 2), 16).toString(16).padStart(2, '0').toUpperCase()
                                        : '··';
                                    return (
                                        <div key={i} className="keygrid__cell keygrid__cell--ref">
                                            <span className="keygrid__pos">{i.toString(16).toUpperCase()}</span>
                                            <span className="keygrid__val">{val}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="keystack__label mono">recovered</div>
                            <div className="keygrid">
                                {Array.from({length: 16}, (_, i) => {
                                    let cls = 'keygrid__cell';
                                    let val = '--';
                                    if(i < recovered.length){
                                        val = recovered[i].toString(16).padStart(2, '0').toUpperCase();
                                        if(secret){
                                            const truthByte = parseInt(secret.slice(i * 2, i * 2 + 2), 16);
                                            cls += recovered[i] === truthByte ? ' keygrid__cell--ok' : ' keygrid__cell--bad';
                                        } else {
                                            cls += ' keygrid__cell--ok';
                                        }
                                    }
                                    if(running && i === progress?.pos) cls += ' keygrid__cell--current';
                                    return (
                                        <div key={i} className={cls}>
                                            <span className="keygrid__pos">{i.toString(16).toUpperCase()}</span>
                                            <span className="keygrid__val">{val}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="progressbar">
                            <div className="progressbar__fill" style={{width: (recovered.length / 16) * 100 + '%'}} />
                        </div>
                    </Card>
                </ExplainOn>

                <ExplainOn
                    title="Timing histogram"
                    body={<>
                        <p>One bar per candidate value (0x00 → 0xFF in hexadecimal = 0 to 255 in decimal — that's all possible values a single byte can take). Bar height = the median response time the server took when the byte at the current attack position was set to that candidate.</p>
                        <p>The <strong>red</strong> bar is the tallest — the attack commits that value as the recovered byte and moves on to the next position.</p>
                        <p>Against the safe target all bars are roughly equal height because the comparison runs in constant time regardless of the guess. No clear peak = no leak.</p>
                    </>}
                >
                    <Card
                        title={`Timing histogram — byte ${progress ? String(progress.pos).padStart(2, '0') : '--'}`}
                        right={<span className="muted mono">256 candidates</span>}
                    >
                        <Histogram
                            values={progress?.medians}
                            peakIdx={histPeak}
                            yLabels={yLabels}
                            empty="Press Start attack to sample response times."
                            formatTip={v => `${Math.round(v)} ns`}
                        />
                        <div className="histogram__legend">
                            <span className="mono muted">candidate 0x00</span>
                            <span className="mono muted">0xFF</span>
                        </div>
                    </Card>
                </ExplainOn>
            </div>

            <ExplainOn
                title="Attack log"
                body={<>
                    <p>One log entry per byte recovered. <strong>Δt</strong> = the gap between the slowest and fastest median time across the 256 candidates. Large Δt = strong timing signal = confident guess.</p>
                    <p>If Δt collapses toward zero, there's no signal left and the attack is essentially guessing. Against the safe target every Δt is tiny because the comparison is constant time.</p>
                </>}
            >
                <Card title="Attack log" right={<span className="muted mono">stdout</span>} className="card--log">
                    <AttackLog entries={log} />
                </Card>
            </ExplainOn>
        </div>
    );
}
