/**
 * CONFIGURATION MODULE
 * Contains spectral systems, constants, and application state
 */

// ================================
// SPECTRAL SYSTEMS CONFIGURATION
// ================================

/**
 * 
 * 
 * https://lawrencephelps.com/Documents/Articles/compoundstops.shtml
 */


export const spectralSystems = [
    // 1
    {
        name: "1. Harmonic Overtone Series (Integer)",
        description:
            'Classic harmonic series (exact integer partials). Use for natural, consonant spectra (e.g. voiced instruments, organ-like timbres). See the harmonic-series background: <a href="https://en.wikipedia.org/wiki/Harmonic_series_(music)">Wikipedia — Harmonic series</a>.',
        // exact integer partials expressed as math
        ratios: [1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 7 / 1, 8 / 1, 9 / 1, 10 / 1, 11 / 1, 12 / 1],
        labels: ["1:1", "2:1", "3:1", "4:1", "5:1", "6:1", "7:1", "8:1", "9:1", "10:1", "11:1", "12:1"],
        labelPrecision: 1
    },

    // 2
    {
        name: "2. Spectral Progressive Detuned Harmonics (Microtonal)",
        description:
            'Progressive microtonal detuning of the integer harmonic series. Detuning increases with partial index to produce time-varying beating and spectral shimmer (useful for spectral / ambient textures). This is an intentional synthesis choice rather than a canonical acoustic law.',
        // progressive detune with explicit fractional offsets
        ratios: [
            1 / 1,
            2 + 1 / 100,         // 2 + 0.01
            3 + 2 / 100,         // 3.02
            4 + 3 / 100,         // 4.03
            5 + 4 / 100,         // 5.04
            6 + 5 / 100,         // 6.05
            7 + 6 / 100,         // 7.06
            8 + 8 / 100,         // 8.08
            9 + 10 / 100,        // 9.10
            10 + 12 / 100,       // 10.12
            11 + 14 / 100,       // 11.14
            12 + 16 / 100        // 12.16
        ],
        labels: ["1/1", "201/100", "151/50", "403/100", "126/25", "121/20", "353/50", "202/25", "91/10", "253/25", "557/50", "304/25"],
        labelPrecision: 2
    },

    // 3
    {
        name: "3. Inharmonic Membrane / Plate Modes (Bessel-root based)",
        description:
            'Modal ratios derived from the first zeros of Bessel-type modal functions — a physically informed inharmonic series used to synthesize metallic / bell / plate timbres. This is a simplified circular-membrane / plate approximation (modal zeros of Bessel functions scale the modal frequencies). For background, see the math of Bessel roots and plate/modal modeling: <a href="https://en.wikipedia.org/wiki/Bessel_function">Bessel functions</a> and a modal-plate overview: <a href="https://courses.cs.washington.edu/courses/cse481i/20wi/pdfs/G-waveguides.pdf">modal plate notes (UW)</a>.',
        // first several J0 zeros used as numeric literals; ratios normalized to first root
        ratios: [
            1 / 1,
            5.520078110286311 / 2.404825557695773,   // ≈ 2.2949
            8.653727912911013 / 2.404825557695773,   // ≈ 3.5994
            11.791534439014281 / 2.404825557695773,  // ≈ 4.9037
            14.930917708487787 / 2.404825557695773,  // ≈ 6.2079
            18.071063967910923 / 2.404825557695773,  // ≈ 7.5124
            21.21163662987926 / 2.404825557695773,  // ≈ 8.8167
            24.352471530749302 / 2.404825557695773,  // ≈ 10.1211
            27.493479132040254 / 2.404825557695773,  // ≈ 11.4254
            30.634606468431975 / 2.404825557695773,  // ≈ 12.7298
            33.77582021357357 / 2.404825557695773,  // ≈ 14.0340
            36.91709835366401 / 2.404825557695773   // ≈ 15.3384
        ],
        labels: ["1", "5.52/2.40", "8.65/2.40", "11.79/2.40", "14.93/2.40", "18.07/2.40", "21.21/2.40", "24.35/2.40", "27.49/2.40", "30.63/2.40", "33.78/2.40", "36.92/2.40"],
        labelPrecision: 3
    },

    // 4
    {
        name: "4. Gamelan Slendro (Common Approximation)",
        description:
            'A conservative Slendro approximation — Slendro tunings vary widely between ensembles and islands. This is a plausible normalized Slendro-like series (useful as a starting point). See tuning variability and research: <a href="https://eamusic.dartmouth.edu/~larry/misc_writings/out_of_print/slendro_balungan.pdf">Javanese Slendro analyses</a> and a detailed study: <a href="https://www.31edo.com/slendrogamelan.pdf">Stearns — Slendro analysis</a>.',
        // decimals converted to rational approximations where practical
        ratios: [
            1 / 1,
            61 / 50,   // 1.22
            37 / 25,   // 1.48
            44 / 25,   // 1.76
            41 / 20,   // 2.05
            61 / 25,   // 2.44
            74 / 25,   // 2.96
            88 / 25,   // 3.52
            41 / 10,   // 4.10
            122 / 25,  // 4.88
            148 / 25,  // 5.92
            176 / 25   // 7.04
        ],
        labels: ["1/1", "61/50", "37/25", "44/25", "41/20", "61/25", "74/25", "88/25", "41/10", "122/25", "148/25", "176/25"],
        labelPrecision: 2
    },

    // 4b
    {
        name: "4b. Slendro — Adventurous Variant (Exploratory)",
        description:
            'A more adventurous Slendro-inspired variant that shifts a few degrees towards septimal/7-limit alignments (useful for exotic spectral palettes). This is deliberately non-standard; treat it as a creative tuning palette rather than an ethnographic map.',
        ratios: [
            1 / 1,
            8 / 7,
            7 / 5,
            12 / 7,
            9 / 5,
            16 / 7,
            21 / 8,
            7 / 2,
            9 / 2,
            11 / 2,
            13 / 2,
            15 / 2
        ],
        labels: ["1/1", "8/7", "7/5", "12/7", "9/5", "16/7", "21/8", "7/2", "9/2", "11/2", "13/2", "15/2"],
        labelPrecision: 3
    },

    // 5
    {
        name: "5. Gamelan Pelog (Common Approximation)",
        description:
            'A conservative Pelog approximation (Pelog also varies a lot by ensemble). This is a practical Pelog-like set for synthesis; it compresses Pelog’s characteristic unequal steps into a usable spectral array. See overview and sample tunings: <a href="https://tuning.ableton.com/sundanese-gamelan/">Ableton — Gamelan tuning intro</a>.',
        ratios: [
            1 / 1,
            53 / 50,   // 1.06
            5 / 4,     // 1.25
            4 / 3,     // 1.333...
            3 / 2,     // 1.5
            83 / 50,   // 1.66
            89 / 50,   // 1.78
            2 / 1,
            53 / 25,   // 2.12
            5 / 2,
            133 / 50,  // 2.66
            3 / 1
        ],
        labels: ["1/1", "53/50", "5/4", "4/3", "3/2", "83/50", "89/50", "2/1", "53/25", "5/2", "133/50", "3/1"],
        labelPrecision: 2
    },

    // 5b
    {
        name: "5b. Pelog — Adventurous Variant (Exploratory)",
        description:
            'A more adventurous Pelog variant that includes stronger septimal and odd-limit colors — useful when you want Pelog-ish contours but with richer microtonal tension.',
        ratios: [
            1 / 1,
            25 / 24,
            9 / 8,
            6 / 5,
            7 / 6,
            11 / 8,
            9 / 7,
            3 / 2,
            7 / 4,
            8 / 5,
            9 / 5,
            2 / 1
        ],
        labels: ["1/1", "25/24", "9/8", "6/5", "7/6", "11/8", "9/7", "3/2", "7/4", "8/5", "9/5", "2/1"],
        labelPrecision: 3
    },

    // 6
    {
        name: "6. Bohlen–Pierce (13-EDT of the Tritave)",
        description:
            'Equal-tempered Bohlen–Pierce: 13 equal divisions of the tritave (3:1) — the most common practical realization of BP. Each step = 3^(1/13) above the previous. Useful when you want the distinctive BP non-octave (tritave) periodicity. See the Bohlen–Pierce overview: <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale">Bohlen–Pierce (Wikipedia)</a>.',
        // 13-EDT entries; note natural length is 13 steps per tritave; here we list the first 13 (including 1)
        ratios: [
            1 / 1,
            Math.pow(3, 1 / 13),
            Math.pow(3, 2 / 13),
            Math.pow(3, 3 / 13),
            Math.pow(3, 4 / 13),
            Math.pow(3, 5 / 13),
            Math.pow(3, 6 / 13),
            Math.pow(3, 7 / 13),
            Math.pow(3, 8 / 13),
            Math.pow(3, 9 / 13),
            Math.pow(3, 10 / 13),
            Math.pow(3, 11 / 13),
            Math.pow(3, 12 / 13)
        ],
        labels: ["1/1", "3^(1/13)", "3^(2/13)", "3^(3/13)", "3^(4/13)", "3^(5/13)", "3^(6/13)", "3^(7/13)", "3^(8/13)", "3^(9/13)", "3^(10/13)", "3^(11/13)"],
        labelPrecision: 4
    },

    // 6b
    {
        name: "6b. Bohlen–Pierce (Representative Just Intonation set)",
        description:
            'A commonly-cited Bohlen–Pierce just-intonation palette assembled from small-ratio JI intervals historically associated with BP discussions (normalized to 1). This is an illustrative JI BP set — there are multiple JI realizations in the literature. See the JI vs. ET BP table: <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale#Intervals_and_scale_diagrams">BP intervals (Wikipedia)</a>.',
        ratios: [
            1 / 1,
            27 / 25,
            25 / 21,
            9 / 7,
            7 / 5,
            75 / 49,
            5 / 3,
            9 / 5,
            49 / 25,
            15 / 7,
            7 / 3,
            63 / 25
        ],
        labels: ["1/1", "27/25", "25/21", "9/7", "7/5", "75/49", "5/3", "9/5", "49/25", "15/7", "7/3", "63/25"],
        labelPrecision: 3
    },

    // 7
    {
        name: "7. Standardized Lydian Root Set (Just-intonation oriented)",
        description:
            'A compact, standardized Lydian root set expressed in just-intonation ratios. This keeps the Lydian #4 character while using small-integer ratios for musical stability — useful when you want a Lydian-centered just palette (informed by George Russellʼs idea of the Lydian center; see the Lydian Chromatic Concept: <a href="https://georgerussell.com/lydian-chromatic-concept">George Russell — Lydian Chromatic Concept</a>).',
        ratios: [
            1 / 1,
            9 / 8,
            5 / 4,
            45 / 32,
            3 / 2,
            8 / 5,
            15 / 8,
            2 / 1,
            9 / 4,
            5 / 2,
            15 / 4,
            4 / 1
        ],
        labels: ["1/1", "9/8", "5/4", "45/32", "3/2", "8/5", "15/8", "2/1", "9/4", "5/2", "15/4", "4/1"],
        labelPrecision: 3
    },

    // 8
    {
        name: "8. Fractional Series (n/4 Multiples)",
        description:
            'A deliberately inharmonic fractional series using n/4 multipliers (1, 1.25, 1.5, ...). Very metallic and clanging — excellent for bell-like additive synthesis with strong inharmonic beating.',
        ratios: [1 / 1, 5 / 4, 3 / 2, 7 / 4, 2 / 1, 9 / 4, 5 / 2, 11 / 4, 3 / 1, 13 / 4, 7 / 2, 15 / 4],
        labels: ["1/1", "5/4", "3/2", "7/4", "2/1", "9/4", "5/2", "11/4", "3/1", "13/4", "7/2", "15/4"],
        labelPrecision: 2
    },

    // Harry Partch sets
    {
        name: "HP-A. Harry Partch — 43-Tone Scale (overview subset)",
        description:
            'Harry Partchʼs 43-tone scale (per octave) is a systematic 11-limit-based just-intonation framework Partch used for much of his instrument design and composition. This entry provides a practical 12-value subset sampled from Partch\'s larger lattice. See: <a href="https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale">Harry Partchʼs 43-tone scale (Wikipedia)</a>.',
        ratios: [
            1 / 1,
            12 / 11,
            11 / 10,
            10 / 9,
            9 / 8,
            8 / 7,
            7 / 6,
            6 / 5,
            11 / 9,
            5 / 4,
            14 / 11,
            9 / 7
        ],
        labels: ["1/1", "12/11", "11/10", "10/9", "9/8", "8/7", "7/6", "6/5", "11/9", "5/4", "14/11", "9/7"],
        labelPrecision: 4
    },

    {
        name: "HP-B. Harry Partch — 11-Limit Tonality Diamond (subset)",
        description:
            'A focused 11-limit tonality diamond subset (useful Partchian palette). This selection expresses Partchʼs hierarchy of consonance-to-dissonance in small integer ratios; use as a microtonal palette or for Partch-inspired composition. Reference: <a href="https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale">Partch — 43-tone & 11-limit ideas</a>.',
        ratios: [
            1 / 1,
            16 / 15,
            9 / 8,
            6 / 5,
            5 / 4,
            4 / 3,
            7 / 5,
            3 / 2,
            8 / 5,
            5 / 3,
            9 / 5,
            2 / 1
        ],
        labels: ["1/1", "16/15", "9/8", "6/5", "5/4", "4/3", "7/5", "3/2", "8/5", "5/3", "9/5", "2/1"],
        labelPrecision: 4
    },

    {
        name: "HP-C. Harry Partch — Practical Instrument Subset (for keyboard/percussion)",
        description:
            "A small practical subset inspired by the subsets Partch used on instruments (Chromelodeon, Adapted Guitar, etc.) — chosen for playability while retaining Partch's just-intonation character. See Partch instrument descriptions: <a href='https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale'>Partch overview</a>.",
        ratios: [1 / 1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8, 2 / 1, 9 / 4],
        labels: ["1/1", "9/8", "6/5", "5/4", "4/3", "3/2", "8/5", "5/3", "9/5", "15/8", "2/1", "9/4"],
        labelPrecision: 4
    },


    {
        name: "OD-1. Hammond — Standard 9-drawbar (Manual) (Drawbars / Stops)",
        description:
            "Canonical Hammond single-manual drawbar mapping (left→right): 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1' — each represents a harmonic/aliquot of the fundamental. These are the classic additive palette used on B-3 / tonewheel organs. See Hammond drawbar docs for details.",
        // natural count: 9 drawbars. Ratios expressed as small-integer fractions.
        ratios: [1 / 2, 3 / 2, 1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 8 / 1],
        labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
        labelPrecision: 3,
        notes:
            "Hammond drawbars intentionally sample selected harmonics (sub-octave through high partials); the 7th harmonic is omitted in the classic tonewheel mapping."
    },

    {
        name: "OD-1b. Hammond — Archaic / Mechanical Variant (Detuned Drawbars)",
        description:
            "Same drawbar targets as the standard Hammond set, but each partial includes a small progressive detune to model mechanical imperfections and tonewheel wear — useful to emulate slow beating and organic instability.",
        // 9 ratios with small multiplicative detune factors; expressed as explicit math expressions
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
        labels: [
            "1/2*1.00",
            "3/2*1.00",
            "1/1*1.00",
            "2/1*1.00",
            "3/1*0.99",
            "4/1*1.00",
            "5/1*1.00",
            "6/1*1.00",
            "8/1*1.00"
        ],
        labelPrecision: 5,
        notes:
            "Detune multipliers expressed as small fractional offsets (e.g. 8/10000 ≈ 0.8‰). These are artistic suggestions — increase offsets for stronger beating."
    },

    {
        name: "OD-2. Pipe Organ — Principal / Foundation Chorus (Stops)",
        description:
            "Common principal stops (footages) used in organ choruses: 16', 8', 4', 2', 1' — octave-power ranks; each rank doubles/halves frequency by powers of two. Good base palette for a church/archaic organ sound.",
        ratios: [1 / 2, 1 / 1, 2 / 1, 4 / 1, 8 / 1],
        labels: ["1/2", "1/1", "2/1", "4/1", "8/1"],
        labelPrecision: 3,
        notes:
            "These are octave-related ranks (powers of two). Combine with mixture/mutation stops to build classic organ choruses."
    },

    {
        name: "OD-3. Baroque Cornet / Mixture — Mutation (Aliquot) Stops",
        description:
            "Typical cornet/mixture elements: mutation stops that speak at non-octave partials (3rd, 5th, 6th, etc.). Mutations color the principal chorus and are essential to many historical organ timbres.",
        ratios: [3 / 1, 5 / 1, 6 / 1, 3 / 1, 8 / 1],
        labels: [
            "3/1 Naz",   // Nazard
            "5/1 Tie",   // Tierce
            "6/1 Lar",   // Larigot
            "3/1 Naz",
            "8/1 Mix"    // upper mixture harmonic
        ],
        labelPrecision: 3,
        notes:
            "Mixtures vary by builder; the labels give common mutation names (Nazard, Tierce, Larigot). Mix design determines exact harmonic set."
    },

]; // end export


