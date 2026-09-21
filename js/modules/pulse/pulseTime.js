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
 * Wall-clock ms at which a LEAD message's event lands. Gate worklets
 * announce every pulse and clock beat half a period ahead — the
 * scheduling lead — stamped with the announcement's audio-clock time; the
 * event lands half a period later: the cycle's start (the audible click
 * of a low-frequency square/saw), its midpoint for a voice with "offset
 * pulse 50%", or a clock beat's boundary. A message that crossed a
 * throttled main thread after its landing passed holds to the following
 * period instead of firing at an arbitrary lag.
 */
export function pulseLandingMs(ctx, pulse) {
    const now = window.performance.now();
    if (!ctx || !(pulse?.frequency > 0) || !(pulse?.audioTime > 0)) return now;
    const periodMs = 1000 / pulse.frequency;
    let t = audioTimeToPerformanceMs(ctx, pulse.audioTime + 0.5 / pulse.frequency);
    while (t < now) t += periodMs;
    return t;
}

/**
 * Audio-clock time (seconds) at which a lead message's event lands. The
 * exact, un-held counterpart of pulseLandingMs for consumers that log
 * against the audio timeline instead of scheduling wall-clock events.
 */
export function pulseLandingAudioTime(pulse) {
    if (!(pulse?.frequency > 0) || !(pulse?.audioTime >= 0)) return pulse?.audioTime ?? 0;
    return pulse.audioTime + 0.5 / pulse.frequency;
}
