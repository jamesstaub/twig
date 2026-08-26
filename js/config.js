// ================================
// MIDI CONFIGURATION
// ================================

export const midiConfig = {
    // --- Note/CC in ---
    inputChannel: 1, // MIDI channel 1 by default (1-16)
    // Input port id; null = listen on every input
    inputId: null,
    // Incoming notes below this are ignored. Default 13 keeps the pulse
    // outputs' own notes (1..12) from feeding back into the fundamental
    // when in and out share a port (e.g. an IAC loop).
    inputNoteMin: 13,
    drawbarsCC: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // Default CCs for 12 drawbars

    // --- Note out (pulse blips) ---
    outputChannel: 1, // channel for pulse note blips (1-16)
    // Web MIDI output port id; null = first available
    outputId: null,

    // --- Clock/transport out ---
    // Port for MIDI clock ticks and transport start/stop; null = same port
    // as note out. Clock messages are system-realtime — no channel exists.
    clockOutputId: null,

    // Pulse outputs: note per overtone (linear 1..N by default, reassignable
    // in the MIDI modal) and global master switches for the two pulse paths
    pulseNotes: Array.from({ length: 16 }, (_, i) => i + 1),
    pulseMidiEnabled: true,
    pulseOscEnabled: true,
};
/**
 * CONFIGURATION MODULE
 * Contains spectral systems, constants, and application state
 */

// ================================
// SPECTRAL SYSTEMS CONFIGURATION
// ================================

// Default partial range for generated systems. Systems built from a formula
// expose generate(start): "start harmonic" shifts the window to the same
// partial COUNT beginning at that partial (absolute, not re-rooted — start 5
// on the Harmonic Series puts ratios 5..16 on the drawbars). Measured and
// historical systems (bonang, bells, organ stops) have no generate and the
// start-harmonic control hides for them.
export const DEFAULT_PARTIAL_START = 1;
export const DEFAULT_PARTIAL_END = 12;
// Upper bound for the start-harmonic control and OSC clamp
export const START_HARMONIC_MAX = 64;
// Stiff-string inharmonicity coefficient: default and control/OSC bounds
export const DEFAULT_STIFFNESS_B = 0.001;
export const STIFFNESS_B_MAX = 0.1;
// Acoustic-tube far-end closedness (0 = open-open, 1 = open-closed)
export const DEFAULT_TUBE_CLOSEDNESS = 1;
// Sethares pseudo-octave factors: A = 2 is the harmonic series; the
// stretched system dials above it, the compressed system below it
export const DEFAULT_STRETCH_A = 2.1;
export const STRETCH_A_MIN = 2;
export const STRETCH_A_MAX = 3;
export const DEFAULT_COMPRESS_A = 1.9;
export const COMPRESS_A_MIN = 1.5;
export const COMPRESS_A_MAX = 2;

const PHI = (1 + Math.sqrt(5)) / 2;

function range(start, end, step = 1) {
    const out = [];
    for (let v = start; v <= end + 1e-9; v += step) out.push(v);
    return out;
}

/** Integer harmonic series over an arbitrary range of partials. */
function harmonicSeries(start = DEFAULT_PARTIAL_START, end = DEFAULT_PARTIAL_END) {
    return range(start, end);
}

/**
 * Sethares stretched/compressed spectrum: partial n falls at n^log2(A), so the
 * pseudo-octave lands on A instead of 2. A = 2 gives the harmonic series;
 * 2.1 is Sethares' classic stretched timbre, 1.9 its compressed mirror.
 */
function stretchedSpectrum(A, start, end) {
    const exp = Math.log2(A);
    return range(start, end).map(n => Math.pow(n, exp));
}

/**
 * Stiff string (piano) inharmonicity: f_n = n * sqrt(1 + B*n^2), normalized to
 * partial 1 so shifted windows stay on the same physical string. Real pianos
 * measure B ≈ 0.0001–0.001 in the midrange.
 */
function stiffString(B, start, end) {
    const f = (n) => n * Math.sqrt(1 + B * n * n);
    return range(start, end).map(n => f(n) / f(1));
}