// ================================
// CONSTANTS
// ================================

export const MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const DEFAULT_FUNDAMENTAL = 130.81; // C3
export const DEFAULT_MIDI_NOTE = 48; // MIDI for C3
export const DEFAULT_OCTAVE = 3;
export const BASE_OCTAVE_MIDI = 48; // MIDI for C3

export const WAVETABLE_SIZE = 4096; // Standard size for a PeriodicWave table
export const NUM_HARMONICS = 12;
export const DEFAULT_MASTER_GAIN = 0.3;
export const DEFAULT_MASTER_SLEW = 0.01; // seconds

// Visualization constants
export const VISUAL_HARMONIC_TERMS = 12;
export const CANVAS_HEIGHT_RATIOS = {
    RADIAL: 0.75,
    OSCILLOSCOPE: 0.25
};

export const HARMONIC_COLORS = [
    '#10b981', '#fcd34d', '#3b82f6', '#ef4444',
    '#a855f7', '#f97316', '#22c55e', '#ec4899',
    '#84cc16', '#eab308', '#7c3aed', '#6d28d9'
];

export const DRAWBAR_STYLES = [
    'white', 'brown', 'white', 'white', 'brown', 'black',
    'brown', 'white', 'black', 'blue', 'red', 'black',
    'white', 'brown', 'black', 'blue'
];

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

    // Spectral properties
    currentSystem: spectralSystems[0],
    harmonicAmplitudes: (() => {
        const amplitudes = Array(NUM_HARMONICS).fill(0.0);
        amplitudes[0] = 1.0; // Fundamental enabled by default
        return amplitudes;
    })(),
    isSubharmonic: false,
    currentWaveform: 'sine',

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
    blWaveforms: {}, // Band-limited waveforms

    // P5 instance reference
    p5Instance: null
};

// ================================
// STATE MANAGEMENT
// ================================

export function updateAppState(updates) {
    Object.assign(AppState, updates);
}

export function resetHarmonicAmplitudes() {
    AppState.harmonicAmplitudes.fill(0.0);
    AppState.harmonicAmplitudes[0] = 1.0;
}

export function getCurrentSystem() {
    return AppState.currentSystem;
}

export function setCurrentSystem(systemIndex) {
    AppState.currentSystem = spectralSystems[systemIndex];
}

export function getHarmonicAmplitude(index) {
    return AppState.harmonicAmplitudes[index] || 0;
}

export function setHarmonicAmplitude(index, amplitude) {
    if (index >= 0 && index < AppState.harmonicAmplitudes.length) {
        AppState.harmonicAmplitudes[index] = amplitude;
    }
}