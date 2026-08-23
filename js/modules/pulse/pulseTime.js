/**
 * Audio-clock → wall-clock mapping for scheduling against voice pulses.
 * Pure functions of (AudioContext, data) — no app state, no MIDI. Any
 * pulse consumer that schedules real-world events (Web MIDI timestamps,
 * OSC bundles, UI flashes) maps through here so they all agree.
 */

/**
 * Wall-clock ms (performance.now() timeline) at which `audioTime` becomes
 * audible. Uses getOutputTimestamp's coherent (contextTime,
 * performanceTime) pair — which includes output latency and avoids the
 * callback-quantum jitter of reading currentTime and performance.now() as
 * if they were simultaneous — falling back to currentTime + output latency
 * where unsupported.
 */
export function audioTimeToPerformanceMs(ctx, audioTime) {
    const now = window.performance.now();
    if (!ctx || !(audioTime >= 0)) return now;
    const ots = ctx.getOutputTimestamp?.();
    if (ots && ots.performanceTime > 0) {
        return ots.performanceTime + (audioTime - ots.contextTime) * 1000;
    }
    const latencyMs = (ctx.outputLatency ?? ctx.baseLatency ?? 0) * 1000;
    return now + (audioTime - ctx.currentTime) * 1000 + latencyMs;
}

/**
 * Wall-clock ms of a pulse's next cycle boundary — the audible click of a
 * low-frequency square/saw. Gate worklets emit pulses at the cycle
 * MIDPOINT (phase 0.5 — half a period of scheduling lead) stamped with the
 * emission's audio-clock time; the boundary is half a period later. A
 * pulse that crossed a throttled main thread after its boundary passed
 * holds to the following boundary instead of firing at an arbitrary lag.
 */
export function pulseCycleBoundaryMs(ctx, pulse) {
    const now = window.performance.now();
    if (!ctx || !(pulse?.frequency > 0) || !(pulse?.audioTime > 0)) return now;
    const periodMs = 1000 / pulse.frequency;
    let t = audioTimeToPerformanceMs(ctx, pulse.audioTime + 0.5 / pulse.frequency);
    while (t < now) t += periodMs;
    return t;
}