/**
 * Transverse modes of a free-free bar (glockenspiel, gamelan saron):
 * frequencies ∝ (kL)^2 with the exact first five roots of cos(kL)·cosh(kL)=1,
 * then the asymptote kL ≈ (2n+1)π/2. Ratios: 1, 2.76, 5.40, 8.93, 13.34…
 */
function freeBar(start, end) {
    const kL = [4.7300408, 7.8532046, 10.9956078, 14.1371655, 17.2787597];
    while (kL.length < end) kL.push((2 * (kL.length + 1) + 1) * Math.PI / 2);
    return range(start, end).map(n => Math.pow(kL[n - 1] / kL[0], 2));
}

/**
 * Standing-wave modes of an acoustic tube whose far-end boundary sweeps
 * from open (q = 0: pressure node, f_n = nv/2L — all integer harmonics,
 * the flute family) to closed (q = 1: pressure antinode, f_n = nv/4L odd
 * multiples only — the clarinet family): mode n falls at n − q/2,
 * normalized to mode 1. Between the endpoints the reflection phase of a
 * partially stopped pipe slides even harmonics continuously into odd
 * positions. v and L set absolute pitch, which twig's fundamental covers.
 */
function acousticTube(closedness, start, end) {
    const f = (n) => n - closedness / 2;
    return range(start, end).map(n => f(n) / f(1));
}

/**
 * Combination (sum) tones m·a + n·b of two generators — the spectralist
 * ring-modulation technique. Deduped, sorted; returns `count` values
 * starting from the start-th tone at or above 1/1.
 */
function combinationTones(a, b, start, count) {
    const maxCoeff = 6 + start; // enough lattice points to reach the window
    const values = [];
    for (let m = 0; m <= maxCoeff; m++) {
        for (let n = 0; n <= maxCoeff; n++) {
            if (m === 0 && n === 0) continue;
            const v = m * a + n * b;
            if (v >= 1 - 1e-6) values.push(v);
        }
    }
    values.sort((x, y) => x - y);
    const out = [];
    for (const v of values) {
        if (out.length && Math.abs(out[out.length - 1] - v) < 1e-6) continue;
        out.push(v);
        if (out.length === start + count - 1) break;
    }
    return out.slice(start - 1);
}

function decimalLabels(ratios, digits = 2) {
    return ratios.map(r => r.toFixed(digits).replace(/\.?0+$/, ''));
}

/** Materialize a generative system's default ratios/labels from generate(1). */
function generative(def) {
    return { ...def, ...def.generate(DEFAULT_PARTIAL_START) };
}

const OTONALITY_PARTIALS = [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 21, 22];
const OTONALITY = OTONALITY_PARTIALS.map(n => n / 8);

