/**
 * SEQUENCE PATTERNS — which cycles of a voice sound.
 *
 * One registry, read by everything that needs to know a pattern: the gate
 * worklet on the audio thread (`active`), the sequence preview
 * (`active`, `period`, `random`), the inspector's mode picker (`label`,
 * `params`) and the OSC bridge (`name`, `aliases`). Pure — no app state,
 * no Web Audio — so the worklet bundle can take it as is.
 *
 * ADDING A PATTERN TYPE is one entry here: give it the next id (ids are
 * the stored/bridged value, so never renumber the existing ones), an
 * `active` function, and the UI/preview metadata. Nothing else needs to
 * change.
 *
 * @typedef {Object} PatternContext - what a pattern decides from
 * @property {number} x - First parameter; its meaning is the pattern's own (see `params`)
 * @property {number} y - Second parameter
 * @property {number[]|null} steps - The explicit 0/1 sequence, when the pattern takes one
 * @property {Object} cache - Per-voice scratch the pattern may memoize in
 */

/**
 * Euclidean rhythm: `pulses` spread as evenly as possible over `steps`
 * (Bresenham — equivalent to Bjorklund up to rotation).
 * @returns {boolean[]}
 */
export function euclideanRhythm(pulses, steps) {
    const pattern = new Array(steps).fill(false);
    if (pulses <= 0) return pattern;
    if (pulses >= steps) return pattern.fill(true);
    let bucket = 0;
    for (let i = 0; i < steps; i++) {
        bucket += pulses;
        if (bucket >= steps) {
            bucket -= steps;
            pattern[i] = true;
        }
    }
    return pattern;
}

/** Memoized euclidean table for the current pulses/steps. */
function euclideanFor(cache, pulses, steps) {
    const key = `${pulses}/${steps}`;
    if (cache.euclideanKey !== key) {
        cache.euclideanKey = key;
        cache.euclidean = euclideanRhythm(pulses, steps);
    }
    return cache.euclidean;
}

/**
 * Every pattern, indexed by id.
 *
 * - `active(cycle, ctx)` — does cycle number `cycle` sound? The one thing
 *   the audio thread calls.
 * - `period(ctx)` — how many cycles the pattern takes to repeat (the
 *   preview draws that many).
 * - `bypass` — the sequencer is off: the voice passes through untouched
 *   and every control signal rests at 0.
 * - `random` — `active` is not reproducible, so the preview can't draw it.
 * - `randomizable` — the Randomize button may choose this pattern.
 * - `params` — the dials for `x` and `y` under this pattern: label, range
 *   and the default loaded when the pattern is chosen (x and y mean
 *   different things per pattern, so a value can't carry over).
 */
export const PATTERNS = [
    {
        id: 0,
        name: 'off',
        aliases: [],
        label: 'Off',
        bypass: true,
        params: [],
        active: () => true,
        period: () => 1,
    },
    {
        id: 1,
        name: 'alternating',
        aliases: ['alt'],
        label: 'Alternating',
        randomizable: true,
        params: [
            { key: 'x', label: 'cycles on', min: 1, max: 32, def: 1 },
            { key: 'y', label: 'cycles off', min: 0, max: 32, def: 1 },
        ],
        active: (cycle, { x, y }) => cycle % Math.max(1, Math.round(x) + Math.round(y)) < Math.round(x),
        period: ({ x, y }) => Math.max(1, Math.round(x) + Math.round(y)),
    },
    {
        id: 2,
        name: 'euclidean',
        aliases: ['euclid'],
        label: 'Euclidean',
        randomizable: true,
        params: [
            { key: 'x', label: 'pulses', min: 0, max: 32, def: 3 },
            { key: 'y', label: 'steps', min: 1, max: 32, def: 8 },
        ],
        active(cycle, { x, y, cache }) {
            const steps = Math.max(1, Math.round(y));
            return euclideanFor(cache, Math.min(Math.round(x), steps), steps)[cycle % steps];
        },
        period: ({ y }) => Math.max(1, Math.round(y)),
    },
    {
        id: 3,
        name: 'probability',
        aliases: ['prob'],
        label: 'Probability',
        random: true,
        params: [
            { key: 'x', label: 'probability', min: 0, max: 100, def: 50, format: (v) => `${Math.round(v)}%` },
        ],
        active: (cycle, { x }) => Math.random() * 100 < x,
        period: () => 1,
    },
    {
        id: 4,
        name: 'sequence',
        aliases: ['seq'],
        label: 'Sequence',
        params: [], // the 0/1 pattern is a text field, not dials
        active: (cycle, { steps }) => (steps && steps.length ? steps[cycle % steps.length] > 0.5 : true),
        period: ({ steps }) => Math.max(1, steps?.length || 1),
    },
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

/** The pattern with this id; the "off" pattern for an unknown one. */
export function patternById(id) {
    return BY_ID.get(id) ?? PATTERNS[0];
}

/** Does cycle `cycle` sound under pattern `id`? */
export function patternActive(id, cycle, ctx) {
    return patternById(id).active(cycle, ctx);
}

/** Cycles pattern `id` takes to repeat. */
export function patternPeriod(id, ctx) {
    return patternById(id).period(ctx);
}

/** Pattern id from a name or alias (the bridge's spelling), or undefined. */
export function patternIdFromName(name) {
    const key = String(name).toLowerCase();
    return PATTERNS.find((p) => p.name === key || p.aliases.includes(key))?.id;
}

/** The dials for a pattern's x/y (empty when it has none). */
export function patternParams(id) {
    return patternById(id).params;
}
