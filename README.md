# side-channel-demo
Browser-based demo for side-channel attacks; extract keys from timing and power traces, no hardware required.
Ppt, demo and paper.
<h1>Explanation</h1>
<p>
1. The attacks themselves (so the code makes sense)
1a. Timing attack (live demo)
The vulnerable pattern is byte-by-byte string comparison with early exit:


function naiveCompare(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;   // early-exit leaks position
  }
  return true;
}
If you guess the first byte wrong, the loop exits after 1 iteration. If you get the first byte right but the second wrong, it exits after 2. Time to respond ≈ length of the matching prefix. That's the leak.

Recovery algorithm — byte-by-byte:

Fix bytes 0..i-1 to the prefix you've already recovered.
For each candidate c ∈ 0..255 at position i, send the server prefix || c || padding N times, record server-side processing time.
The candidate with the highest median time is the correct byte. (Median, not mean — outliers from GC/scheduler dominate the mean.)
Append it to the prefix; go to step 1 for i+1.
Reality check: real network timing attacks against hmac.compare over the internet need millions of samples and statistical voodoo. In a 30-second demo slot you can't do that honestly. Two options:

Amplify: add a deliberate busyWait(50µs) per matching byte on the server. Tell the audience: "this amplifies a real effect; without it you'd need 10,000× more samples." This is intellectually honest and visually convincing.
Localhost only: with no network jitter, even unamplified leaks are recoverable with a few hundred samples per byte.
I'd do both: a slider on the page sets the amplification, so you can show "off → noise → on → instant recovery."

1b. Simulated power traces (CPA)
The CMOS leakage model: power drawn by a register loaded with value v is roughly proportional to popcount(v) — the Hamming Weight. For AES, the textbook attack point is the first round S-box output:


v = sbox[plaintext[i] XOR key[i]]
power_at_leak_time ≈ HW(v) + noise
To simulate: pick a key byte k, generate N random plaintexts p, and for each one create a fake "trace" — an array of, say, 100 samples — where one specific sample equals HW(sbox[p XOR k]) + Gaussian(σ) and the rest are random noise. That's it. That's the entire physics simulation.

SPA (Simple Power Analysis) = squinting at one trace and recognizing structure. For the demo it's mostly storytelling: "if rounds were visible you'd see 10 humps." Show one trace with the leak point marked.

CPA (Correlation Power Analysis) is the real attack. For every candidate key guess g ∈ 0..255:


hypothesis_g = [ HW(sbox[p[t] XOR g])  for t in 0..N-1 ]
correlation_g = pearson(hypothesis_g, traces[:, leak_sample])
The correct g produces high correlation (~0.5–0.9 depending on noise); wrong guesses produce ~0. Plot |corr| over all 256 guesses → one bar towers over the others. That's the wow.

Crucially: if you didn't know the leak sample, you'd compute correlation at every sample point of the trace and find the peak. That's how you locate leaks in unknown hardware. Worth showing as a heatmap.

1c. Real traces (ASCAD)
ASCAD is the standard public dataset: real power measurements from an ATMega8515 running AES, packaged as HDF5. Same CPA code as 1b — that's the punchline. The simulation isn't a toy; it's the same algorithm.

HDF5 in browser is painful (h5wasm works but is heavy). I'd preprocess offline: extract ~2000 traces × ~700 samples around the known leak window, dump as a raw Float32Array binary plus a Uint8Array of plaintexts. ~5–10 MB total, loaded with fetch → arrayBuffer() → typed-array view. No HDF5 in the browser at all.

2. Architecture

┌─────────────────────────────────────┐
│  client/  (Vite + React, port 5173) │
│    Tab 1: Timing → calls server     │
│    Tab 2: Simulated traces (pure JS)│
│    Tab 3: Real traces (loads .bin)  │
└─────────────┬───────────────────────┘
              │ fetch POST /verify
              ▼
┌─────────────────────────────────────┐
│  server/  (Express, port 3001)      │
│    POST /vulnerable/verify          │
│    POST /safe/verify    (control)   │
│    POST /reset                      │
└─────────────────────────────────────┘
<<<<<<< HEAD
</pre>

