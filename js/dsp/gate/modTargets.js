/**
 * MODULATION TARGETS — where a voice's gate signal goes.
 *
 * The signal (gateSignal.js) is one unipolar 0-1 value per sample; each
 * target turns it into a sample on its own worklet output, which the
 * engine sums into an AudioParam (see ModulatorStage.route). The audio
 * gain is the exception: it multiplies the signal path itself rather than
 * leaving through an output.
 *
 * A target is `value(s, p)` where `p` is the block's parameter snapshot
 * (plus `tone`, the voice's pitch for this sample) — pure arithmetic, no
 * state, so targets stay independent of what drives them. ADDING A
 * DESTINATION is one entry here plus its output index in
 * ModulatorStage's CV_OUTPUTS.
 *
 * The CVs carry only the MODULATION TERM: the main thread owns each
 * AudioParam's base value, and the CV sums on top. For bounded params
 * (the convolution send, its feedback) the base is passed in so the sum
 * can be clamped before the base is subtracted back out.
 */

/** Q added at full modulation — a resonant sweep without self-oscillating. */
const Q_SPAN = 24;

/** Convolution feedback ceiling (mirrors CONV_FEEDBACK_MAX in the actions). */
const FEEDBACK_MAX = 0.99;

/** Lowest frequency a voice's filter series counts from (Hz). */
const MIN_AUDIBLE_HZ = 20;

/**
 * Hz between the modulated cutoff and the base one, along the voice's
 * overtone-series curve: the depth walks a continuous (interpolated)
 * partial index from the filter's base step, up the series or down it.
 * The series table and base step come from the host (`seqconfig`).
 */
export function cutoffDelta(s, { ratios, baseStep, depthCutoff, tone }) {
    if (!ratios || ratios.length === 0 || baseStep < 1 || depthCutoff === 0 || !(tone > 0)) return 0;

    const n = ratios.length;
    const span = depthCutoff > 0 ? n - baseStep : baseStep - 1;
    const index = Math.min(n, Math.max(1, baseStep + depthCutoff * s * span));
    const i0 = Math.floor(index);
    const frac = index - i0;
    const r0 = ratios[Math.min(n, i0) - 1];
    const r1 = ratios[Math.min(n, i0 + 1) - 1];
    const ratio = r0 + (r1 - r0) * frac;

    // Audible base: the lowest integer multiple of the voice clearing 20 Hz
    const base = tone * Math.max(1, Math.ceil(MIN_AUDIBLE_HZ / tone));
    return base * (ratio - ratios[baseStep - 1]);
}

/**
 * The control-signal destinations, in worklet output order (output 0 is
 * the gated audio).
 */
export const MOD_TARGETS = [
    {
        name: 'cutoff',
        output: 1,
        value: cutoffDelta,
    },
    {
        name: 'q',
        output: 2,
        value: (s, p) => p.depthRes * s * Q_SPAN,
    },
    {
        name: 'wet',
        output: 3,
        // Rises from whatever the send is set to, never past fully wet
        value: (s, p) => Math.min(1, p.baseWet + p.depthWet * s) - p.baseWet,
    },
    {
        name: 'feedback',
        output: 4,
        // Feedback may be negative (an inverting loop): modulation pushes
        // its MAGNITUDE toward the ceiling, keeping the sign
        value: (s, p) => {
            const sign = Math.sign(p.baseFeedback || 1);
            const modulated = p.baseFeedback + sign * p.depthFeedback * s;
            return Math.max(-FEEDBACK_MAX, Math.min(FEEDBACK_MAX, modulated)) - p.baseFeedback;
        },
    },
];

/** The audio path's gain: full signal at s = 1, down to (1 − depth) at s = 0. */
export function audioGain(s, depthGain) {
    return 1 - depthGain * (1 - s);
}