export const spectralSystems = [
    generative({
        name: "Harmonic Series",
        description:
            '<b>Canonical.</b> Exact integer partials — the spectrum of bowed, blown, and sung tones, and the reference point for every other system here. See <a href="https://en.wikipedia.org/wiki/Harmonic_series_(music)">Harmonic series (Wikipedia)</a>.',
        generate(start) {
            const ratios = harmonicSeries(start, start + 11);
            return { ratios, labels: ratios.map(n => `${n}:1`) };
        },
    }),

    generative({
        name: "Odd Harmonics",
        description:
            '<b>Canonical.</b> Odd partials only (1, 3, 5, …) — the clarinet / closed-pipe / square-wave family. Also the natural companion timbre for the Bohlen–Pierce system below, which was derived from odd partials of the tritave.',
        generate(start) {
            const ratios = range(start, start + 11).map(n => 2 * n - 1);
            return { ratios, labels: ratios.map(n => `${n}:1`) };
        },
    }),

    generative({
        name: "Stretched Spectrum (Sethares)",
        description:
            '<b>Designed, research-based.</b> Partial n falls at n<sup>log₂ A</sup> with the pseudo-octave A dialed above 2 — true octaves beat while the stretched octave stays pure. A = 2.1 is Sethares’ classic timbre from <i>Tuning, Timbre, Spectrum, Scale</i>: a spectrum and the scale at its dissonance minima define each other. See <a href="https://sethares.engr.wisc.edu/consemi.html">Relating Tuning and Timbre</a> and <a href="https://en.xen.wiki/w/Xentimbre">xentimbre</a>.',
        params: ['stretchA'],
        generate(start, { stretchA = DEFAULT_STRETCH_A } = {}) {
            const ratios = stretchedSpectrum(stretchA, start, start + 11);
            return { ratios, labels: decimalLabels(ratios) };
        },
    }),

    generative({
        name: "Compressed Spectrum (Sethares)",
        description:
            '<b>Designed, research-based.</b> The mirror of the stretched spectrum: partial n at n<sup>log₂ A</sup> with the pseudo-octave A dialed below 2. Darker and more clustered than harmonic; its natural scale is compressed the same way. A = 1.9 is the classic mirror of Sethares’ stretched timbre.',
        params: ['compressA'],
        generate(start, { compressA = DEFAULT_COMPRESS_A } = {}) {
            const ratios = stretchedSpectrum(compressA, start, start + 11);
            return { ratios, labels: decimalLabels(ratios) };
        },
    }),

    generative({
        name: "Stiff String (Piano Inharmonicity)",
        description:
            '<b>Physical model.</b> f<sub>n</sub> = n·√(1 + Bn²): string stiffness sharpens upper partials progressively — the reason pianos are stretch-tuned. Real midrange pianos measure B ≈ 0.0001–0.001; raise it for exaggerated bell-piano hybrids.',
        params: ['stiffnessB'], // per-system dials (see SYSTEM_PARAM_DIALS)
        generate(start, { stiffnessB = DEFAULT_STIFFNESS_B } = {}) {
            const ratios = stiffString(stiffnessB, start, start + 11);
            return { ratios, labels: decimalLabels(ratios, 3) };
        },
    }),

    generative({
        name: "Free Bar (Glockenspiel / Saron)",
        description:
            '<b>Physical model.</b> Transverse modes of a free metal bar: 1, 2.76, 5.40, 8.93, 13.34… — the true metallic-clang spectrum of glockenspiels, chimes, and gamelan saron-family bars. Per Sethares, this is the timbre family from which slendro-like tunings emerge.',
        generate(start) {
            const ratios = freeBar(start, start + 7);
            return { ratios, labels: decimalLabels(ratios) };
        },
    }),

    {
        name: "Gamelan Bonang (Measured)",
        description:
            '<b>Measured.</b> Sethares’ field measurement of a bonang gong: partials at 1, 1.52, 3.46, 3.92. The slendro scale falls out of this spectrum’s dissonance minima. See <a href="https://searchingfornewsound.blogspot.com/2022/05/gamelan-tuning-and-instrumental-spectra.html">gamelan tuning &amp; instrumental spectra</a>.',
        ratios: [1, 1.52, 3.46, 3.92],
        labels: decimalLabels([1, 1.52, 3.46, 3.92])
    },

    {
        name: "Church Bell (Minor-Third Bell)",
        description:
            '<b>Measured, idealized profile.</b> The harmonically tuned bell: hum ½, prime 1, tierce 6/5, quint 3/2, nominal 2, then upper partials to the octave nominal. The minor-third tierce is what makes a bell sound like a bell. See <a href="https://www.hibberts.co.uk/basic-principles-of-bell-tuning/">Hibberts — bell tuning</a>.',
        ratios: [1 / 2, 1 / 1, 6 / 5, 3 / 2, 2 / 1, 5 / 2, 3 / 1, 4 / 1],
        labels: ["hum", "prime", "tierce", "quint", "nom.", "deciem", "s.quint", "oct.nom"]
    },

    generative({
        name: "Golden Ratio (Chowning, Stria)",
        description:
            '<b>Designed, historical.</b> Partials at powers of φ ≈ 1.618 — the spectrum of Chowning’s <i>Stria</i> (1977). Self-reinforcing: the difference between adjacent partials is itself a partial (φ<sup>n+1</sup> − φ<sup>n</sup> = φ<sup>n−1</sup>), so intermodulation stays inside the spectrum. See <a href="https://geometrycode.com/golden-ratio-and-sound-john-chowning-synthesis/">Chowning and the golden ratio</a>.',
        generate(start) {
            const exponents = range(start, start + 7).map(n => n - 1);
            return {
                ratios: exponents.map(k => Math.pow(PHI, k)),
                labels: exponents.map(k => (k === 0 ? "1" : `φ^${k}`)),
            };
        },
    }),

    generative({
        name: "Ring-Mod Spectrum (1 × √2)",
        description:
            '<b>Designed, spectralist technique.</b> Sum tones m + n·√2 of two generators a tritone apart — the ring-modulation / combination-tone spectra Grisey and Murail built harmony from (cf. <a href="https://en.wikipedia.org/wiki/Partiels">Partiels</a>). Inharmonic but internally coherent.',
        generate(start) {
            const ratios = combinationTones(1, Math.SQRT2, start, 12);
            return { ratios, labels: decimalLabels(ratios) };
        },
    }),

    {
        name: "Otonality on 8 (Partch, 11-limit)",
        description:
            '<b>Historical, Partch.</b> Harmonics 8–22 (11-limit products only) rooted on the 8th partial — Partch’s otonality, the overtone half of his tonality diamond. Flip the Subharmonic toggle for the utonality mirror: that duality <i>is</i> the diamond. See <a href="https://en.wikipedia.org/wiki/Otonality_and_utonality">Otonality and utonality</a>.',
        ratios: OTONALITY,
        labels: OTONALITY_PARTIALS.map(n => `${n}/8`)
    },

    generative({
        name: "Bohlen–Pierce (13-EDT)",
        description:
            '<b>Designed, scale-as-spectrum.</b> 13 equal divisions of the tritave (3:1), each step 3<sup>1/13</sup>. Strictly a scale used as a spectrum — BP was derived from odd partials 3:5:7, so try it with the Odd Harmonics character in mind. See <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale">Bohlen–Pierce (Wikipedia)</a>.',
        generate(start) {
            const exponents = range(start, start + 12).map(n => n - 1);
            return {
                ratios: exponents.map(k => Math.pow(3, k / 13)),
                labels: exponents.map(k => (k === 0 ? "1/1" : `3^(${k}/13)`)),
            };
        },
    }),

    {
        name: "Hammond — Standard 9 Drawbars",
        description:
            "<b>Historical.</b> Canonical Hammond single-manual drawbar mapping (left→right): 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1' — each a harmonic/aliquot of the fundamental. The classic additive palette of B-3 / tonewheel organs.",
        ratios: [1 / 2, 3 / 2, 1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 8 / 1],
        labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
        notes:
            "Hammond drawbars intentionally sample selected harmonics (sub-octave through high partials); the 7th harmonic is omitted in the classic tonewheel mapping."
    },

    {
        name: "Hammond — Worn Tonewheels (Detuned)",
        description:
            "<b>Designed.</b> The standard Hammond drawbar set with small progressive detunes modeling mechanical imperfection and tonewheel wear — slow beating and organic instability.",
        ratios: [
            (1 / 2) * (1 + 0 / 1000),
            (3 / 2) * (1 + 8 / 10000),
            (1 / 1) * (1 + 3 / 10000),
            (2 / 1) * (1 + 6 / 10000),
            (3 / 1) * (1 - 7 / 10000),
            (4 / 1) * (1 + 10 / 10000),
            (5 / 1) * (1 + 15 / 10000),
            (6 / 1) * (1 - 5 / 10000),
            (8 / 1) * (1 + 20 / 10000)
        ],
        labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
        notes:
            "Detune multipliers are small fractional offsets (e.g. 8/10000 ≈ 0.8‰). Artistic suggestions — increase offsets for stronger beating."
    },

    {
        name: "Pipe Organ — Principal Chorus",
        description:
            "<b>Historical.</b> Common principal stops (footages) of an organ chorus: 16', 8', 4', 2', 1' — octave-related ranks in powers of two. Base palette for a church-organ sound; add the Cornet mutations below for color.",
        ratios: [1 / 2, 1 / 1, 2 / 1, 4 / 1, 8 / 1],
        labels: ["1/2", "1/1", "2/1", "4/1", "8/1"]
    },

    {
        name: "Cornet V (Baroque Mutations)",
        description:
            "<b>Historical.</b> The classic five-rank Cornet: 8′ + 4′ + 2⅔′ (Nazard) + 2′ + 1⅗′ (Tierce) — literally harmonics 1–5 of the 8′ fundamental. Mutation stops speaking at non-octave partials are essential to historical organ color.",
        ratios: [1, 2, 3, 4, 5],
        labels: ["8′", "4′", "2⅔′", "2′", "1⅗′"]
    },

    // Appended last: /twig/system addresses systems by index, so new
    // systems must not renumber existing ones
    generative({
        name: "Acoustic Tube (Boundary Conditions)",
        description:
            '<b>Physical model.</b> Standing waves in a pipe: open at both ends (f<sub>n</sub> = nv/2L — every harmonic, the flute) or closed at one end (f<sub>n</sub> = nv/4L, odd harmonics only — the clarinet; the closed end forces a node). The dial sweeps the far-end boundary between them: a partially stopped pipe whose even modes slide continuously into the odd positions.',
        params: ['tubeClosedness'],
        generate(start, { tubeClosedness = DEFAULT_TUBE_CLOSEDNESS } = {}) {
            const ratios = acousticTube(tubeClosedness, start, start + 11);
            return { ratios, labels: decimalLabels(ratios) };
        },
    }),

]; // end export