<ul>
  <li><b>Why split:</b> Tab 1 needs a real server to attack. Tabs 2 and 3 are pure client-side — you can demo them even if the server fails on stage.</li>
  <li><b>Why Express:</b> ~30 lines of code, zero ceremony, everyone recognises it.</li>
  <li><b>Communication:</b> REST. The attack is request-driven; WebSockets are unnecessary.</li>
</ul>

<hr>

<h2 id="3-file-by-file-plan">3. File-by-file Plan</h2>

<h3>Server (<code>server/</code>)</h3>

<table>
  <thead>
    <tr><th>File</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>index.js</code></td>
      <td>Entrypoint (~20 lines). CORS for <code>localhost:5173</code>, JSON body parsing, mounts <code>/vulnerable</code> and <code>/safe</code> routes, exposes <code>POST /reset</code> to regenerate the secret, accepts <code>amplificationUs</code> query param.</td>
    </tr>
    <tr>
      <td><code>routes/vulnerable.js</code></td>
      <td>Reads <code>{ guess }</code> from body, times comparison with <code>process.hrtime.bigint()</code>, uses <code>naiveCompare</code> with optional <code>busyWait</code>, returns <code>{ ok, serverTimeNs }</code>.</td>
    </tr>
    <tr>
      <td><code>routes/safe.js</code></td>
      <td>Same shape, uses <code>crypto.timingSafeEqual</code>. The control: same attack, no recovery.</td>
    </tr>
  </tbody>
</table>

<blockquote><code>busyWait</code> uses <code>while (process.hrtime.bigint() - start &lt; target)</code> — not <code>setTimeout</code>, which has ~1 ms resolution.</blockquote>

<h3>Client (<code>client/</code>)</h3>

<table>
  <thead>
    <tr><th>File</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>vite.config.js</code></td>
      <td>Dev server proxy: <code>/api → localhost:3001</code> (avoids CORS in dev).</td>
    </tr>
    <tr>
      <td><code>src/App.jsx</code></td>
      <td>Tab state (<code>useState('timing' | 'sim' | 'real')</code>), renders one page component. ~30 lines.</td>
    </tr>
    <tr>
      <td><code>src/pages/TimingAttack.jsx</code></td>
      <td>Controls (target, samples-per-guess, amplification sliders, start/stop). Live bar chart of median times per candidate + recovered key hex display.</td>
    </tr>
    <tr>
      <td><code>src/pages/SimulatedTraces.jsx</code></td>
      <td>Controls (key byte, N traces, noise σ). Generates synthetic traces, runs CPA, renders: one sample trace, correlation bar chart, and a correlation heatmap.</td>
    </tr>
    <tr>
      <td><code>src/pages/RealTraces.jsx</code></td>
      <td>Loads <code>/data/ascad_subset.bin</code> once, runs same CPA, shows recovered vs ground-truth key byte.</td>
    </tr>
    <tr>
      <td><code>src/lib/aes.js</code></td>
      <td>Hardcoded <code>SBOX: Uint8Array(256)</code> and precomputed <code>HW: Uint8Array(256)</code> popcount table.</td>
    </tr>
    <tr>
      <td><code>src/lib/cpa.js</code></td>
      <td>Core CPA: <code>Float32Array</code>-based two-pass Pearson correlation, yields to UI every ~50 sample points for the heatmap path.</td>
    </tr>
    <tr>
      <td><code>src/lib/timing.js</code></td>
      <td>Attack driver: <code>recoverKey({ endpoint, keyLength, samples, onProgress })</code>.</td>
    </tr>
  </tbody>
</table>

<hr>

<h2 id="4-gotchas">4. Gotchas</h2>

