// GPU browser drivers call requireGpuLease() before launching Chrome on the
// RTX 3090. heavy-check grants SILTWAKE_GPU_LEASE to `--class gpu` and
// `--class exclusive` jobs (and the v1 fallback, which is exclusive), so GPU
// work cannot skip the one-GPU lease.
export function requireGpuLease(what) {
  if (process.env.SILTWAKE_GPU_LEASE) return process.env.SILTWAKE_GPU_LEASE;
  console.error(`${what} launches a GPU Chrome, so it needs the GPU lease. Run it through ` +
    "scripts/heavy-check.sh --class gpu -- … (functional evidence), or --class exclusive for frame-time or performance numbers.");
  process.exit(2);
}