/**
 * The system at `index`, regenerated for the current tunable parameters:
 * the start-harmonic window and any per-system options (stiffness B).
 * Fixed-table systems pass through untouched.
 */
export function systemWithStart(index, startHarmonic = 1, options = {}) {
    const base = spectralSystems[index];
    if (!base?.generate) return base;
    return { ...base, ...base.generate(startHarmonic, options) };
}


// ================================
// CONSTANTS
// ================================

export const MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const DEFAULT_FUNDAMENTAL = 130.81; // C3
export const DEFAULT_MIDI_NOTE = 48; // MIDI for C3
export const DEFAULT_OCTAVE = 3;
export const BASE_OCTAVE_MIDI = 48; // MIDI for C3

export const WAVETABLE_SIZE = 4096; // Standard size for a PeriodicWave table
// Signal source modes; order is the bridge index for /twig/source
export const SOURCE_MODES = ['oscillators', 'adc', 'soundfile', 'pink', 'white'];
// Per-overtone lowpass resonance applied when an external source is
// selected, turning the voice bank into a resonant filter bank
export const FILTER_BANK_Q = 30;
// Partial count of the default system; systems may have more or fewer
export const NUM_HARMONICS = spectralSystems[0].ratios.length;
export const DEFAULT_MASTER_GAIN = 0.3;
export const DEFAULT_MASTER_SLEW = 0.01; // seconds