<ul>
  <li><b>CORS:</b> configure <code>cors({ origin: 'http://localhost:5173' })</code> from the start, not when the first request fails on stage.</li>
  <li><b>Server-measured time:</b> measure with <code>hrtime.bigint()</code> on the server and return it. Client-side <code>Date.now()</code> includes network jitter and drowns the signal at micro-amplification levels.</li>
  <li><b>Median, not mean:</b> GC pauses can be 10 ms+ — 1000× the signal. Use median or low percentile (e.g., min of 5).</li>
  <li><b>Typed arrays for CPA:</b> always <code>Float32Array</code>, never <code>[]</code>. The inner loop is 50× slower with regular arrays due to boxed numbers.</li>
  <li><b>Plotly weight:</b> ~3 MB. Use <code>Plotly.react()</code> semantics — reuse the layout object reference, or every update recreates the SVG.</li>
  <li><b>Background-tab throttling:</b> Chrome throttles <code>setTimeout</code> to 1 Hz in inactive tabs. Keep the demo tab focused.</li>
  <li><b>ASCAD file size:</b> don't ship the full HDF5 (~7 GB). Preprocess offline and ship only the slice you need.</li>
  <li><b><code>hrtime.bigint()</code> returns BigInt:</b> doesn't <code>JSON.stringify</code> natively. Convert to string before sending, or use <code>Number()</code> (safe — values are nanoseconds, not picoseconds).</li>
</ul>

<hr>

<h2 id="5-build-order">5. Build Order</h2>

<ol>
  <li>Scaffold both packages (<code>npm create vite</code>, <code>npm init</code> in <code>server/</code>).</li>
  <li>Get the timing endpoint working — verify with <code>curl</code> that an amplified response is measurably slower for a longer matching prefix. <b>Don't move on until this works in the terminal.</b></li>
  <li>Write <code>lib/timing.js</code> and a minimal CLI test (Node script that runs the attack, prints recovered key) — proves the attack logic independently of the UI.</li>
  <li>Build the React tab around it.</li>
  <li>Write <code>lib/aes.js</code> and <code>lib/cpa.js</code>. Unit-test on a tiny synthetic case (4 traces, no noise, verify correlation = 1.0 for correct candidate).</li>
  <li>Build the <b>SimulatedTraces</b> tab.</li>
  <li>Preprocess ASCAD subset offline (Python + h5py → <code>.bin</code> files).</li>
  <li>Build the <b>RealTraces</b> tab — mostly reuses CPA from step 5.</li>
</ol>

<blockquote>Each step is independently verifiable in isolation. When something breaks during prep, you know which layer.</blockquote>
=======
Why split: Tab 1 needs a real server to attack — that's the whole point. Tabs 2 and 3 are pure client-side; the server is irrelevant to them. Keeping them in separate packages means you can run just the client for trace demos if the server fails on stage.

Why Express: ~30 lines of code, zero ceremony, everyone recognizes it.

Communication: REST. The attack is request-driven; no need for WebSockets.

3. File-by-file plan
Server (server/)
index.js — entrypoint, ~20 lines

cors() allowing http://localhost:5173
express.json() body parsing
Mount /vulnerable and /safe routes
A module-level let secret = randomBytes(16) and a POST /reset to regenerate it
An amplificationUs query param so the client can dial it live
routes/vulnerable.js — the leaky endpoint

