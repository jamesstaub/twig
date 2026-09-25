/**
 * CYCLE CONTOURS — the unipolar (0-1) shape a sequencer draws WITHIN each
 * active cycle. Pure, and shared by the gate worklet (which plays it) and
 * the sequence preview (which draws it), so there is one definition of
 * each shape.
 *
 * Ids are the stored/bridged value — never renumber. `custom` is filled
 * from a table the host sends over the port (a baked waveform,
 * min-max normalized); `hold` is the flat contour: pattern gating only.
 *
 * The built-in names match the oscillator menu's, which is what the UI
 * offers as contours.
 */

/** Contour ids by name — `shape` in the app's sequencer state. */
export const CONTOUR = {
    square: 0,
    sine: 1,
    triangle: 2,
    sawtooth: 3,
    sawRise: 4,
    custom: 5,
    hold: 6,
};

const TWO_PI = Math.PI * 2;

/**
 * Every contour, indexed by id. `fn(phase)` for the ones that are pure
 * math; `custom` reads the host's table and `hold` is constant.
 *
 * Sine is the boundary-zero raised cosine: an active cycle starts and ends
 * at silence, so pattern edges are click-free by construction. Square is a
 * real 50 % pulse rather than a constant — a constant would pin every
 * shaped row to 1 and make the contour a no-op.
 */
export const CONTOURS = [
    { id: CONTOUR.square, name: 'square', fn: (phase) => (phase < 0.5 ? 1 : 0) },
    { id: CONTOUR.sine, name: 'sine', fn: (phase) => (1 - Math.cos(TWO_PI * phase)) / 2 },
    { id: CONTOUR.triangle, name: 'triangle', fn: (phase) => 1 - Math.abs(2 * phase - 1) },
    { id: CONTOUR.sawtooth, name: 'sawtooth', fn: (phase) => 1 - phase },
    { id: CONTOUR.sawRise, name: 'sawRise', fn: (phase) => phase },
    { id: CONTOUR.custom, name: 'custom', fn: null },
    { id: CONTOUR.hold, name: 'hold', fn: () => 1 },
];

const BY_ID = new Map(CONTOURS.map((c) => [c.id, c]));
const BY_NAME = new Map(CONTOURS.map((c) => [c.name, c]));

/** Sample a 0-1 table at `phase`, wrapping and interpolating. */
export function sampleTable(table, phase) {
    if (!table || table.length === 0) return 1;
    const pos = phase * table.length;
    const i0 = Math.floor(pos) % table.length;
    const i1 = (i0 + 1) % table.length;
    return table[i0] + (table[i1] - table[i0]) * (pos - i0);
}

/**
 * The contour's value at `phase` (0-1). `table` is the host-sent custom
 * contour, used by id `custom`. Unknown ids hold at 1.
 */
export function contourValue(id, phase, table) {
    const contour = BY_ID.get(id);
    if (!contour) return 1;
    if (contour.fn) return contour.fn(phase);
    return id === CONTOUR.custom ? sampleTable(table, phase) : 1;
}

/** A built-in contour's function by name, or null (custom waveforms are sampled). */
export function contourFn(name) {
    return BY_NAME.get(name)?.fn ?? null;
}

/**
 * Contour id for a shape name: a built-in's id, or `custom` for a baked
 * waveform (the host sends its table alongside).
 */
export function contourIdFor(name) {
    return BY_NAME.get(name)?.id ?? CONTOUR.custom;
}