// Per-overtone ADSR fallback (a/d/r seconds, s 0-1)
export const ENVELOPE_DEFAULTS = { a: 0.01, d: 0.15, s: 0.7, r: 0.4 };

// Visualization constants
export const VISUAL_HARMONIC_TERMS = 12;
export const CANVAS_HEIGHT_RATIOS = {
    RADIAL: 0.75,
    OSCILLOSCOPE: 0.25
};

// ================================
// APPLICATION STATE
// ================================

export const AppState = {
    // Routing mode for audio export
    audioRoutingMode: 'mono',
    // Audio properties
    masterGainValue: DEFAULT_MASTER_GAIN,
    masterSlewValue: DEFAULT_MASTER_SLEW,
    fundamentalFrequency: DEFAULT_FUNDAMENTAL,
    currentMidiNote: DEFAULT_MIDI_NOTE,
    currentOctave: DEFAULT_OCTAVE,
    isPlaying: false,

    // Signal source: oscillator bank, or an external signal played through
    // the per-voice chains as a resonant filter bank
    sourceMode: 'oscillators', // see SOURCE_MODES
    adcDeviceId: null,         // audio input device (null = system default)
    adcChannel: 0,             // 0-based channel within the input stream
    soundfileName: null,       // display only; the buffer lives in SourceManager

    // Per-overtone convolution sends, sparse objects keyed by voice index:
    // { wet 0-1, feedback 0-0.99, gain -1..1, ir: IRManager key | null }
    oscillatorConvolutions: {},

    // Spectral properties
    currentSystem: spectralSystems[0],
    currentSystemIndex: 0,
    // First partial of generative systems (1..START_HARMONIC_MAX). Systems
    // without generate() (measured/historical tables) ignore it.
    startHarmonic: 1,
    // Stiff-string inharmonicity coefficient (0..STIFFNESS_B_MAX); only the
    // Stiff String system reads it
    stiffnessB: DEFAULT_STIFFNESS_B,
    // Acoustic-tube far-end closedness (0..1); only the Tube system reads it
    tubeClosedness: DEFAULT_TUBE_CLOSEDNESS,
    // Sethares pseudo-octave factors; read by their respective systems
    stretchA: DEFAULT_STRETCH_A,
    compressA: DEFAULT_COMPRESS_A,
    harmonicAmplitudes: (() => {
        const amplitudes = Array(NUM_HARMONICS).fill(0.0);
        amplitudes[0] = 1.0; // Fundamental enabled by default
        return amplitudes;
    })(),
    isSubharmonic: false,
    currentWaveform: 'square',

    // Per-overtone cycle gates and lowpass filters, sparse objects keyed by
    // partial index. Gate: { mode: 0 off | 1 alternating | 2 euclidean |
    // 3 probability, x, y }. Filter: { multiplier (1-based partial index into
    // the current system, applied to the voice's audible base; <= 0 open), q }.
    oscillatorGates: {},
    oscillatorFilters: {},

    // Per-overtone overdrive before the filter, sparse by index: amount
    // 0-5 (0 = clean bypass, 1 = full tanh saturation, up to 5 = hard clip).
    oscillatorDrives: {},

    // Envelope mode: 'open' (every voice sounds freely — the classic organ
    // behavior) or 'adsr' (voices rest silent; keyboard/pad triggers gate
    // each voice's ADSR: keydown = attack→decay→sustain, keyup = release).
    envelopeMode: 'open',

    // Per-overtone ADSR, sparse by index: { a, d, r } seconds, { s } 0-1.
    // Unset voices fall back to ENVELOPE_DEFAULTS in the getter.
    oscillatorEnvelopes: {},

    // Per-overtone pulse outputs, sparse objects keyed by partial index:
    // { midi: bool, osc: bool }. Pulses fire once per oscillator cycle
    // (audible-gate cycles only) while the voice is <= 50 Hz.
    oscillatorPulseOuts: {},

    // Per-overtone sequencer (1:1 with voices for now), sparse by index:
    // { shape: waveform name (same options as the oscillator menu),
    //   amounts: { gain: 0-1, freq: -1..1 (partial-index span), res: 0-1 } }
    oscillatorSequencers: {},
    // Which overtone (index) drives the MIDI clock output; null = none.
    // Exclusive — at most one at a time.
    midiClockVoice: null,

    // Visualization properties
    visualizationFrequency: 5.25,
    spreadFactor: 0.2,

    // Custom waveforms
    customWaveCount: 0,

    // Audio context references (initialized later)
    audioContext: null,
    compressor: null,
    masterGain: null,
    oscillators: [],

    // P5 instance reference
    p5Instance: null
};

// ================================
// STATE MANAGEMENT
// ================================

export function updateAppState(updates) {
    Object.assign(AppState, updates);
}

export function getCurrentSystem() {
    return AppState.currentSystem;
}

export function setCurrentSystem(systemIndex) {
    AppState.currentSystemIndex = systemIndex;
    AppState.currentSystem = systemWithStart(systemIndex, AppState.startHarmonic, {
        stiffnessB: AppState.stiffnessB,
        tubeClosedness: AppState.tubeClosedness,
        stretchA: AppState.stretchA,
        compressA: AppState.compressA,
    });
}

export function getHarmonicAmplitude(index) {
    return AppState.harmonicAmplitudes[index] || 0;
}

export function setHarmonicAmplitude(index, amplitude) {
    if (index >= 0 && index < AppState.harmonicAmplitudes.length) {
        AppState.harmonicAmplitudes[index] = amplitude;
    }
}