Reads { guess } from body (hex string)
Times the comparison with process.hrtime.bigint() on the server (returned in response, so the client doesn't conflate network jitter with server time)
Uses naiveCompare with optional busyWait(amplificationUs) per matching byte
Returns { ok: bool, serverTimeNs: BigInt as string }
routes/safe.js — same shape, uses crypto.timingSafeEqual. This is the control: same attack, no recovery. Critical for the demo because it shows the fix.

busyWait is a while (process.hrtime.bigint() - start < target) loop — not setTimeout, which has ~1ms resolution.

Client (client/)
vite.config.js — vanilla, plus a dev server.proxy so /api → localhost:3001 (avoids CORS in dev).

src/App.jsx — tab state (just useState('timing' | 'sim' | 'real')), renders one of three page components. ~30 lines.

src/pages/TimingAttack.jsx — the live attack

Controls: target (vulnerable/safe), samples-per-guess slider, amplification slider, start/stop button
State: prefix (recovered bytes so far), currentByteIndex, samples (256 arrays of timings)
Attack loop is an async function with await between requests so the UI updates
Two plots:
Bar chart: median time for each of the 256 candidates at the current byte (updates live, you watch one bar grow taller than the others)
Recovered key: hex string with the discovered prefix highlighted
src/pages/SimulatedTraces.jsx

Controls: true key byte (0–255 number input), N traces (slider 10–10000), noise σ (slider)
"Generate" button → fills typed arrays
"Run CPA" button → calls cpa() from lib
Three plots:
One sample trace with leak sample marked (Plotly line plot, 100 points)
Correlation across candidates: bar chart, correct key spikes
Heatmap: correlation × time × candidate (shows where the leak is in time, this is the "we don't need to know the leak point" part)
src/pages/RealTraces.jsx

useEffect loads /data/ascad_subset.bin once, parses into Float32Array of shape [N, samples] and Uint8Array of plaintexts
Plot one trace
"Run CPA" → run on the real data, show bar chart
Show "recovered key byte: 0x__" vs "ground truth: 0x__" — they match. Audience claps.
src/lib/aes.js

SBOX: Uint8Array(256), hardcoded
HW: Uint8Array(256) precomputed popcount table — HW[v] is popcount(v). Lookup is faster than computing on the fly.
src/lib/cpa.js — the heart


// traces: Float32Array of length N*S (row-major, N traces × S samples)
// plaintexts: Uint8Array of length N (the byte being attacked)
// returns: Float32Array(256) of |correlation| per candidate
export function cpa(traces, plaintexts, N, S, sampleIdx) { ... }
For one sample point: compute hypotheses (256 × N), compute correlation per candidate. ~30 lines using two-pass Pearson (mean, then variance, then covariance). Use Float32Array, no per-trace allocation.

For the heatmap version, loop over sampleIdx. With N=2000, S=700, this is ~360M ops — ~0.5–2s in plain JS. Yield to the UI with await new Promise(r => setTimeout(r, 0)) every ~50 sample points.

src/lib/timing.js — the timing attack driver


export async function recoverKey({ endpoint, keyLength, samples, onProgress }) { ... }
Calls the server, collects timings, decides each byte, calls onProgress(prefix, candidateMedians) so the UI can render.

src/components/

<TracePlot traces={Float32Array} sampleIdx={n} /> — wraps react-plotly.js
<BarChart values={Float32Array(256)} highlightIdx={n} />
<Slider />, <NumberInput /> — thin wrappers
4. Gotchas that will bite
CORS: configure cors({ origin: 'http://localhost:5173' }) from the start, not when the first request fails on stage.
Server-measured vs client-measured time: measure on the server with hrtime.bigint() and return it. Client-side Date.now() includes network jitter and easily drowns the signal at micro-amplification levels. Then show "what the attacker actually sees" by switching to client-measured timing — it still works, just needs more samples.
Median, not mean: GC pauses are 10ms+, can be 1000× the signal. Use median or low percentile (e.g., min of 5).
Typed arrays for CPA: do not use []. The 256-candidate × N-trace inner loop will be 50× slower with regular arrays because of boxed numbers and bounds checks. Always Float32Array.
Plotly is heavy: ~3 MB. Use react-plotly.js with Plotly.react() semantics — pass new data arrays but reuse the layout object reference, or every update re-creates the SVG.
Background-tab throttling: Chrome throttles setTimeout to 1Hz in inactive tabs. Keep the demo tab focused; if you Cmd-Tab away the attack appears to freeze.
ASCAD file size: don't ship the full HDF5 (~7 GB). Preprocess once, ship the slice you need.
process.hrtime.bigint() returns BigInt: doesn't JSON.stringify natively. Convert to string before sending or use Number() if you're confident the values fit (they will — nanoseconds, not picoseconds).
5. What you'd actually do in order
Scaffold both packages (npm create vite, npm init in server/).
Get the timing endpoint working — verify with curl that an amplified response is measurably slower for a longer matching prefix. Don't move on until this works in the terminal. If the leak isn't there, no UI in the world will save you.
Write lib/timing.js and a minimal CLI test (a Node script that runs the attack against the local server, prints recovered key) — proves the attack logic separately from the UI.
Build the React tab around it.
Write lib/aes.js and lib/cpa.js. Unit-test on a tiny synthetic case (4 traces, no noise, see that the right candidate has correlation 1.0).
Build SimulatedTraces tab.
Preprocess ASCAD subset offline (Python script using h5py, dumps .bin files).
Build RealTraces tab — mostly reuses CPA from step 5.
The order matters: each step is independently verifiable in isolation, so when something breaks during prep you know which layer.
</p>
>>>>>>> d1f26e0 (initial commit and time attack)
