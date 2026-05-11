import h5py
import numpy as np
import json
import struct
import sys
from pathlib import Path

ASCAD_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("ASCAD.h5")
OUT_DIR    = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("client/public/data")
N_TRACES   = 2000
BYTE_IDX   = 2

OUT_DIR.mkdir(parents=True, exist_ok=True)

with h5py.File(ASCAD_PATH, "r") as f:
    traces     = np.array(f["Profiling_traces/traces"][:N_TRACES], dtype=np.float32)
    plaintexts = np.array(f["Profiling_traces/metadata"]["plaintext"][:N_TRACES], dtype=np.uint8)
    key        = list(map(int, f["Profiling_traces/metadata"]["key"][0]))

N, T = traces.shape

window_center = T // 2
half = min(350, T // 2)
lo, hi = max(0, window_center - half), min(T, window_center + half)
traces = np.ascontiguousarray(traces[:, lo:hi], dtype=np.float32)
_, T = traces.shape

traces.tofile(OUT_DIR / "ascad_traces.bin")
plaintexts.tofile(OUT_DIR / "ascad_plaintexts.bin")

meta = {
    "n_traces":  N,
    "n_samples": T,
    "n_bytes":   16,
    "key":       key,
    "byte_idx":  BYTE_IDX,
}
(OUT_DIR / "ascad_meta.json").write_text(json.dumps(meta))

print(f"wrote {N} traces × {T} samples → {OUT_DIR}")
print(f"key byte [{BYTE_IDX}] = 0x{key[BYTE_IDX]:02x}")
