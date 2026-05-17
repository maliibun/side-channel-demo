# side-channel-demo

Browser-based demo for side-channel attacks: extract AES keys from timing measurements and power traces, no specialised hardware required. The project is built around three interactive demos that progressively build up the story of how side channels leak secrets and how those leaks are exploited.

---

## Table of contents

1. [Overview](#overview)
2. [How to run](#how-to-run)
3. [Project structure](#project-structure)
4. [Concepts](#concepts)
   - [AES in one minute](#aes-in-one-minute)
   - [The AES S-box](#the-aes-s-box)
   - [Hamming weight (HW)](#hamming-weight-hw)
   - [Side channels](#side-channels)
   - [Pearson correlation](#pearson-correlation)
   - [CPA — correlation power analysis](#cpa--correlation-power-analysis)
5. [Demo 1 — live timing attack](#demo-1--live-timing-attack)
6. [Demo 2 — simulated power traces](#demo-2--simulated-power-traces)
7. [Demo 3 — real ASCAD traces](#demo-3--real-ascad-traces)
8. [Reading the plots](#reading-the-plots)
9. [Important code blocks](#important-code-blocks)
10. [Gotchas](#gotchas)

---

## Overview

Three demos, three escalating levels of realism:

| Tab | What it shows | Where the data comes from |
|---|---|---|
| **Live timing attack** | Recover a 16-byte secret from response-time differences | Real network round-trips to a local Express server |
| **Simulated traces (CPA)** | Recover one key byte from synthetic power traces using CPA | Generated in-browser with a known leak model |
| **Real traces (ASCAD)** | Same CPA code, but applied to ASCAD-format traces from a real microcontroller | Preprocessed `.bin` files in `client/public/data/` |

The point of running them side by side: the **algorithm** doesn't care whether the trace was made up in JavaScript or measured on real silicon. CPA is CPA.

---

## How to run

Two terminals (both in WSL or any Unix shell — Windows-native works too if you prefer):

```bash
# Terminal 1 — the vulnerable + safe server
cd server
npm install            # one time
node index.js          # listens on http://localhost:3001

# Terminal 2 — the React UI
cd client
npm install            # one time
npm run dev            # serves http://localhost:5173
```

Open `http://localhost:5173`. Three tabs, three demos.

For demo 3 to work, the ASCAD `.bin` files need to be in `client/public/data/`. The repo ships a synthetic version that uses the same format. To regenerate from a real ASCAD `.h5` file:

```bash
pip install h5py numpy
python preprocess_ascad.py path/to/ASCAD.h5
```

---

## Project structure

```
side-channel-demo/
├── preprocess_ascad.py             python script that crops ASCAD HDF5 → .bin
├── server/
│   ├── index.js                    express app, CORS, routes
│   └── routes/
│       ├── vulnerable.js           leaky byte-by-byte comparison
│       └── safe.js                 crypto.timingSafeEqual control
└── client/
    ├── public/data/                preprocessed ASCAD traces (.bin + .json)
    └── src/
        ├── App.jsx                 three-tab shell
        ├── components/
        │   └── Chart.jsx           Plotly.react() wrapper
        ├── lib/
        │   ├── aes.js              SBOX + HW lookup tables
        │   ├── cpa.js              CPA + synthetic trace generator
        │   ├── plots.js            pure data builders for Plotly
        │   └── timing.js           byte-by-byte timing recovery
        └── pages/
            ├── TimingAttack.jsx    demo 1
            ├── SimulatedTraces.jsx demo 2
            └── RealTraces.jsx      demo 3
```

The separation is intentional: `lib/` contains the math (no React, no DOM), `components/` contains UI primitives, `pages/` orchestrates state and renders. You can read any single layer without paging in the others.

---

## Concepts

### AES in one minute

AES (Advanced Encryption Standard) is a symmetric block cipher: it encrypts 16-byte blocks of plaintext into 16-byte blocks of ciphertext using a 16/24/32-byte key. It's the standard cipher behind HTTPS, disk encryption, Wi-Fi (WPA2), and almost every other modern security primitive.

For our purposes, only the **first round** matters. AES-128 starts by:

1. XOR'ing the 16-byte plaintext with the 16-byte key: `state[i] = plaintext[i] ^ key[i]`
2. Replacing each byte through an S-box lookup: `state[i] = SBOX[state[i]]`

That `SBOX[plaintext[i] ^ key[i]]` operation is what every CPA attack targets, because it's where the secret key and the known plaintext combine to produce a byte that depends on **one** key byte at a time. That last property is critical: we can attack each of the 16 key bytes independently, trying 256 candidates per byte (4096 total guesses) instead of brute-forcing 2^128 keys.

### The AES S-box

The S-box (`SBOX[]` in [`client/src/lib/aes.js`](client/src/lib/aes.js)) is a fixed 256-byte lookup table. The values are defined by FIPS 197 (the AES standard) and are identical across every AES implementation in the world.

Mathematically, `SBOX[x] = AffineTransform(MultiplicativeInverse(x) in GF(2^8))`. The values look like random bytes but they are very carefully chosen for cryptographic properties:

- **High non-linearity** — resists linear and differential cryptanalysis
- **No fixed points** — `SBOX[x] != x` for all x
- **No opposite fixed points** — `SBOX[x] != x ^ 0xff`

If you swap the S-box for any other table, you no longer have AES. To attack real AES hardware, your CPA code must use these exact 256 bytes.

### Hamming weight (HW)

The Hamming weight of a byte is its popcount — the number of 1-bits in its binary representation. `HW(0x00) = 0`, `HW(0xFF) = 8`, `HW(0b00101011) = 4`.

In [`client/src/lib/aes.js`](client/src/lib/aes.js) we precompute the table once at startup:

```js
export const HW = new Uint8Array(256);
for(let i = 0; i < 256; i++){
    let v = i, c = 0;
    while(v){ c += v & 1; v >>>= 1; }
    HW[i] = c;
}
```

Why does HW matter for side channels? When a CMOS microcontroller loads a value `v` into a register, the power it draws is roughly proportional to how many bits flipped — and that's roughly proportional to `HW(v)`. So the power consumed at the moment AES computes `SBOX[plaintext ^ key]` correlates with the Hamming weight of that S-box output. That correlation is the leak.

### Side channels

A side channel is any unintended channel of information leakage from a computation. Classical channels include:

- **Timing** — how long an operation takes (the focus of demo 1)
- **Power** — instantaneous current draw of the chip (demo 2 and 3)
- **EM radiation** — electromagnetic emissions from the chip
- **Cache** — which memory addresses were recently accessed
- **Acoustic** — yes, really, key recovery from CPU fan noise has been demonstrated

The defining feature: the algorithm produces the correct output, but the *physical execution* reveals information about the secret data being processed.

### Pearson correlation

Pearson's correlation coefficient measures the linear relationship between two equal-length sequences of numbers. It produces a value `r ∈ [-1, +1]`:

```
        Σ (x_i - x̄)(y_i - ȳ)
r  =  ─────────────────────────────
       √( Σ(x_i - x̄)² · Σ(y_i - ȳ)² )
```

- `r = +1`: perfect positive linear relationship
- `r =  0`: no linear relationship
- `r = -1`: perfect negative linear relationship

In CPA we compute `|r|` (absolute correlation), because a strong **negative** correlation is also evidence of a real relationship — just one with an inverted sign (some chips draw *less* power on higher HW, depending on the architecture).

The implementation in [`client/src/lib/cpa.js`](client/src/lib/cpa.js) is straight from the formula:

```js
function pearson(xs, ys, n){
    let sx = 0, sy = 0;
    for(let i = 0; i < n; i++){ sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for(let i = 0; i < n; i++){
        const dx = xs[i] - mx, dy = ys[i] - my;
        num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
}
```

Two passes: one to compute means, one to compute centred products. Pure arithmetic, no allocations inside the loops — that's why we use `Float32Array` everywhere.

### CPA — correlation power analysis

CPA combines everything above. Setup:

- We have `N` power traces (one per encryption) and `N` known plaintexts.
- We don't know the key.
- We model "power at the leak moment" as `HW(SBOX[plaintext ^ key])`.

The attack on **one byte** of the key:

```
for each candidate g in 0..255:
    hypothesis_g[t] = HW(SBOX[plaintext[t] ^ g])           for t in 0..N-1
    for each sample point s in 0..T-1:
        correlation = pearson(hypothesis_g[], traces[:, s])
        record peak |correlation| across s
pick g with the highest peak  →  that's the correct key byte
```

Why does this work? Only **one** candidate `g` matches the real key. For that candidate, `HW(SBOX[plaintext ^ g])` matches the actual data flowing through the chip and therefore correlates strongly with the power at the leak sample. For every other candidate, the hypothesis is uncorrelated noise. Correlation reveals the key.

To recover all 16 key bytes, you run CPA 16 times, once per byte position.

---

## Demo 1 — live timing attack

### What's happening

A naive string comparison exits early on the first mismatch:

```js
function naiveCompare(a, b){
    if(a.length !== b.length) return false;
    for(let i = 0; i < a.length; i++){
        if(a[i] !== b[i]) return false;   //early exit leaks position
        busyWaitNs(amplificationNs);
    }
    return true;
}
```

If you guess byte 0 wrong, the loop returns after 1 iteration. If byte 0 is right but byte 1 is wrong, it returns after 2. **Response time grows with the number of leading bytes that match the secret.** That's the leak.

### The recovery algorithm

In [`client/src/lib/timing.js`](client/src/lib/timing.js):

```
for each position p in 0..15:
    for each candidate c in 0..255:
        send (recovered_prefix || c || padding) N times, record server time
        median_c = median of N timings
    pick c with highest median_c  →  byte[p]
```

Median, not mean — because OS scheduler hiccups and JS garbage collection can spike a single sample by 1000× the actual signal. Median is robust to those outliers.

### The amplification dial

A real timing attack against `hmac.compare` over the internet needs millions of samples and serious statistics. We can't show that in a demo. So the server has an `amp` query parameter that inserts a deliberate `busyWait(amp ns)` per matching byte — making the timing signal artificially obvious:

- `amp=100000` (100 µs/byte): instantly recoverable in seconds, even with 1 sample per candidate.
- `amp=10000` (10 µs/byte): still recoverable but takes more samples.
- `amp=0`: the *real* leak, drowning in OS jitter — usually fails.

This is intellectually honest: we tell the audience "we're amplifying a real effect; without amplification you'd need thousands of times more samples."

### The safe endpoint

Same UI, same attack code, but switch the **Target** dropdown to "safe". The request hits `/safe/verify` instead of `/vulnerable/verify`. The safe endpoint uses Node's `crypto.timingSafeEqual`, which compares byte-by-byte with **no early exit** — the inner loop XORs every byte and accumulates the differences. Constant time. No matter how many bytes match, the response time is identical.

The attack code runs unchanged; the bar chart looks like flat noise; the recovered key is random garbage. That's the fix every developer should know.

### Reading the bar chart

256 bars, one per candidate value at the current byte position. **Y-axis** = median response time in nanoseconds. The bar in red is the highest — that's the byte the attack is about to commit. With a vulnerable target and adequate amplification, one bar is visibly taller than the rest; with the safe endpoint, the bars are roughly equal-height and the "winner" is essentially random.

---

## Demo 2 — simulated power traces

### Generating fake traces

In [`client/src/lib/cpa.js`](client/src/lib/cpa.js), `generateSimTraces` builds N traces using the textbook HW leak model:

```js
export function generateSimTraces(keyByte, N, sigma, T = 100, leakSample = 50){
    const traces = [];
    const plaintexts = [];
    for(let i = 0; i < N; i++){
        const p = Math.random() * 256 | 0;
        plaintexts.push(new Uint8Array([p]));
        const trace = new Float32Array(T);
        //fill with Gaussian-ish noise
        for(let s = 0; s < T; s++) trace[s] = (Math.random() - 0.5) * 2 * sigma;
        //inject the leak at one specific sample
        trace[leakSample] += HW[SBOX[p ^ keyByte]];
        traces.push(trace);
    }
    return {traces, plaintexts};
}
```

Every trace is 100 floats of noise. At sample 50, one value gets bumped by `HW(SBOX[plaintext ^ key])` — a number between 0 and 8. That single bump is the **entire** leak. Buried under noise of magnitude σ, it's invisible to the naked eye.

### Running CPA

`runCPA` walks all 256 candidates, computes the hypothesis vector, correlates it against every sample column of the trace matrix, and records the peak per candidate:

```js
for(let g = 0; g < 256; g++){
    //hypothesis: HW(SBOX[pt ^ g]) for each trace
    for(let t = 0; t < N; t++) hyp[t] = HW[SBOX[plaintexts[t][byteIdx] ^ g]];

    //correlate against each trace column
    for(let s = 0; s < T; s++){
        for(let t = 0; t < N; t++) col[t] = traces[t][s];
        const r = Math.abs(pearson(hyp, col, N));
        heatmap[g * T + s] = r;
        if(r > peakCorr[g]) peakCorr[g] = r;
    }
}
```

The correct candidate `g = keyByte` produces a correlation of 0.5–0.9 at `s = 50` (the leak sample). All other candidates produce correlations near 0 everywhere. One spike in 256·100 = 25,600 grid cells.

### Tweakable parameters

- **Key byte** — what value to leak. Change it between runs; the recovered byte changes accordingly.
- **N traces** — more traces sharpen the signal. With σ=2 you can recover at N=50; with σ=5 you might need N=500.
- **Noise σ** — Gaussian noise amplitude added to every sample. Crank it high enough and even CPA gives up.

The slider interactions are the lesson: side-channel attacks are statistical. More samples beat more noise, until they don't.

---

## Demo 3 — real ASCAD traces

### What is ASCAD

[ASCAD](https://github.com/ANSSI-FR/ASCAD) is the standard public dataset for side-channel research, published by the French national cybersecurity agency (ANSSI). It contains real power measurements from an ATMega8515 microcontroller running an AES-128 implementation: 60,000+ traces of ~100,000 samples each, packaged as HDF5.

The dataset solves a practical problem for researchers: side-channel papers used to be reproducibility-hostile because every paper measured its own chip on its own oscilloscope. ASCAD gave the community a common reference.

### Why HDF5 is preprocessed offline

HDF5 in the browser is painful — the `h5wasm` library works but is heavy. Easier: preprocess offline with Python (`h5py`), crop the traces to the interesting window, and ship raw typed-array binaries. [`preprocess_ascad.py`](preprocess_ascad.py) does exactly this:

- Reads `Profiling_traces/traces[:2000]` (2000 traces)
- Crops to a 700-sample window around the centre (where the leak lives)
- Writes `ascad_traces.bin` (Float32Array), `ascad_plaintexts.bin` (Uint8Array), and `ascad_meta.json` (key, dimensions)

The browser loads these with `fetch` → `arrayBuffer()` → typed-array view. No HDF5 in the browser at all.

### Same code, different data

Once the data is in the right shape, the same `runCPA` function from demo 2 runs **completely unchanged**. The page in [`client/src/pages/RealTraces.jsx`](client/src/pages/RealTraces.jsx) just plumbs the data in:

```js
const result = await runCPA(traces, plaintexts, byteIdx, onProgress, signal);
```

That's the punchline: the simulated demo isn't a toy. CPA is the same algorithm whether you make the traces up in JavaScript or measure them on real silicon. The simulation is the algorithm; the silicon is just one source of input.

### Locating the leak point

In the simulated demo we know the leak is at sample 50 (we put it there). In real ASCAD data, we don't — we have to find it. After CPA runs we have a full `[256 × T]` heatmap of correlations. The leak sample is the column where the **correct** key candidate (ground truth) peaks. We compute it post-CPA in [`RealTraces.jsx`](client/src/pages/RealTraces.jsx):

```js
if(truth !== null){
    const row = result.heatmap.subarray(truth * T, (truth + 1) * T);
    setLeakSample(argMax(row));
}
```

This is meta-nice: the trace plot shows a dotted vertical line at the leak sample, but only **after** CPA has run. The audience watches CPA discover the leak position, then sees the marker appear. The leak isn't a magic number from a config file — it falls out of the math.

---

## Reading the plots

The three CPA-related plots tell different parts of the story.

### Sample power trace

A single trace as a line plot. The X-axis is sample index (time), Y-axis is power (arbitrary units). In the simulated demo, every trace looks like random noise; you cannot see the leak. That's the point — leaks are invisible to the naked eye, you need statistics. In the real ASCAD plot, you may see some structure (clock cycles, register operations).

### Peak |correlation| per key guess

256 bars, one per candidate key value. Y-axis is `|r|`, ranging 0 to 1. With CPA working, one bar towers above the rest. Coloured:

- **Green** = ground truth (the actual key byte, when known)
- **Red** = recovered (the candidate CPA picked)

When green and red are on the same bar, the attack succeeded. When they're on different bars, the attack failed — usually due to too few traces or too much noise.

### Correlation heatmap

A 2-D heatmap: rows are key candidates (0–255), columns are sample indices (0 to T). Each cell shows the absolute correlation at that `(guess, sample)` pair. One row (the correct key) lights up at one column (the leak sample). That single bright cell is what CPA actually finds.

The heatmap matters pedagogically because it shows **how** CPA locates leaks in unknown hardware: by scanning every sample point for the candidate that lights up. In a real attack you don't know the leak position in advance — the heatmap is the search.

---

## Important code blocks

### `runCPA` — the core attack

[`client/src/lib/cpa.js`](client/src/lib/cpa.js). For each of 256 candidates, build the hypothesis vector and correlate it against every trace column. Yields to the event loop every 16 candidates so the UI can repaint:

```js
for(let g = 0; g < 256; g++){
    if(signal?.aborted) return null;
    for(let t = 0; t < N; t++) hyp[t] = HW[SBOX[plaintexts[t][byteIdx] ^ g]];
    for(let s = 0; s < T; s++){
        for(let t = 0; t < N; t++) col[t] = traces[t][s];
        const r = Math.abs(pearson(hyp, col, N));
        heatmap[g * T + s] = r;
        if(r > peakCorr[g]) peakCorr[g] = r;
    }
    if(g % 16 === 15){
        onProgress?.(g, peakCorr, heatmap);
        await new Promise(r => setTimeout(r, 0));
    }
}
```

Performance notes:
- `hyp` and `col` are allocated **once**, outside the loops. Allocating inside would generate ~180k garbage typed-arrays per run on ASCAD-sized inputs.
- `pearson` is a hand-rolled two-pass implementation. `Math.cov`/`Math.corr` don't exist; using a stats library would pull in megabytes.
- The `await setTimeout(0)` between candidate batches is what keeps the page responsive — without it, the JS event loop is blocked for seconds and the browser thinks the tab is frozen.

### `naiveCompare` and `busyWaitNs` — the leak

[`server/routes/vulnerable.js`](server/routes/vulnerable.js):

```js
function busyWaitNs(targetNs){
    if(targetNs <= 0n) return;
    const start = process.hrtime.bigint();
    while(process.hrtime.bigint() - start < targetNs){
        //cpu spin, faster than setTimeout function
    }
}

function naiveCompare(a, b, amplificationNs){
    if(a.length !== b.length) return false;
    for(let i = 0; i < a.length; i++){
        if(a[i] !== b[i]) return false;   //early exit leak
        busyWaitNs(amplificationNs);
    }
    return true;
}
```

`process.hrtime.bigint()` returns nanoseconds as BigInt — orders of magnitude more precise than `Date.now()` (milliseconds). The `busyWaitNs` spin loop is required because `setTimeout` has ~1 ms resolution; we need microsecond control. CPU spinning is wasteful but accurate.

### `recoverKey` — driving the timing attack

[`client/src/lib/timing.js`](client/src/lib/timing.js):

```js
for(let pos = 0; pos < keyLength; pos++){
    const medians = new Float64Array(256);
    for(let candidate = 0; candidate < 256; candidate++){
        const guess = new Uint8Array(keyLength);
        guess.set(recovered.subarray(0, pos));
        guess[pos] = candidate;
        const samples = [];
        for(let s = 0; s < samplesPerByte; s++){
            const { ns } = await singleQuery(guess, ampNs, endpoint);
            samples.push(ns);
        }
        medians[candidate] = median(samples);
    }
    let best = 0;
    for(let i = 1; i < 256; i++) if(medians[i] > medians[best]) best = i;
    recovered[pos] = best;
}
```

Outer loop walks positions 0–15. Inner loops try all 256 candidates and average over a few samples. Median wins over mean because GC pauses and OS hiccups make the mean unreliable.

### Chart abstraction

[`client/src/components/Chart.jsx`](client/src/components/Chart.jsx) wraps `Plotly.react()` in a `useEffect` so React owns when redraws happen:

```js
export default function Chart({ data, layout, style }){
    const ref = useRef(null);
    useEffect(() => {
        if(ref.current) Plotly.react(ref.current, data, {...BASE_LAYOUT, ...layout});
    }, [data, layout]);
    return <div ref={ref} style={{width: '100%', ...style}} />;
}
```

`Plotly.react()` is Plotly's "create-or-update" API — first call creates the chart, subsequent calls diff and only redraw what changed. Without that, every state update would re-create the SVG from scratch, which is sluggish for the heatmap.

### Plot data builders

[`client/src/lib/plots.js`](client/src/lib/plots.js) contains pure functions that turn typed arrays into the JSON shapes Plotly expects. No React, no Plotly imports — just data shaping. This separation means the page components stay focused on state and UX; nothing Plotly-specific leaks into them.

---

## Gotchas

These are the things that surprised me while building this — worth knowing if you're extending the project.

- **CORS.** Different ports are different origins. The browser blocks cross-origin `fetch` responses by default. We add `cors({origin: 'http://localhost:5173'})` so the server permits the React dev server.
- **Server-side timing, not client-side.** Measure with `process.hrtime.bigint()` on the server and return the elapsed nanoseconds in the response. Client-side timing includes network round-trip jitter, which often drowns the signal. Showing both side-by-side is a good lesson.
- **Median, not mean.** A 10 ms GC pause is 1000× the timing signal. The mean is dominated by the worst sample; the median is dominated by the typical one.
- **Typed arrays.** `Float32Array` is roughly 50× faster than `[]` for the CPA inner loop. Regular arrays box every number and hit polymorphic-inline-cache misses.
- **WSL and Vite.** Vite running in WSL doesn't pick up file changes on the Windows filesystem via inotify. Enable `server.watch.usePolling` in `vite.config.js` or expect to refresh manually.
- **Plotly + Vite.** Vanilla `react-plotly.js` has CommonJS/ESM interop issues under Vite. We use `plotly.js-dist-min` directly via `Plotly.react()` instead.
- **`BigInt` and JSON.** `process.hrtime.bigint()` returns `BigInt`, which doesn't serialise to JSON. Convert to a string on the server, parse with `Number()` on the client (nanoseconds fit safely in a double, picoseconds wouldn't).
- **Don't ship the full ASCAD HDF5** — it's ~7 GB. Preprocess offline, ship the slice you need.

---

## Further reading

- **FIPS 197** — the AES specification (the SBOX table is in there).
- **Kocher, Jaffe, Jun (1999)** — "Differential Power Analysis", the original paper introducing DPA. CPA is a refinement.
- **Brier, Clavier, Olivier (2004)** — "Correlation Power Analysis with a Leakage Model", the CPA paper proper.
- **ASCAD repository** — [https://github.com/ANSSI-FR/ASCAD](https://github.com/ANSSI-FR/ASCAD).
- **"Lucky Thirteen"** — a real-world timing attack against TLS that needed tens of millions of requests. Useful context for how slow honest timing attacks really are.
