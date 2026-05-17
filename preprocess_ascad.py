"""Preprocess ASCAD .h5 traces into compact .bin files for the browser demo.

Usage:
    python preprocess_ascad.py [ASCAD.h5] [output_dir]

Writes:
    ascad_traces.bin       float32, N x T row-major
    ascad_plaintexts.bin   uint8,   N x 16
    ascad_meta.json        { n_traces, n_samples, n_bytes, key }

The leak sample per byte is derived in the browser from the correlation
heatmap after CPA runs — no need to compute it offline.
"""
import h5py
import numpy as np
import json
import sys
from pathlib import Path

ASCAD_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("ASCAD.h5")
OUT_DIR    = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("client/public/data")
N_TRACES   = 2000

OUT_DIR.mkdir(parents=True, exist_ok=True)

with h5py.File(ASCAD_PATH, "r") as f:
    traces     = np.array(f["Profiling_traces/traces"][:N_TRACES], dtype=np.float32)
    plaintexts = np.array(f["Profiling_traces/metadata"]["plaintext"][:N_TRACES], dtype=np.uint8)
    key        = list(map(int, f["Profiling_traces/metadata"]["key"][0]))

N, T = traces.shape
half = min(350, T // 2)
center = T // 2
traces = np.ascontiguousarray(traces[:, center - half:center + half], dtype=np.float32)
_, T = traces.shape

traces.tofile(OUT_DIR / "ascad_traces.bin")
plaintexts.tofile(OUT_DIR / "ascad_plaintexts.bin")

(OUT_DIR / "ascad_meta.json").write_text(json.dumps({
    "n_traces":  N,
    "n_samples": T,
    "n_bytes":   16,
    "key":       key,
}))

print(f"wrote {N} traces x {T} samples -> {OUT_DIR}")
print(f"key: {' '.join(f'{k:02x}' for k in key)}")
