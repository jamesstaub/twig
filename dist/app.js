var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// js/config.js
var config_exports = {};
__export(config_exports, {
  AppState: () => AppState,
  BASE_OCTAVE_MIDI: () => BASE_OCTAVE_MIDI,
  CANVAS_HEIGHT_RATIOS: () => CANVAS_HEIGHT_RATIOS,
  DEFAULT_FUNDAMENTAL: () => DEFAULT_FUNDAMENTAL,
  DEFAULT_MASTER_GAIN: () => DEFAULT_MASTER_GAIN,
  DEFAULT_MASTER_SLEW: () => DEFAULT_MASTER_SLEW,
  DEFAULT_MIDI_NOTE: () => DEFAULT_MIDI_NOTE,
  DEFAULT_OCTAVE: () => DEFAULT_OCTAVE,
  DRAWBAR_STYLES: () => DRAWBAR_STYLES,
  HARMONIC_COLORS: () => HARMONIC_COLORS,
  MIDI_NOTE_NAMES: () => MIDI_NOTE_NAMES,
  NUM_HARMONICS: () => NUM_HARMONICS,
  VISUAL_HARMONIC_TERMS: () => VISUAL_HARMONIC_TERMS,
  WAVETABLE_SIZE: () => WAVETABLE_SIZE,
  getCurrentSystem: () => getCurrentSystem,
  getHarmonicAmplitude: () => getHarmonicAmplitude,
  resetHarmonicAmplitudes: () => resetHarmonicAmplitudes,
  setCurrentSystem: () => setCurrentSystem,
  setHarmonicAmplitude: () => setHarmonicAmplitude,
  spectralSystems: () => spectralSystems,
  updateAppState: () => updateAppState
});
function updateAppState(updates) {
  Object.assign(AppState, updates);
}
function resetHarmonicAmplitudes() {
  AppState.harmonicAmplitudes.fill(0);
  AppState.harmonicAmplitudes[0] = 1;
}
function getCurrentSystem() {
  return AppState.currentSystem;
}
function setCurrentSystem(systemIndex) {
  AppState.currentSystem = spectralSystems[systemIndex];
}
function getHarmonicAmplitude(index) {
  return AppState.harmonicAmplitudes[index] || 0;
}
function setHarmonicAmplitude(index, amplitude) {
  if (index >= 0 && index < AppState.harmonicAmplitudes.length) {
    AppState.harmonicAmplitudes[index] = amplitude;
  }
}
var spectralSystems, MIDI_NOTE_NAMES, DEFAULT_FUNDAMENTAL, DEFAULT_MIDI_NOTE, DEFAULT_OCTAVE, BASE_OCTAVE_MIDI, WAVETABLE_SIZE, NUM_HARMONICS, DEFAULT_MASTER_GAIN, DEFAULT_MASTER_SLEW, VISUAL_HARMONIC_TERMS, CANVAS_HEIGHT_RATIOS, HARMONIC_COLORS, DRAWBAR_STYLES, AppState;
var init_config = __esm({
  "js/config.js"() {
    spectralSystems = [
      // 1
      {
        name: "1. Harmonic Overtone Series (Integer)",
        description: 'Classic harmonic series (exact integer partials). Use for natural, consonant spectra (e.g. voiced instruments, organ-like timbres). See the harmonic-series background: <a href="https://en.wikipedia.org/wiki/Harmonic_series_(music)">Wikipedia \u2014 Harmonic series</a>.',
        // exact integer partials expressed as math
        ratios: [1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 7 / 1, 8 / 1, 9 / 1, 10 / 1, 11 / 1, 12 / 1],
        labels: ["1:1", "2:1", "3:1", "4:1", "5:1", "6:1", "7:1", "8:1", "9:1", "10:1", "11:1", "12:1"],
        labelPrecision: 1
      },
      // 2
      {
        name: "2. Spectral Progressive Detuned Harmonics (Microtonal)",
        description: "Progressive microtonal detuning of the integer harmonic series. Detuning increases with partial index to produce time-varying beating and spectral shimmer (useful for spectral / ambient textures). This is an intentional synthesis choice rather than a canonical acoustic law.",
        // progressive detune with explicit fractional offsets
        ratios: [
          1 / 1,
          2 + 1 / 100,
          // 2 + 0.01
          3 + 2 / 100,
          // 3.02
          4 + 3 / 100,
          // 4.03
          5 + 4 / 100,
          // 5.04
          6 + 5 / 100,
          // 6.05
          7 + 6 / 100,
          // 7.06
          8 + 8 / 100,
          // 8.08
          9 + 10 / 100,
          // 9.10
          10 + 12 / 100,
          // 10.12
          11 + 14 / 100,
          // 11.14
          12 + 16 / 100
          // 12.16
        ],
        labels: ["1/1", "201/100", "151/50", "403/100", "126/25", "121/20", "353/50", "202/25", "91/10", "253/25", "557/50", "304/25"],
        labelPrecision: 2
      },
      // 3
      {
        name: "3. Inharmonic Membrane / Plate Modes (Bessel-root based)",
        description: 'Modal ratios derived from the first zeros of Bessel-type modal functions \u2014 a physically informed inharmonic series used to synthesize metallic / bell / plate timbres. This is a simplified circular-membrane / plate approximation (modal zeros of Bessel functions scale the modal frequencies). For background, see the math of Bessel roots and plate/modal modeling: <a href="https://en.wikipedia.org/wiki/Bessel_function">Bessel functions</a> and a modal-plate overview: <a href="https://courses.cs.washington.edu/courses/cse481i/20wi/pdfs/G-waveguides.pdf">modal plate notes (UW)</a>.',
        // first several J0 zeros used as numeric literals; ratios normalized to first root
        ratios: [
          1 / 1,
          5.520078110286311 / 2.404825557695773,
          // ≈ 2.2949
          8.653727912911013 / 2.404825557695773,
          // ≈ 3.5994
          11.791534439014281 / 2.404825557695773,
          // ≈ 4.9037
          14.930917708487787 / 2.404825557695773,
          // ≈ 6.2079
          18.071063967910924 / 2.404825557695773,
          // ≈ 7.5124
          21.21163662987926 / 2.404825557695773,
          // ≈ 8.8167
          24.352471530749302 / 2.404825557695773,
          // ≈ 10.1211
          27.493479132040253 / 2.404825557695773,
          // ≈ 11.4254
          30.634606468431976 / 2.404825557695773,
          // ≈ 12.7298
          33.77582021357357 / 2.404825557695773,
          // ≈ 14.0340
          36.91709835366401 / 2.404825557695773
          // ≈ 15.3384
        ],
        labels: ["1", "5.52/2.40", "8.65/2.40", "11.79/2.40", "14.93/2.40", "18.07/2.40", "21.21/2.40", "24.35/2.40", "27.49/2.40", "30.63/2.40", "33.78/2.40", "36.92/2.40"],
        labelPrecision: 3
      },
      // 4
      {
        name: "4. Gamelan Slendro (Common Approximation)",
        description: 'A conservative Slendro approximation \u2014 Slendro tunings vary widely between ensembles and islands. This is a plausible normalized Slendro-like series (useful as a starting point). See tuning variability and research: <a href="https://eamusic.dartmouth.edu/~larry/misc_writings/out_of_print/slendro_balungan.pdf">Javanese Slendro analyses</a> and a detailed study: <a href="https://www.31edo.com/slendrogamelan.pdf">Stearns \u2014 Slendro analysis</a>.',
        // decimals converted to rational approximations where practical
        ratios: [
          1 / 1,
          61 / 50,
          // 1.22
          37 / 25,
          // 1.48
          44 / 25,
          // 1.76
          41 / 20,
          // 2.05
          61 / 25,
          // 2.44
          74 / 25,
          // 2.96
          88 / 25,
          // 3.52
          41 / 10,
          // 4.10
          122 / 25,
          // 4.88
          148 / 25,
          // 5.92
          176 / 25
          // 7.04
        ],
        labels: ["1/1", "61/50", "37/25", "44/25", "41/20", "61/25", "74/25", "88/25", "41/10", "122/25", "148/25", "176/25"],
        labelPrecision: 2
      },
      // 4b
      {
        name: "4b. Slendro \u2014 Adventurous Variant (Exploratory)",
        description: "A more adventurous Slendro-inspired variant that shifts a few degrees towards septimal/7-limit alignments (useful for exotic spectral palettes). This is deliberately non-standard; treat it as a creative tuning palette rather than an ethnographic map.",
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
        description: 'A conservative Pelog approximation (Pelog also varies a lot by ensemble). This is a practical Pelog-like set for synthesis; it compresses Pelog\u2019s characteristic unequal steps into a usable spectral array. See overview and sample tunings: <a href="https://tuning.ableton.com/sundanese-gamelan/">Ableton \u2014 Gamelan tuning intro</a>.',
        ratios: [
          1 / 1,
          53 / 50,
          // 1.06
          5 / 4,
          // 1.25
          4 / 3,
          // 1.333...
          3 / 2,
          // 1.5
          83 / 50,
          // 1.66
          89 / 50,
          // 1.78
          2 / 1,
          53 / 25,
          // 2.12
          5 / 2,
          133 / 50,
          // 2.66
          3 / 1
        ],
        labels: ["1/1", "53/50", "5/4", "4/3", "3/2", "83/50", "89/50", "2/1", "53/25", "5/2", "133/50", "3/1"],
        labelPrecision: 2
      },
      // 5b
      {
        name: "5b. Pelog \u2014 Adventurous Variant (Exploratory)",
        description: "A more adventurous Pelog variant that includes stronger septimal and odd-limit colors \u2014 useful when you want Pelog-ish contours but with richer microtonal tension.",
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
        name: "6. Bohlen\u2013Pierce (13-EDT of the Tritave)",
        description: 'Equal-tempered Bohlen\u2013Pierce: 13 equal divisions of the tritave (3:1) \u2014 the most common practical realization of BP. Each step = 3^(1/13) above the previous. Useful when you want the distinctive BP non-octave (tritave) periodicity. See the Bohlen\u2013Pierce overview: <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale">Bohlen\u2013Pierce (Wikipedia)</a>.',
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
        name: "6b. Bohlen\u2013Pierce (Representative Just Intonation set)",
        description: 'A commonly-cited Bohlen\u2013Pierce just-intonation palette assembled from small-ratio JI intervals historically associated with BP discussions (normalized to 1). This is an illustrative JI BP set \u2014 there are multiple JI realizations in the literature. See the JI vs. ET BP table: <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale#Intervals_and_scale_diagrams">BP intervals (Wikipedia)</a>.',
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
        description: 'A compact, standardized Lydian root set expressed in just-intonation ratios. This keeps the Lydian #4 character while using small-integer ratios for musical stability \u2014 useful when you want a Lydian-centered just palette (informed by George Russell\u02BCs idea of the Lydian center; see the Lydian Chromatic Concept: <a href="https://georgerussell.com/lydian-chromatic-concept">George Russell \u2014 Lydian Chromatic Concept</a>).',
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
        description: "A deliberately inharmonic fractional series using n/4 multipliers (1, 1.25, 1.5, ...). Very metallic and clanging \u2014 excellent for bell-like additive synthesis with strong inharmonic beating.",
        ratios: [1 / 1, 5 / 4, 3 / 2, 7 / 4, 2 / 1, 9 / 4, 5 / 2, 11 / 4, 3 / 1, 13 / 4, 7 / 2, 15 / 4],
        labels: ["1/1", "5/4", "3/2", "7/4", "2/1", "9/4", "5/2", "11/4", "3/1", "13/4", "7/2", "15/4"],
        labelPrecision: 2
      },
      // Harry Partch sets
      {
        name: "HP-A. Harry Partch \u2014 43-Tone Scale (overview subset)",
        description: `Harry Partch\u02BCs 43-tone scale (per octave) is a systematic 11-limit-based just-intonation framework Partch used for much of his instrument design and composition. This entry provides a practical 12-value subset sampled from Partch's larger lattice. See: <a href="https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale">Harry Partch\u02BCs 43-tone scale (Wikipedia)</a>.`,
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
        name: "HP-B. Harry Partch \u2014 11-Limit Tonality Diamond (subset)",
        description: 'A focused 11-limit tonality diamond subset (useful Partchian palette). This selection expresses Partch\u02BCs hierarchy of consonance-to-dissonance in small integer ratios; use as a microtonal palette or for Partch-inspired composition. Reference: <a href="https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale">Partch \u2014 43-tone & 11-limit ideas</a>.',
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
        name: "HP-C. Harry Partch \u2014 Practical Instrument Subset (for keyboard/percussion)",
        description: "A small practical subset inspired by the subsets Partch used on instruments (Chromelodeon, Adapted Guitar, etc.) \u2014 chosen for playability while retaining Partch's just-intonation character. See Partch instrument descriptions: <a href='https://en.wikipedia.org/wiki/Harry_Partch%27s_43-tone_scale'>Partch overview</a>.",
        ratios: [1 / 1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8, 2 / 1, 9 / 4],
        labels: ["1/1", "9/8", "6/5", "5/4", "4/3", "3/2", "8/5", "5/3", "9/5", "15/8", "2/1", "9/4"],
        labelPrecision: 4
      },
      {
        name: "OD-1. Hammond \u2014 Standard 9-drawbar (Manual) (Drawbars / Stops)",
        description: "Canonical Hammond single-manual drawbar mapping (left\u2192right): 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1' \u2014 each represents a harmonic/aliquot of the fundamental. These are the classic additive palette used on B-3 / tonewheel organs. See Hammond drawbar docs for details.",
        // natural count: 9 drawbars. Ratios expressed as small-integer fractions.
        ratios: [1 / 2, 3 / 2, 1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 8 / 1],
        labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
        labelPrecision: 3,
        notes: "Hammond drawbars intentionally sample selected harmonics (sub-octave through high partials); the 7th harmonic is omitted in the classic tonewheel mapping."
      },
      {
        name: "OD-1b. Hammond \u2014 Archaic / Mechanical Variant (Detuned Drawbars)",
        description: "Same drawbar targets as the standard Hammond set, but each partial includes a small progressive detune to model mechanical imperfections and tonewheel wear \u2014 useful to emulate slow beating and organic instability.",
        // 9 ratios with small multiplicative detune factors; expressed as explicit math expressions
        ratios: [
          1 / 2 * (1 + 0 / 1e3),
          3 / 2 * (1 + 8 / 1e4),
          1 / 1 * (1 + 3 / 1e4),
          2 / 1 * (1 + 6 / 1e4),
          3 / 1 * (1 - 7 / 1e4),
          4 / 1 * (1 + 10 / 1e4),
          5 / 1 * (1 + 15 / 1e4),
          6 / 1 * (1 - 5 / 1e4),
          8 / 1 * (1 + 20 / 1e4)
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
        notes: "Detune multipliers expressed as small fractional offsets (e.g. 8/10000 \u2248 0.8\u2030). These are artistic suggestions \u2014 increase offsets for stronger beating."
      },
      {
        name: "OD-2. Pipe Organ \u2014 Principal / Foundation Chorus (Stops)",
        description: "Common principal stops (footages) used in organ choruses: 16', 8', 4', 2', 1' \u2014 octave-power ranks; each rank doubles/halves frequency by powers of two. Good base palette for a church/archaic organ sound.",
        ratios: [1 / 2, 1 / 1, 2 / 1, 4 / 1, 8 / 1],
        labels: ["1/2", "1/1", "2/1", "4/1", "8/1"],
        labelPrecision: 3,
        notes: "These are octave-related ranks (powers of two). Combine with mixture/mutation stops to build classic organ choruses."
      },
      {
        name: "OD-3. Baroque Cornet / Mixture \u2014 Mutation (Aliquot) Stops",
        description: "Typical cornet/mixture elements: mutation stops that speak at non-octave partials (3rd, 5th, 6th, etc.). Mutations color the principal chorus and are essential to many historical organ timbres.",
        ratios: [3 / 1, 5 / 1, 6 / 1, 3 / 1, 8 / 1],
        labels: [
          "3/1 Naz",
          // Nazard
          "5/1 Tie",
          // Tierce
          "6/1 Lar",
          // Larigot
          "3/1 Naz",
          "8/1 Mix"
          // upper mixture harmonic
        ],
        labelPrecision: 3,
        notes: "Mixtures vary by builder; the labels give common mutation names (Nazard, Tierce, Larigot). Mix design determines exact harmonic set."
      }
    ];
    MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    DEFAULT_FUNDAMENTAL = 130.81;
    DEFAULT_MIDI_NOTE = 48;
    DEFAULT_OCTAVE = 3;
    BASE_OCTAVE_MIDI = 48;
    WAVETABLE_SIZE = 4096;
    NUM_HARMONICS = 12;
    DEFAULT_MASTER_GAIN = 0.3;
    DEFAULT_MASTER_SLEW = 0.01;
    VISUAL_HARMONIC_TERMS = 12;
    CANVAS_HEIGHT_RATIOS = {
      RADIAL: 0.75,
      OSCILLOSCOPE: 0.25
    };
    HARMONIC_COLORS = [
      "#10b981",
      "#fcd34d",
      "#3b82f6",
      "#ef4444",
      "#a855f7",
      "#f97316",
      "#22c55e",
      "#ec4899",
      "#84cc16",
      "#eab308",
      "#7c3aed",
      "#6d28d9"
    ];
    DRAWBAR_STYLES = [
      "white",
      "brown",
      "white",
      "white",
      "brown",
      "black",
      "brown",
      "white",
      "black",
      "blue",
      "red",
      "black",
      "white",
      "brown",
      "black",
      "blue"
    ];
    AppState = {
      // Routing mode for audio export
      audioRoutingMode: "mono",
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
        const amplitudes = Array(NUM_HARMONICS).fill(0);
        amplitudes[0] = 1;
        return amplitudes;
      })(),
      isSubharmonic: false,
      currentWaveform: "sine",
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
      blWaveforms: {},
      // Band-limited waveforms
      // P5 instance reference
      p5Instance: null
    };
  }
});

// js/momentum-smoother.js
var MomentumSmoother, momentumSmoother;
var init_momentum_smoother = __esm({
  "js/momentum-smoother.js"() {
    MomentumSmoother = class {
      constructor() {
        this.params = /* @__PURE__ */ new Map();
        this.isRunning = false;
        this.frame = null;
        this.dt = 1 / 60;
      }
      /**
       * Debounce utility for handling rapid-fire external events (e.g. MIDI)
       * @param {string} key - Unique debounce key
       * @param {number} delay - Time in ms to wait after last call
       * @param {Function} fn - Function to invoke when stable
       */
      debounce(key, delay, fn) {
        if (!this._debouncers) this._debouncers = /* @__PURE__ */ new Map();
        if (this._debouncers.has(key)) {
          clearTimeout(this._debouncers.get(key));
        }
        const t = setTimeout(() => {
          this._debouncers.delete(key);
          fn();
        }, delay);
        this._debouncers.set(key, t);
      }
      /**
       * Create/update a smoother target.
       * IMPORTANT: callback is only set on creation — never overwritten.
       */
      smoothTo(key, value, callback, smoothness = 0.75) {
        let p = this.params.get(key);
        if (!p) {
          p = {
            current: value,
            target: value,
            pendingTarget: null,
            // coalesces multiple updates
            callback,
            smoothness: Math.min(Math.max(smoothness, 0.01), 0.99999),
            active: true
          };
          this.params.set(key, p);
        } else {
          p.pendingTarget = value;
          p.smoothness = Math.min(Math.max(smoothness, 0.01), 0.99999);
          p.active = true;
        }
        if (!this.isRunning) this.start();
      }
      /**
       * Immediate hard-set, bypassing smoothing.
       */
      setImmediate(key, value) {
        const p = this.params.get(key);
        if (!p) return;
        p.current = value;
        p.target = value;
        p.pendingTarget = null;
        p.active = false;
        p.callback(value);
      }
      start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.tick();
      }
      tick() {
        let activeCount = 0;
        for (const [key, p] of this.params) {
          if (p.pendingTarget !== null) {
            p.target = p.pendingTarget;
            p.pendingTarget = null;
          }
          if (!p.active) continue;
          const diff = p.target - p.current;
          if (Math.abs(diff) < 1e-5) {
            p.current = p.target;
            p.callback(p.current);
            p.active = false;
            continue;
          }
          const s = p.smoothness;
          const smoothingFactor = Math.pow(s, this.dt * 60);
          p.current = p.current * smoothingFactor + p.target * (1 - smoothingFactor);
          p.callback(p.current);
          activeCount++;
        }
        if (activeCount > 0) {
          this.frame = requestAnimationFrame(() => this.tick());
        } else {
          this.isRunning = false;
          this.frame = null;
        }
      }
      remove(key) {
        this.params.delete(key);
      }
      clear() {
        this.params.clear();
        if (this.frame) cancelAnimationFrame(this.frame);
        this.isRunning = false;
        this.frame = null;
      }
      getCurrentValue(key) {
        const p = this.params.get(key);
        return p ? p.current : null;
      }
    };
    momentumSmoother = new MomentumSmoother();
  }
});

// js/domUtils.js
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`Element with id '${id}' not found`);
  return el;
}
function updateText(id, text, html = false) {
  const el = getElement(id);
  if (el) {
    if (html) {
      el.innerHTML = text;
    } else {
      el.textContent = text;
    }
  }
}
function updateValue(id, value) {
  const el = getElement(id);
  if (el) el.value = value;
}
function setupEventListener(id, event, handler) {
  const el = getElement(id);
  if (el) el.addEventListener(event, handler);
}
function showStatus(message, type = "info") {
  const statusBox = getElement("status-message");
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.classList.remove("hidden", "error", "success", "warning", "info");
  statusBox.classList.add(type);
  setTimeout(() => {
    statusBox.classList.add("hidden");
  }, 4e3);
}
var init_domUtils = __esm({
  "js/domUtils.js"() {
  }
});

// js/modules/base/BaseComponent.js
var BaseComponent;
var init_BaseComponent = __esm({
  "js/modules/base/BaseComponent.js"() {
    BaseComponent = class {
      /**
          * @param {HTMLElement|string} target - Element or query selector.
          */
      constructor(target) {
        if (typeof target === "string") {
          this.el = document.querySelector(target);
          this.selector = target;
        } else {
          this.el = target;
        }
        if (!this.el) {
          throw new Error(`BaseComponent: Target element "${target}" not found.`);
        }
        this._boundEvents = [];
      }
      /**
       * Bind an event handler and automatically track it for cleanup.
       * @param {HTMLElement} el
       * @param {string} evt
       * @param {Function} handler
       */
      bindEvent(el, evt, handler) {
        if (!el) return;
        el.addEventListener(evt, handler);
        this._boundEvents.push({ el, evt, handler });
      }
      /**
       * Remove all events previously bound via bindEvent().
       */
      unbindAll() {
        for (const { el, evt, handler } of this._boundEvents) {
          el.removeEventListener(evt, handler);
        }
        this._boundEvents.length = 0;
      }
      /**
       * Called automatically before every render and when a controller tears
       * down a component. Subclasses can override for additional cleanup.
       */
      teardown() {
        this.unbindAll();
      }
      /**
       * Optional helper to update text or HTML content.
       * @param {HTMLElement} el
       * @param {string} content
       * @param {object} options
       * @param {boolean} options.asHTML
       */
      updateContent(el, content = "", { asHTML = false } = {}) {
        if (!el) return;
        if (asHTML) el.innerHTML = content;
        else el.textContent = content;
      }
      /**
       * Subclasses MUST implement:
       *    render(props)
       *
       * Should update DOM inside this.el. Call teardown() before rewriting DOM
       * if render() replaces or regenerates child elements.
       *
       * Subclasses MAY optionally implement:
       *    bindRenderedEvents()
       *    teardown()
       */
      render(_props) {
        throw new Error("render() must be implemented in subclass");
      }
      /**
       * q(selector)
       * -----------------------------------------------------------------------------
       * Convenience wrapper for querySelector(), scoped to this component's root.
       *
       * @param {string} selector  CSS selector
       * @return {Element|null}
       */
      q(selector) {
        return this.el.querySelector(selector);
      }
      /**
       * qAll(selector)
       * -----------------------------------------------------------------------------
       * querySelectorAll(), returned as a normal Array instead of a NodeList.
       *
       * @param {string} selector  CSS selector
       * @return {Array<Element>}
       */
      qAll(selector) {
        return Array.from(this.el.querySelectorAll(selector));
      }
    };
  }
});

// js/modules/drawbars/DrawbarsComponent.js
var DRAWBAR_SLIDER_SELECTOR, DrawbarsComponent;
var init_DrawbarsComponent = __esm({
  "js/modules/drawbars/DrawbarsComponent.js"() {
    init_config();
    init_BaseComponent();
    DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";
    DrawbarsComponent = class extends BaseComponent {
      constructor(elementId) {
        super(elementId);
        this.sliders = [];
      }
      render(props = {}) {
        this.el.innerHTML = "";
        this.sliders = [];
        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
      }
      /**
       * Called by BaseComponent AFTER render().
       */
      bindRenderedEvents() {
        this.sliders = this.qAll(DRAWBAR_SLIDER_SELECTOR);
        this.sliders.forEach((slider) => {
          this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));
        });
      }
      setupDrawbars() {
        const numPartials = AppState.currentSystem.ratios.length;
        if (!Array.isArray(AppState.harmonicAmplitudes) || AppState.harmonicAmplitudes.length !== numPartials) {
          AppState.harmonicAmplitudes = Array(numPartials).fill(0);
          AppState.harmonicAmplitudes[0] = 1;
        }
        for (let i = 0; i < numPartials; i++) {
          const value = AppState.harmonicAmplitudes[i];
          this.el.appendChild(this.createDrawbar(i, value));
        }
      }
      updateDrawbarLabels(isSubharmonic) {
        const labels = isSubharmonic && AppState.currentSystem.subharmonicLabels ? AppState.currentSystem.subharmonicLabels : AppState.currentSystem.labels;
        labels.forEach((txt, idx) => {
          const el = this.q(`#drawbar-label-${idx}`);
          this.updateContent(el, txt);
        });
      }
      createDrawbar(index, value) {
        const styleClass = DRAWBAR_STYLES[index] || "white";
        const wrapper = document.createElement("div");
        wrapper.className = `drawbar ${styleClass}`;
        const label = document.createElement("span");
        label.className = "drawbar-label";
        label.id = `drawbar-label-${index}`;
        this.updateContent(label, AppState.currentSystem.labels[index] || "");
        const track = document.createElement("div");
        track.className = "drawbar-track";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "drawbar-slider";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.01";
        slider.value = value;
        slider.dataset.index = index;
        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);
        wrapper.append(label, wrap);
        return wrapper;
      }
      updateSingleDrawbar(index, value) {
        if (this.sliders[index]) {
          this.sliders[index].value = value;
        }
      }
      handleDrawbarChange(e) {
        const index = Number(e.target.dataset.index);
        const value = Number(e.target.value);
        this.onChange?.(index, value);
        e.target.setAttribute("aria-valuenow", value);
      }
      setValue(index, value) {
        if (this.sliders[index]) {
          this.sliders[index].value = value;
        }
      }
    };
  }
});

// js/dsp/DFT.js
var DFT;
var init_DFT = __esm({
  "js/dsp/DFT.js"() {
    DFT = class {
      /**
       * Performs a Discrete Fourier Transform on time-domain samples
       * @param {Float32Array} timeDomainSamples - Input time-domain samples
       * @param {number} maxHarmonics - Maximum number of harmonics to analyze
       * @returns {Object} Object with real and imaginary coefficient arrays
       */
      static transform(timeDomainSamples, maxHarmonics = 128) {
        const N = timeDomainSamples.length;
        const numHarmonics = Math.min(maxHarmonics, Math.floor(N / 2));
        const real = new Float32Array(numHarmonics + 1).fill(0);
        const imag = new Float32Array(numHarmonics + 1).fill(0);
        real[0] = 0;
        for (let k = 1; k <= numHarmonics; k++) {
          let realSum = 0;
          let imagSum = 0;
          for (let n = 0; n < N; n++) {
            const angle = 2 * Math.PI * k * n / N;
            realSum += timeDomainSamples[n] * Math.cos(angle);
            imagSum -= timeDomainSamples[n] * Math.sin(angle);
          }
          real[k] = 2 * realSum / N;
          imag[k] = 2 * imagSum / N;
        }
        return { real, imag };
      }
      /**
       * Performs an Inverse Discrete Fourier Transform to reconstruct time-domain samples
       * @param {Float32Array} real - Real coefficients
       * @param {Float32Array} imag - Imaginary coefficients  
       * @param {number} sampleCount - Number of output samples
       * @returns {Float32Array} Reconstructed time-domain samples
       */
      static inverseTransform(real, imag, sampleCount = 512) {
        const samples = new Float32Array(sampleCount);
        for (let n = 0; n < sampleCount; n++) {
          const theta = n / sampleCount * 2 * Math.PI;
          let sum = 0;
          for (let k = 1; k < real.length && k < imag.length; k++) {
            sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
          }
          samples[n] = sum;
        }
        return samples;
      }
      /**
       * Extracts magnitude spectrum from DFT coefficients
       * @param {Float32Array} real - Real coefficients
       * @param {Float32Array} imag - Imaginary coefficients
       * @returns {Float32Array} Magnitude spectrum
       */
      static getMagnitudeSpectrum(real, imag) {
        const magnitude = new Float32Array(Math.min(real.length, imag.length));
        for (let k = 0; k < magnitude.length; k++) {
          magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
        }
        return magnitude;
      }
      /**
       * Extracts phase spectrum from DFT coefficients
       * @param {Float32Array} real - Real coefficients
       * @param {Float32Array} imag - Imaginary coefficients
       * @returns {Float32Array} Phase spectrum in radians
       */
      static getPhaseSpectrum(real, imag) {
        const phase = new Float32Array(Math.min(real.length, imag.length));
        for (let k = 0; k < phase.length; k++) {
          phase[k] = Math.atan2(imag[k], real[k]);
        }
        return phase;
      }
    };
  }
});

// js/dsp/WaveformGenerator.js
var WaveformGenerator;
var init_WaveformGenerator = __esm({
  "js/dsp/WaveformGenerator.js"() {
    WaveformGenerator = class _WaveformGenerator {
      /**
       * Creates a band-limited PeriodicWave for use with Web Audio API
       * @param {AudioContext} context - Web Audio context
       * @param {string} type - Waveform type ('square', 'sawtooth', 'triangle')
       * @param {number} maxHarmonics - Maximum number of harmonics to include
       * @returns {PeriodicWave} Generated periodic wave
       */
      static createBandLimitedWaveform(context, type, maxHarmonics = 1024) {
        const real = new Float32Array(maxHarmonics + 1);
        const imag = new Float32Array(maxHarmonics + 1);
        const coefficients = _WaveformGenerator.getFourierCoefficients(type, maxHarmonics);
        for (let n = 1; n <= maxHarmonics; n++) {
          imag[n] = coefficients[n] || 0;
        }
        return context.createPeriodicWave(real, imag, { disableNormalization: false });
      }
      /**
       * Calculates Fourier coefficients for standard waveforms
       * @param {string} type - Waveform type
       * @param {number} maxHarmonics - Maximum harmonics to calculate
       * @returns {Array} Array of Fourier coefficients
       */
      static getFourierCoefficients(type, maxHarmonics) {
        const coefficients = new Array(maxHarmonics + 1).fill(0);
        for (let n = 1; n <= maxHarmonics; n++) {
          let amplitude = 0;
          let sign = 1;
          switch (type) {
            case "square":
              if (n % 2 !== 0) {
                amplitude = 4 / (Math.PI * n);
              }
              break;
            case "sawtooth":
              amplitude = 2 / (Math.PI * n);
              sign = n % 2 === 0 ? -1 : 1;
              break;
            case "triangle":
              if (n % 2 !== 0) {
                amplitude = 8 / (Math.PI * Math.PI * n * n);
                const k = (n - 1) / 2;
                sign = k % 2 === 0 ? 1 : -1;
              }
              break;
            default:
              throw new Error(`Unsupported waveform type: ${type}`);
          }
          coefficients[n] = amplitude * sign;
        }
        return coefficients;
      }
      /**
       * Generates time-domain samples for standard waveforms
       * @param {string} type - Waveform type
       * @param {number} sampleCount - Number of samples to generate
       * @param {number} harmonics - Number of harmonics to include
       * @returns {Float32Array} Time-domain samples
       */
      static generateTimeDomainSamples(type, sampleCount = 1024, harmonics = 64) {
        const samples = new Float32Array(sampleCount);
        const coefficients = _WaveformGenerator.getFourierCoefficients(type, harmonics);
        for (let i = 0; i < sampleCount; i++) {
          const theta = i / sampleCount * 2 * Math.PI;
          let sum = 0;
          for (let n = 1; n <= harmonics; n++) {
            if (coefficients[n] !== 0) {
              sum += coefficients[n] * Math.sin(n * theta);
            }
          }
          samples[i] = sum * 0.7;
        }
        return samples;
      }
      /**
       * Creates a custom waveform from Fourier coefficients
       * @param {AudioContext} context - Web Audio context
       * @param {Float32Array} real - Real Fourier coefficients
       * @param {Float32Array} imag - Imaginary Fourier coefficients
       * @returns {PeriodicWave} Custom periodic wave
       */
      static createCustomWaveform(context, real, imag) {
        return context.createPeriodicWave(real, imag, { disableNormalization: false });
      }
    };
  }
});

// js/dsp/WAVExporter.js
var WAVExporter;
var init_WAVExporter = __esm({
  "js/dsp/WAVExporter.js"() {
    WAVExporter = class _WAVExporter {
      /**
       * Exports audio buffer data as a downloadable WAV file
       * @param {Float32Array} buffers - Audio buffer to export
       * @param {number} sampleRate - Sample rate for the WAV file
       * @param {string} filename - Filename for the download
       * @param {number} numCycles - Number of cycles to repeat the buffer
       */
      static exportAsWAV(buffers, sampleRate, filename, numCycles = 1) {
        if (!Array.isArray(buffers) || buffers.length === 0) {
          throw new Error("WAV export failed: expected an array of channel buffers.");
        }
        const numChannels = buffers.length;
        const length = buffers[0].length;
        for (let ch = 0; ch < numChannels; ch++) {
          if (!(buffers[ch] instanceof Float32Array)) {
            throw new Error(`Channel ${ch} is not a Float32Array.`);
          }
          if (buffers[ch].length !== length) {
            throw new Error(`Channel ${ch} length mismatch.`);
          }
        }
        const repeated = buffers.map(
          (chBuf) => _WAVExporter.repeatBuffer(chBuf, numCycles)
        );
        const wavData = _WAVExporter.createWAVBufferMulti(repeated, sampleRate);
        _WAVExporter.downloadFile(wavData, filename);
      }
      /**
       * Repeats a buffer for the specified number of cycles
       * @param {Float32Array} buffer - Original buffer
       * @param {number} numCycles - Number of cycles to repeat
       * @returns {Float32Array} Extended buffer
       */
      static repeatBuffer(buffer, numCycles) {
        const cycleLength = buffer.length;
        const totalLength = cycleLength * numCycles;
        const fullBuffer = new Float32Array(totalLength);
        for (let i = 0; i < totalLength; i++) {
          fullBuffer[i] = buffer[i % cycleLength];
        }
        return fullBuffer;
      }
      static createWAVBufferMulti(channelBuffers, sampleRate) {
        const numChannels = channelBuffers.length;
        const numFrames = channelBuffers[0].length;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = numFrames * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        let offset = 0;
        _WAVExporter.writeString(view, offset, "RIFF");
        offset += 4;
        view.setUint32(offset, 36 + dataSize, true);
        offset += 4;
        _WAVExporter.writeString(view, offset, "WAVE");
        offset += 4;
        _WAVExporter.writeString(view, offset, "fmt ");
        offset += 4;
        view.setUint32(offset, 16, true);
        offset += 4;
        view.setUint16(offset, 1, true);
        offset += 2;
        view.setUint16(offset, numChannels, true);
        offset += 2;
        view.setUint32(offset, sampleRate, true);
        offset += 4;
        view.setUint32(offset, byteRate, true);
        offset += 4;
        view.setUint16(offset, blockAlign, true);
        offset += 2;
        view.setUint16(offset, bytesPerSample * 8, true);
        offset += 2;
        _WAVExporter.writeString(view, offset, "data");
        offset += 4;
        view.setUint32(offset, dataSize, true);
        offset += 4;
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channelBuffers[ch][i]));
            view.setInt16(offset, sample * 32767, true);
            offset += 2;
          }
        }
        return buffer;
      }
      /**
       * Writes a string to a DataView at the specified offset
       * @param {DataView} view - DataView to write to
       * @param {number} offset - Byte offset to start writing
       * @param {string} string - String to write
       */
      static writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      }
      /**
       * Downloads a file buffer as a blob
       * @param {DataView} arrayBuffer - File data as DataView
       * @param {string} filename - Filename for the download
       */
      static downloadFile(arrayBuffer, filename) {
        const blob = new Blob([arrayBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    };
  }
});

// js/dsp/WavetableManager.js
var WavetableManager;
var init_WavetableManager = __esm({
  "js/dsp/WavetableManager.js"() {
    init_DFT();
    init_WaveformGenerator();
    WavetableManager = class {
      constructor() {
        this.waveforms = /* @__PURE__ */ new Map();
        this.coefficients = /* @__PURE__ */ new Map();
        this.periodMultipliers = /* @__PURE__ */ new Map();
        this.count = 0;
      }
      /**
       * Adds a new custom waveform from time-domain samples with period multiplier support.
       * 
       * WORKFLOW:
       * 1. Validates input samples for non-empty data
       * 2. Performs DFT to extract frequency-domain coefficients
       * 3. Creates Web Audio PeriodicWave object for synthesis
       * 4. Stores waveform, coefficients, and period multiplier with unique key
       * 
       * PERIOD MULTIPLIER INTEGRATION:
       * The period multiplier is crucial metadata that indicates how many fundamental
       * periods are packed into the wavetable buffer. This enables the frequency
       * correction system to compensate for the packed periods during playback.
       * 
       * UNIQUE KEY GENERATION:
       * Uses timestamp-based keys (custom_<timestamp>) to ensure uniqueness across
       * multiple waveform creation sessions without conflicts.
       * 
       * @param {Float32Array} samples - Time-domain samples (typically 2048 points)
       * @param {AudioContext} context - Web Audio context for PeriodicWave creation
       * @param {number} maxHarmonics - Maximum harmonics for DFT analysis (default: 128)
       * @param {number} periodMultiplier - Number of periods in the wavetable (default: 1)
       * @returns {string} Unique key for accessing the stored waveform
       */
      addFromSamples(samples, context, maxHarmonics = 128, periodMultiplier = 1) {
        if (samples.length === 0) {
          throw new Error("Cannot add empty waveform data.");
        }
        let max = 0;
        for (let i = 0; i < samples.length; i++) {
          if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
        }
        let normSamples = samples;
        if (max > 0 && max !== 1) {
          normSamples = new Float32Array(samples.length);
          for (let i = 0; i < samples.length; i++) {
            normSamples[i] = samples[i] / max;
          }
        }
        const { real, imag } = DFT.transform(normSamples, maxHarmonics);
        const periodicWave = WaveformGenerator.createCustomWaveform(context, real, imag);
        this.count++;
        const key = `custom_${Date.now()}_${this.count}`;
        this.waveforms.set(key, periodicWave);
        this.coefficients.set(key, { real, imag });
        this.periodMultipliers.set(key, periodMultiplier);
        return key;
      }
      /**
       * Adds a new custom waveform from Fourier coefficients
       * @param {Float32Array} real - Real coefficients
       * @param {Float32Array} imag - Imaginary coefficients
       * @param {AudioContext} context - Web Audio context
       * @returns {string} Unique key for the new waveform
       */
      addFromCoefficients(real, imag, context) {
        const periodicWave = WaveformGenerator.createCustomWaveform(context, real, imag);
        this.count++;
        const key = `custom_${this.count}`;
        this.waveforms.set(key, periodicWave);
        this.coefficients.set(key, {
          real: new Float32Array(real),
          imag: new Float32Array(imag)
        });
        return key;
      }
      /**
       * Gets a stored PeriodicWave
       * @param {string} key - Waveform key
       * @returns {PeriodicWave|null} The PeriodicWave or null if not found
       */
      getWaveform(key) {
        return this.waveforms.get(key) || null;
      }
      /**
       * Gets stored Fourier coefficients
       * @param {string} key - Waveform key
       * @returns {Object|null} Object with real and imag arrays, or null if not found
       */
      getCoefficients(key) {
        return this.coefficients.get(key) || null;
      }
      /**
       * Retrieves the period multiplier for a stored waveform.
       * 
       * CRITICAL FUNCTION:
       * This method enables the frequency correction system by providing the period
       * multiplier value needed to calculate the correct playback frequency.
       * 
       * USAGE CONTEXT:
       * Called by getFrequencyCorrection() in audio.js to determine how much to
       * scale the frequency when using custom waveforms with multiple periods.
       * 
       * FALLBACK BEHAVIOR:
       * Returns 1 for unknown keys, ensuring that missing or standard waveforms
       * don't cause frequency correction issues.
       * 
       * @param {string} key - Waveform key (e.g., 'custom_1732189423456_1')
       * @returns {number} Period multiplier (1 if not found or for standard waveforms)
       */
      getPeriodMultiplier(key) {
        return this.periodMultipliers.get(key) || 1;
      }
      /**
       * Reconstructs time-domain samples from stored coefficients
       * @param {string} key - Waveform key
       * @param {number} sampleCount - Number of samples to generate
       * @returns {Float32Array|null} Time-domain samples or null if not found
       */
      reconstructSamples(key, sampleCount = 512) {
        const coeffs = this.coefficients.get(key);
        if (!coeffs) return null;
        return DFT.inverseTransform(coeffs.real, coeffs.imag, sampleCount);
      }
      /**
       * Gets all stored waveform keys
       * @returns {Array<string>} Array of waveform keys
       */
      getAllKeys() {
        return Array.from(this.waveforms.keys());
      }
      /**
       * Removes a stored waveform
       * @param {string} key - Waveform key to remove
       * @returns {boolean} True if removed, false if not found
       */
      remove(key) {
        const hadWaveform = this.waveforms.delete(key);
        const hadCoefficients = this.coefficients.delete(key);
        return hadWaveform && hadCoefficients;
      }
      /**
       * Clears all stored waveforms
       */
      clear() {
        this.waveforms.clear();
        this.coefficients.clear();
        this.count = 0;
      }
      /**
       * Gets the current count of stored waveforms
       * @returns {number} Number of stored waveforms
       */
      getCount() {
        return this.waveforms.size;
      }
      /**
       * Exports waveform data for serialization
       * @param {string} key - Waveform key
       * @returns {Object|null} Serializable waveform data or null if not found
       */
      exportData(key) {
        const coeffs = this.coefficients.get(key);
        if (!coeffs) return null;
        return {
          key,
          real: Array.from(coeffs.real),
          imag: Array.from(coeffs.imag),
          timestamp: Date.now()
        };
      }
      /**
       * Imports waveform data from serialization
       * @param {Object} data - Serialized waveform data
       * @param {AudioContext} context - Web Audio context
       * @returns {string} The imported waveform key
       */
      importData(data, context) {
        const real = new Float32Array(data.real);
        const imag = new Float32Array(data.imag);
        return this.addFromCoefficients(real, imag, context);
      }
    };
  }
});

// js/dsp/AudioEngine.js
var AudioEngine;
var init_AudioEngine = __esm({
  "js/dsp/AudioEngine.js"() {
    init_WaveformGenerator();
    AudioEngine = class {
      constructor() {
        this.context = null;
        this.masterGain = null;
        this.compressor = null;
        this.oscillators = /* @__PURE__ */ new Map();
        this.isInitialized = false;
        this.standardWaveforms = /* @__PURE__ */ new Map();
      }
      /**
       * Initializes the audio engine for oscillator-based synthesis
       * @param {number} masterGainValue - Initial master gain value
       * @param {Object} options - Configuration options (for compatibility)
       */
      async initialize(masterGainValue = 0.5) {
        if (this.isInitialized) return;
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.setupAudioGraph(masterGainValue);
        this.generateStandardWaveforms();
        this.isInitialized = true;
        if (this.context.state === "suspended") {
          await this.context.resume();
        }
      }
      /**
       * Resume the audio context if suspended
       */
      async resume() {
        if (this.context && this.context.state === "suspended") {
          await this.context.resume();
        }
      }
      /**
       * Sets up the main audio processing graph
       * @param {number} masterGainValue - Initial master gain value
       */
      setupAudioGraph(masterGainValue) {
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.context.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.context.currentTime);
        this.compressor.attack.setValueAtTime(0.01, this.context.currentTime);
        this.compressor.release.setValueAtTime(0.2, this.context.currentTime);
        this.masterGain = this.context.createGain();
        this.masterGain.gain.setValueAtTime(masterGainValue, this.context.currentTime);
        this.masterGain.maxGain = 1;
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-6, this.context.currentTime);
        this.limiter.ratio.setValueAtTime(6, this.context.currentTime);
        this.limiter.attack.setValueAtTime(5e-3, this.context.currentTime);
        this.limiter.release.setValueAtTime(0.15, this.context.currentTime);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.context.destination);
      }
      /**
       * Generates standard band-limited waveforms
       */
      generateStandardWaveforms() {
        const types = ["square", "sawtooth", "triangle"];
        for (const type of types) {
          const periodicWave = WaveformGenerator.createBandLimitedWaveform(this.context, type, 128);
          this.standardWaveforms.set(type, periodicWave);
        }
      }
      /**
       * Get a standard waveform PeriodicWave object
       * @param {string} waveformType - Type of waveform ('square', 'sawtooth', 'triangle')
       * @returns {PeriodicWave|null} The PeriodicWave object or null if not found
       */
      getStandardWaveform(waveformType) {
        return this.standardWaveforms.get(waveformType) || null;
      }
      /**
       * Create an oscillator with the specified parameters
       * @param {number} frequency - Oscillator frequency
       * @param {string|PeriodicWave} waveform - Waveform type or PeriodicWave
       * @param {number} gain - Oscillator gain (0-1)
       * @param {Object} options - { pan, channel } for stereo/multichannel
       * @returns {Object} Object containing oscillator, gain node, and (optional) panner
       */
      createOscillator(frequency, waveform, gain = 1, options = {}) {
        if (!this.isInitialized) {
          throw new Error("AudioEngine must be initialized before creating oscillators");
        }
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();
        oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
        if (typeof waveform === "string") {
          if (waveform === "sine") {
            oscillator.type = "sine";
          } else if (this.standardWaveforms.has(waveform)) {
            oscillator.setPeriodicWave(this.standardWaveforms.get(waveform));
          } else {
            throw new Error(`Unknown waveform type: ${waveform}`);
          }
        } else if (waveform instanceof PeriodicWave) {
          oscillator.setPeriodicWave(waveform);
        } else {
          throw new Error("Waveform must be a string or PeriodicWave");
        }
        gainNode.gain.setValueAtTime(gain, this.context.currentTime);
        const panner = this.context.createStereoPanner();
        panner.pan.setValueAtTime(options.pan ?? 0, this.context.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.compressor);
        return { oscillator, gainNode, panner };
      }
      // No setRoutingMode needed
      /**
       * Add an oscillator to the managed oscillators map
       * @param {string} key - Unique key for the oscillator
       * @param {Object} oscData - Object containing oscillator and gain nodes
       */
      addOscillator(key, oscData) {
        oscData.oscillator.start(this.context.currentTime);
        this.oscillators.set(key, oscData);
      }
      /**
       * Update oscillator frequency with smooth transitions
       * @param {string} key - Oscillator key
       * @param {number} frequency - New frequency
       * @param {number} rampTime - Ramp time in seconds
       */
      updateOscillatorFrequency(key, frequency, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.oscillator) {
          const now = this.context.currentTime;
          oscData.oscillator.frequency.setTargetAtTime(frequency, now, rampTime / 3);
        }
      }
      /**
       * Update oscillator gain with smooth transitions
       * @param {string} key - Oscillator key
       * @param {number} gain - New gain value
       * @param {number} rampTime - Ramp time in seconds
       */
      updateOscillatorGain(key, gain, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gainNode) {
          const now = this.context.currentTime;
          oscData.gainNode.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
      }
      /**
       * Update master gain
       * @param {number} gain - New master gain value
       * @param {number} rampTime - Ramp time in seconds
       */
      updateMasterGain(gain, rampTime = 0.02) {
        if (this.masterGain) {
          const now = this.context.currentTime;
          this.masterGain.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
      }
      /**
       * Stop all oscillators
       */
      stopAllOscillators() {
        const now = this.context.currentTime;
        for (const oscData of this.oscillators.values()) {
          if (oscData.oscillator) {
            try {
              oscData.oscillator.stop(now + 0.01);
            } catch {
            }
          }
        }
        this.oscillators.clear();
      }
      /**
       * Get the audio context
       */
      getContext() {
        return this.context;
      }
    };
  }
});

// js/dsp/index.js
var init_dsp = __esm({
  "js/dsp/index.js"() {
    init_DFT();
    init_WaveformGenerator();
    init_WAVExporter();
    init_WavetableManager();
    init_AudioEngine();
  }
});

// js/audio.js
var audio_exports = {};
__export(audio_exports, {
  addWaveformToAudio: () => addWaveformToAudio,
  exportAsWAV: () => exportAsWAV,
  getAudioEngine: () => getAudioEngine,
  getWaveValue: () => getWaveValue,
  getWavetableManager: () => getWavetableManager,
  initAudio: () => initAudio,
  precomputeWaveTable: () => precomputeWaveTable,
  precomputeWavetableFromCoefficients: () => precomputeWavetableFromCoefficients,
  restartAudio: () => restartAudio,
  sampleCurrentWaveform: () => sampleCurrentWaveform,
  setDownloadRoutingMode: () => setDownloadRoutingMode,
  startTone: () => startTone,
  stopTone: () => stopTone,
  updateAudioProperties: () => updateAudioProperties
});
function setDownloadRoutingMode(mode) {
  AppState.downloadRoutingMode = mode;
}
function getAudioEngine() {
  return audioEngine;
}
function getWavetableManager() {
  return wavetableManager;
}
async function initAudio() {
  if (!audioEngine) {
    audioEngine = new AudioEngine();
    wavetableManager = new WavetableManager();
    await audioEngine.initialize(AppState.masterGainValue);
    AppState.audioContext = audioEngine.getContext();
    AppState.compressor = audioEngine.compressor;
    AppState.masterGain = audioEngine.masterGain;
    AppState.blWaveforms = AppState.blWaveforms || {};
    AppState.blWaveforms.square = audioEngine.getStandardWaveform("square");
    AppState.blWaveforms.sawtooth = audioEngine.getStandardWaveform("sawtooth");
    AppState.blWaveforms.triangle = audioEngine.getStandardWaveform("triangle");
  }
  await audioEngine.resume();
}
function resolveWaveform(waveformName) {
  if (!waveformName) {
    return "sine";
  }
  if (waveformName.startsWith("custom_")) {
    const customWave = wavetableManager.getWaveform(waveformName);
    return customWave || "sine";
  }
  return waveformName;
}
function getFrequencyCorrection(waveformName) {
  if (!waveformName || !waveformName.startsWith("custom_")) {
    return 1;
  }
  let periodMultiplier = 1;
  if (wavetableManager) {
    periodMultiplier = wavetableManager.getPeriodMultiplier(waveformName);
  } else if (AppState.customWavePeriodMultipliers) {
    periodMultiplier = AppState.customWavePeriodMultipliers[waveformName] || 1;
  }
  return 1 / periodMultiplier;
}
async function startTone() {
  await initAudio();
  if (AppState.isPlaying) return;
  try {
    await startToneWithOscillators();
    updateAppState({ isPlaying: true });
  } catch (error) {
    console.error("Failed to start synthesis:", error);
    throw error;
  }
}
async function startToneWithOscillators() {
  AppState.oscillators = [];
  const panArray = AppState.oscillatorPans || [];
  const numPartials = AppState.currentSystem.ratios.length;
  for (let i = 0; i < AppState.harmonicAmplitudes.length; i++) {
    if (i < numPartials) {
      const ratio = AppState.currentSystem.ratios[i];
      const amplitude = AppState.harmonicAmplitudes[i] || 0;
      if (ratio > 0) {
        const frequency = calculateFrequency(ratio);
        const gain = amplitude * AppState.masterGainValue;
        const waveform = resolveWaveform(AppState.currentWaveform);
        const frequencyCorrection = getFrequencyCorrection(AppState.currentWaveform);
        const correctedFrequency = frequency * frequencyCorrection;
        let panValue = i === 0 ? 0 : panArray[i] ?? (i % 2 === 0 ? -0.8 : 0.8);
        let oscOptions = { pan: panValue };
        try {
          const oscData = audioEngine.createOscillator(correctedFrequency, waveform, gain, oscOptions);
          const oscKey = `harmonic_${i}`;
          audioEngine.addOscillator(oscKey, oscData);
          while (AppState.oscillators.length <= i) {
            AppState.oscillators.push(null);
          }
          AppState.oscillators[i] = { key: oscKey, ratio };
        } catch (error) {
          console.error(`Failed to create oscillator ${i}:`, error);
          AppState.oscillators[i] = null;
        }
      } else {
        AppState.oscillators[i] = null;
      }
    } else {
      AppState.harmonicAmplitudes[i] = 0;
      AppState.oscillators[i] = null;
    }
  }
}
function stopTone() {
  if (!AppState.isPlaying || !audioEngine) return;
  audioEngine.stopAllOscillators();
  updateAppState({
    oscillators: [],
    isPlaying: false
  });
}
function updateAudioProperties() {
  if (!AppState.isPlaying || !audioEngine) return;
  const rampTime = AppState.masterSlewValue;
  updateAudioPropertiesOscillators(rampTime);
}
function updateAudioPropertiesOscillators(rampTime) {
  audioEngine.updateMasterGain(AppState.masterGainValue, rampTime);
  AppState.oscillators.forEach((node, i) => {
    if (node && node.key) {
      const ratio = AppState.currentSystem.ratios[i];
      const baseFreq = calculateFrequency(ratio);
      const frequencyCorrection = getFrequencyCorrection(AppState.currentWaveform);
      const newFreq = baseFreq * frequencyCorrection;
      const amplitude = AppState.harmonicAmplitudes[i] || 0;
      let newGain = amplitude * AppState.masterGainValue;
      if (!isFinite(newFreq) || isNaN(newFreq)) {
        newGain = 0;
      } else {
        audioEngine.updateOscillatorFrequency(node.key, newFreq, rampTime);
      }
      audioEngine.updateOscillatorGain(node.key, newGain, rampTime);
    }
  });
}
function restartAudio() {
  if (AppState.isPlaying) {
    stopTone();
    setTimeout(startTone, 50);
  }
}
async function sampleCurrentWaveform(routingMode = "mono", isSubharmonic = false) {
  await initAudio();
  const numOsc = AppState.harmonicAmplitudes.length;
  const tableSize = WAVETABLE_SIZE;
  if (!AppState.currentSystem || !AppState.currentSystem.ratios) {
    console.error("Spectral system missing");
    return { buffer: new Float32Array(0), periodMultiplier: 1 };
  }
  const activeRatios = [];
  for (let h = 0; h < numOsc; h++) {
    if (AppState.harmonicAmplitudes[h] > 1e-3) {
      activeRatios.push(AppState.currentSystem.ratios[h]);
    }
  }
  const periodMultiplier = calculateOptimalPeriod(activeRatios, isSubharmonic);
  const totalPeriodLen = 2 * Math.PI * periodMultiplier;
  const customCoeffs = AppState.customWaveCoefficients?.[AppState.currentWaveform];
  const oscBuffers = Array(numOsc).fill(null).map(() => new Float32Array(tableSize));
  for (let h = 0; h < numOsc; h++) {
    const amp = AppState.harmonicAmplitudes[h];
    if (amp <= 1e-3) continue;
    const ratio = AppState.currentSystem.ratios[h];
    const buf = oscBuffers[h];
    for (let i = 0; i < tableSize; i++) {
      const theta = i / (tableSize - 1) * totalPeriodLen;
      const harmonic = isSubharmonic ? 1 / ratio * theta : ratio * theta;
      buf[i] = getWaveValue(AppState.currentWaveform, harmonic, customCoeffs) * amp;
    }
    let maxA = 0;
    for (let i = 0; i < tableSize; i++) maxA = Math.max(maxA, Math.abs(buf[i]));
    if (maxA > 0) {
      const n = 1 / maxA;
      for (let i = 0; i < tableSize; i++) buf[i] *= n;
    }
  }
  switch (routingMode) {
    //------------------------------------------------------------------
    // MONO — sum all oscillators
    //------------------------------------------------------------------
    case "mono": {
      const mono = new Float32Array(tableSize);
      for (let h = 0; h < numOsc; h++) {
        const b = oscBuffers[h];
        if (!b) continue;
        for (let i = 0; i < tableSize; i++) mono[i] += b[i];
      }
      let maxA = 0;
      for (let i = 0; i < tableSize; i++) maxA = Math.max(maxA, Math.abs(mono[i]));
      if (maxA > 0) {
        const n = 1 / maxA;
        for (let i = 0; i < tableSize; i++) mono[i] *= n;
      }
      return { buffer: mono, periodMultiplier };
    }
    //------------------------------------------------------------------
    // STEREO — use AppState.oscillatorPans for equal-power panning
    //------------------------------------------------------------------
    case "stereo": {
      const L = new Float32Array(tableSize);
      const R = new Float32Array(tableSize);
      for (let h = 0; h < numOsc; h++) {
        const b = oscBuffers[h];
        if (!b) continue;
        const pan = AppState.oscillatorPans?.[h] ?? 0;
        const p = (pan + 1) * 0.5;
        const gainL = Math.cos(p * Math.PI * 0.5);
        const gainR = Math.sin(p * Math.PI * 0.5);
        for (let i = 0; i < tableSize; i++) {
          const v = b[i];
          L[i] += v * gainL;
          R[i] += v * gainR;
        }
      }
      let maxA = 0;
      for (let i = 0; i < tableSize; i++) {
        maxA = Math.max(maxA, Math.abs(L[i]), Math.abs(R[i]));
      }
      if (maxA > 0) {
        const n = 1 / maxA;
        for (let i = 0; i < tableSize; i++) {
          L[i] *= n;
          R[i] *= n;
        }
      }
      return { buffers: [L, R], periodMultiplier };
    }
    //------------------------------------------------------------------
    // MULTICHANNEL — each oscillator isolated
    //------------------------------------------------------------------
    case "multichannel": {
      const numChannels = 12;
      const channels = [];
      for (let ch = 0; ch < numChannels; ch++) {
        channels[ch] = oscBuffers[ch] ?? new Float32Array(tableSize);
      }
      for (let ch = 0; ch < numChannels; ch++) {
        const c = channels[ch];
        let maxA = 0;
        for (let i = 0; i < tableSize; i++) {
          maxA = Math.max(maxA, Math.abs(c[i]));
        }
        if (maxA > 0) {
          const n = 1 / maxA;
          for (let i = 0; i < tableSize; i++) c[i] *= n;
        }
      }
      return { buffers: channels, periodMultiplier };
    }
    //------------------------------------------------------------------
    // fallback = mono
    //------------------------------------------------------------------
    default:
      console.warn(`Unknown routingMode ${routingMode}, defaulting to mono`);
      return sampleCurrentWaveform("mono", isSubharmonic);
  }
}
function calculateOptimalPeriod(ratios, isSubharmonic) {
  if (ratios.length === 0) return 1;
  const bestPeriods = ratios.map((ratio) => {
    let bestPeriod = 1;
    let smallestError = Infinity;
    for (let period = 1; period <= 20; period++) {
      let cycles;
      if (isSubharmonic) {
        cycles = 1 / ratio * period;
      } else {
        cycles = ratio * period;
      }
      const fractionalPart = Math.abs(cycles - Math.round(cycles));
      if (fractionalPart < smallestError) {
        smallestError = fractionalPart;
        bestPeriod = period;
      }
      if (fractionalPart < 1e-3) break;
    }
    console.log(`Ratio ${ratio}: best period ${bestPeriod} gives ${ratio * bestPeriod} cycles (error: ${smallestError})`);
    return bestPeriod;
  });
  const lcm2 = bestPeriods.reduce((acc, period) => {
    const gcd2 = (a, b) => b === 0 ? a : gcd2(b, a % b);
    return acc * period / gcd2(acc, period);
  }, 1);
  return Math.min(lcm2, 20);
}
function exportAsWAV(data, numCycles = 1) {
  if (!AppState.audioContext) {
    showStatus("Error: Audio system not initialized. Please click 'Start Tone' first.", "error");
    return;
  }
  if (!data) {
    showStatus("WAV Export Failed: No waveform data passed.", "error");
    return;
  }
  const periodMultiplier = data.periodMultiplier || 1;
  let channelBuffers;
  if (data.buffers && Array.isArray(data.buffers)) {
    channelBuffers = data.buffers;
  } else if (data.buffer) {
    channelBuffers = [data.buffer];
  } else {
    showStatus("WAV Export Failed: Invalid waveform data structure.", "error");
    return;
  }
  if (channelBuffers.length === 0 || channelBuffers[0].length === 0) {
    showStatus("WAV Export Failed: Cannot export empty waveform data.", "error");
    return;
  }
  const baseSampleRate = AppState.audioContext.sampleRate;
  const correctedSampleRate = baseSampleRate / periodMultiplier;
  console.log(
    `WAV Export: channels=${channelBuffers.length}, period multiplier=${periodMultiplier}, sampleRate=${correctedSampleRate}`
  );
  const parts = generateFilenameParts();
  const filename = [
    parts.noteLetter,
    parts.waveform,
    parts.systemName,
    parts.levels,
    parts.subharmonicFlag
  ].filter(Boolean).join("-") + ".wav";
  try {
    WAVExporter.exportAsWAV(channelBuffers, correctedSampleRate, filename, numCycles);
    showStatus(`Wavetable exported as ${filename} (${correctedSampleRate}Hz)!`, "success");
  } catch (error) {
    showStatus(`WAV Export Failed: ${error.message}`, "error");
  }
}
function getWaveValue(type, theta, customCoeffs) {
  if (type.startsWith("custom")) {
    let table = wavetableCache[type];
    if (!table) {
      if (!customCoeffs) return Math.sin(theta);
      table = wavetableCache[type] = precomputeWavetableFromCoefficients(customCoeffs, 512);
    }
    const normalized = theta % (2 * Math.PI) / (2 * Math.PI);
    const index = normalized * (table.length - 1);
    const i0 = index | 0;
    const i1 = (i0 + 1) % table.length;
    const frac = index - i0;
    return table[i0] * (1 - frac) + table[i1] * frac;
  }
  switch (type) {
    case "sine":
      return Math.sin(theta);
    case "square": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n < terms * 2; n += 2) sum += 1 / n * Math.sin(theta * n);
      return sum * (4 / Math.PI) * 0.7;
    }
    case "sawtooth": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n <= terms; n++) sum += 1 / n * Math.sin(theta * n);
      return sum * (2 / Math.PI) * 0.7;
    }
    case "triangle": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n < terms * 2; n += 2) {
        const sign = (n - 1) / 2 % 2 === 0 ? 1 : -1;
        sum += sign / (n * n) * Math.sin(theta * n);
      }
      return sum * (8 / (Math.PI * Math.PI)) * 0.7;
    }
    default:
      return Math.sin(theta);
  }
}
async function addWaveformToAudio(buffer, periodMultiplier, AppState2) {
  await initAudio();
  const waveKey = getWavetableManager().addFromSamples(
    buffer,
    AppState2.audioContext,
    128,
    periodMultiplier
  );
  const coefficients = getWavetableManager().getCoefficients(waveKey);
  wavetableCache[waveKey] = precomputeWavetableFromCoefficients(coefficients);
  const periodicWave = getWavetableManager().getWaveform(waveKey);
  return { waveKey, coefficients, periodicWave };
}
function precomputeWaveTable(input, tableSize = 512) {
  let table = new Float32Array(tableSize);
  if (input instanceof Float32Array) {
    const src = input;
    const step = (src.length - 1) / (tableSize - 1);
    for (let i = 0; i < tableSize; i++) {
      const idx = i * step;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, src.length - 1);
      const f = idx - i0;
      table[i] = src[i0] * (1 - f) + src[i1] * f;
    }
    return table;
  }
  if (input.real && input.imag) {
    const real = input.real;
    const imag = input.imag;
    const harmonics = Math.min(real.length, imag.length);
    for (let i = 0; i < tableSize; i++) {
      const theta = i / tableSize * Math.PI * 2;
      let sum = 0;
      for (let k = 1; k < harmonics; k++) {
        sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
      }
      table[i] = sum;
    }
    return table;
  }
  console.error("precomputeUnifiedWaveTable: invalid input", input);
  return new Float32Array(tableSize);
}
function precomputeWavetableFromCoefficients(coeffs, tableSize = 512) {
  const table = new Float32Array(tableSize);
  let maxAmp = 0;
  for (let i = 0; i < tableSize; i++) {
    const t = i / tableSize * 2 * Math.PI;
    let sum = 0;
    for (let k = 1; k < coeffs.real.length && k < coeffs.imag.length; k++) {
      sum += coeffs.real[k] * Math.cos(k * t) + coeffs.imag[k] * Math.sin(k * t);
    }
    table[i] = sum;
    if (Math.abs(sum) > maxAmp) maxAmp = Math.abs(sum);
  }
  if (maxAmp > 0) {
    const scale = 1 / maxAmp;
    for (let i = 0; i < tableSize; i++) {
      table[i] *= scale;
    }
  }
  return table;
}
var audioEngine, wavetableManager, wavetableCache;
var init_audio = __esm({
  "js/audio.js"() {
    init_config();
    init_utils();
    init_dsp();
    init_domUtils();
    audioEngine = null;
    wavetableManager = null;
    wavetableCache = {};
  }
});

// js/utils.js
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return MIDI_NOTE_NAMES[noteIndex] + octave;
}
function gainToHex(gain) {
  const level = Math.round(gain * 15);
  return level.toString(16).toUpperCase();
}
function generateOvertoneString() {
  return AppState.harmonicAmplitudes.slice(0, 12).map(gainToHex).join("");
}
function generateFilenameParts() {
  const noteLetter = midiToNoteName(AppState.currentMidiNote).replace("#", "s");
  const waveform = AppState.currentWaveform.toUpperCase().replace("_", "-");
  const systemName = AppState.currentSystem.name.split(".")[1].trim().replace(/[^a-zA-Z0-9_]/g, "");
  const levels = generateOvertoneString();
  const subharmonicFlag = AppState.isSubharmonic ? "subharmonic" : "";
  return {
    noteLetter,
    waveform,
    systemName,
    levels,
    subharmonicFlag
  };
}
function calculateFrequency(ratio) {
  if (AppState.isSubharmonic) {
    return ratio === 0 ? 0 : AppState.fundamentalFrequency / ratio;
  } else {
    return AppState.fundamentalFrequency * ratio;
  }
}
function smoothUpdateHarmonicAmplitude(index, value, immediate = false) {
  const key = `harmonic_${index}`;
  if (immediate) {
    momentumSmoother.setImmediate(key, value);
    AppState.harmonicAmplitudes[index] = value;
    updateAudioProperties();
    return;
  }
  momentumSmoother.smoothTo(
    key,
    value,
    (smoothedValue) => {
      AppState.harmonicAmplitudes[index] = smoothedValue;
      updateAudioProperties();
    },
    0.8
  );
}
function smoothUpdateMasterGain(value) {
  momentumSmoother.smoothTo(
    "master_gain",
    value,
    async (smoothedValue) => {
      AppState.masterGainValue = smoothedValue;
      const { updateAudioProperties: updateAudioProperties2 } = await Promise.resolve().then(() => (init_audio(), audio_exports));
      updateAudioProperties2();
    },
    0.8
    // Slightly more smoothing for master gain
  );
}
function smoothUpdateSystem(systemIndex, onComplete = null) {
  pendingSystemIndex = systemIndex;
  momentumSmoother.debounce("systemChange", 35, async () => {
    const idx = pendingSystemIndex;
    if (idx === null) return;
    const { setCurrentSystem: setCurrentSystem2 } = await Promise.resolve().then(() => (init_config(), config_exports));
    const { updateAudioProperties: updateAudioProperties2 } = await Promise.resolve().then(() => (init_audio(), audio_exports));
    setCurrentSystem2(idx);
    if (AppState.isPlaying) {
      updateAudioProperties2();
    }
    if (onComplete) onComplete();
    pendingSystemIndex = null;
  });
}
var pendingSystemIndex;
var init_utils = __esm({
  "js/utils.js"() {
    init_config();
    init_momentum_smoother();
    init_momentum_smoother();
    init_audio();
    pendingSystemIndex = null;
  }
});

// js/events.js
var DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED, ROUTING_MODE_CHANGED;
var init_events = __esm({
  "js/events.js"() {
    DRAWBAR_CHANGE = "drawbar-change";
    DRAWBARS_RANDOMIZED = "drawbars-randomized";
    DRAWBARS_RESET = "drawbars-reset";
    SPECTRAL_SYSTEM_CHANGED = "spectral-system-changed";
    SUBHARMONIC_TOGGLED = "subharmonic-toggled";
    ROUTING_MODE_CHANGED = "routing-mode-changed";
  }
});

// js/modules/drawbars/drawbarsActions.js
var DrawbarsActions;
var init_drawbarsActions = __esm({
  "js/modules/drawbars/drawbarsActions.js"() {
    init_config();
    init_utils();
    init_events();
    DrawbarsActions = {
      setDrawbar(index, value) {
        const amps = AppState.harmonicAmplitudes;
        if (amps && amps.length > index) {
          if (amps[index] !== value) {
            amps[index] = value;
            updateAppState({ harmonicAmplitudes: amps });
            smoothUpdateHarmonicAmplitude(index, value);
            document.dispatchEvent(
              new CustomEvent(DRAWBAR_CHANGE, {
                detail: { index, value }
              })
            );
          }
        }
      },
      randomize() {
        const newAmps = AppState.harmonicAmplitudes.map((_, i) => {
          return i === 0 ? 0.5 + Math.random() * 0.5 : Math.random();
        });
        updateAppState({ harmonicAmplitudes: newAmps });
        newAmps.forEach((value, i) => {
          smoothUpdateHarmonicAmplitude(i, value);
        });
        document.dispatchEvent(new Event(DRAWBARS_RANDOMIZED));
      },
      reset() {
        const oldAmps = AppState.harmonicAmplitudes || [];
        const newAmps = oldAmps.map((_, i) => i === 0 ? 1 : 0);
        updateAppState({ harmonicAmplitudes: newAmps });
        newAmps.forEach((v, i) => {
          smoothUpdateHarmonicAmplitude(i, v, true);
        });
        document.dispatchEvent(new Event(DRAWBARS_RESET));
      }
    };
  }
});

// js/modules/base/BaseController.js
var BaseController;
var init_BaseController = __esm({
  "js/modules/base/BaseController.js"() {
    BaseController = class {
      constructor(selector) {
        if (typeof this.createComponent !== "function") {
          throw new Error("Subclass must implement createComponent(selector)");
        }
        this.selector = selector;
        this.component = this.createComponent(selector);
        if (!this.component) {
          throw new Error("createComponent() must return a component instance");
        }
      }
      /**
       * Initialize controller lifecycle. Call this once after construction.
       */
      init() {
        this.bindComponentEvents();
        this.bindExternalEvents();
        this.update();
      }
      /**
       * Subclasses MUST implement this to return props derived from app state.
       */
      getProps() {
        throw new Error("Subclass must implement getProps()");
      }
      /**
       * Re-render the component with fresh props.
       * Safe to call any time state changes.
       */
      update() {
        const props = this.getProps();
        if (this.component.teardown) this.component.teardown();
        this.component.render(props);
        if (typeof this.component.bindRenderedEvents === "function") {
          this.component.bindRenderedEvents();
        }
        return props;
      }
      /**
       * Subclasses MAY override this to wire component-level events, e.g.:
       *   this.component.onChange = (value) => {...}
       * 
       *   TODO: consider instead passing in functions as props to the render method
       */
      bindComponentEvents() {
      }
      /**
       * Subclasses MAY override this to bind global events (ex: document listeners)
       * TODO: need to add cleanup for events bound here. 
       * almost always calls this.update() so it could be streamlined
       */
      bindExternalEvents() {
      }
      /**
       * Optional destruction (future-proofing)
       */
      destroy() {
        if (this.component.teardown) {
          this.component.teardown();
        }
      }
    };
  }
});

// js/modules/drawbars/drawbarsController.js
var RESET_DRAWBARS_BUTTON_ID, RANDOMIZE_DRAWBARS_BUTTON_ID, DrawbarsController;
var init_drawbarsController = __esm({
  "js/modules/drawbars/drawbarsController.js"() {
    init_DrawbarsComponent();
    init_drawbarsActions();
    init_events();
    init_BaseController();
    init_config();
    RESET_DRAWBARS_BUTTON_ID = "reset-drawbars-button";
    RANDOMIZE_DRAWBARS_BUTTON_ID = "randomize-drawbars-button";
    DrawbarsController = class extends BaseController {
      createComponent(selector) {
        return new DrawbarsComponent(selector);
      }
      /**
       * Wire Component → Actions
       */
      bindComponentEvents() {
        this.component.onChange = (index, value) => {
          DrawbarsActions.setDrawbar(index, value);
        };
      }
      updateDrawbar({ index, value }) {
        this.component.updateSingleDrawbar(index, value);
      }
      reset() {
        DrawbarsActions.reset();
      }
      randomize() {
        DrawbarsActions.randomize();
      }
      /**
       * DOM / Global events
       */
      bindExternalEvents() {
        document.addEventListener(DRAWBAR_CHANGE, (event) => this.updateDrawbar(event.detail));
        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.update());
        document.addEventListener(DRAWBARS_RESET, () => this.update());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.update());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.update());
        document.getElementById(RESET_DRAWBARS_BUTTON_ID)?.addEventListener("click", () => {
          this.reset();
        });
        document.getElementById(RANDOMIZE_DRAWBARS_BUTTON_ID)?.addEventListener("click", () => {
          this.randomize();
        });
      }
      getProps() {
        return {
          isSubharmonic: AppState.isSubharmonic
        };
      }
      // no update() override — BaseController handles render + bindRenderedEvents
    };
  }
});

// js/modules/spectralSystem/spectralSystemActions.js
var SpectralSystemActions;
var init_spectralSystemActions = __esm({
  "js/modules/spectralSystem/spectralSystemActions.js"() {
    init_audio();
    init_config();
    init_events();
    init_utils();
    SpectralSystemActions = {
      toggleSubharmonic() {
        const isSubharmonic = !AppState.isSubharmonic;
        updateAppState({ isSubharmonic });
        document.dispatchEvent(new CustomEvent(SUBHARMONIC_TOGGLED, { detail: { isSubharmonic } }));
      },
      setSystem(index) {
        updateAppState({ currentSystem: spectralSystems[index] });
        const numPartials = AppState.currentSystem.ratios.length;
        const oldAmps = AppState.harmonicAmplitudes || [];
        const newAmps = [];
        for (let i = 0; i < numPartials; i++) {
          newAmps[i] = typeof oldAmps[i] === "number" ? oldAmps[i] : i === 0 ? 1 : 0;
        }
        for (let i = oldAmps.length; i < numPartials; i++) {
          newAmps[i] = i === 0 ? 1 : 0;
        }
        AppState.harmonicAmplitudes = newAmps;
        smoothUpdateSystem(index);
        document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, {
          detail: { index, system: AppState.currentSystem }
        }));
      },
      // TODO could move this to an audio actions file
      updateAudio() {
        updateAudioProperties();
      }
    };
  }
});

// js/modules/spectralSystem/SpectralSystemComponent.js
var RATIO_SYSTEM_SELECT_ID, SpectralSystemComponent;
var init_SpectralSystemComponent = __esm({
  "js/modules/spectralSystem/SpectralSystemComponent.js"() {
    init_BaseComponent();
    RATIO_SYSTEM_SELECT_ID = "#ratio-system-select";
    SpectralSystemComponent = class extends BaseComponent {
      // Store reference to the click handler for proper removal
      _subharmonicToggleHandler = null;
      constructor(elementId) {
        super(elementId);
        this.onChange = null;
        this.onSubharmonicToggle = null;
      }
      /**
       * Main render cycle: receives fresh props from BaseController.
       */
      render({ systems, currentSystem, isSubharmonic }) {
        const selectEl = this.q("#ratio-system-select");
        const descriptionEl = this.q("#system-description");
        if (!selectEl) return;
        while (selectEl.firstChild) {
          selectEl.removeChild(selectEl.firstChild);
        }
        systems.forEach((system, index) => {
          const option = document.createElement("option");
          option.textContent = system.name;
          option.value = index;
          if (system === currentSystem) option.selected = true;
          selectEl.appendChild(option);
        });
        this.updateContent(descriptionEl, currentSystem?.description || "", {
          asHTML: true
        });
        this.renderSubharmonicToggle({ isSubharmonic });
      }
      updateSelector({ currentSystem, systems }) {
        const selectEl = this.q("#ratio-system-select");
        if (!selectEl) return;
        const index = systems.findIndex((s) => s === currentSystem);
        if (index >= 0) selectEl.value = index;
      }
      /**
       * Bind interactive events once: BaseComponent guarantees
       * bindComponentEvents() runs only after construction.
       */
      bindComponentEvents() {
        const selectEl = this.q(RATIO_SYSTEM_SELECT_ID);
        if (!selectEl) return;
        if (this._selectChangeHandler) {
          selectEl.removeEventListener("change", this._selectChangeHandler);
        }
        this._selectChangeHandler = (e) => {
          const systemIndex = parseInt(e.target.value);
          console.log("[SpectralSystemComponent] Dropdown changed:", systemIndex);
          this.onChange?.(systemIndex);
          e.target.setAttribute("aria-valuenow", systemIndex);
        };
        selectEl.addEventListener("change", this._selectChangeHandler);
      }
      /**
       * Called by both render() and by SUBHARMONIC_TOGGLED external event.
       * It updates the UI state of the toggle without re-rendering the whole component.
       */
      renderSubharmonicToggle({ isSubharmonic }) {
        const subharmonicToggle = this.q("#subharmonic-toggle");
        if (!subharmonicToggle) return;
        subharmonicToggle.classList.toggle("active", isSubharmonic);
        subharmonicToggle.setAttribute("aria-checked", isSubharmonic);
        if (this._subharmonicToggleHandler) {
          subharmonicToggle.removeEventListener("click", this._subharmonicToggleHandler);
        }
        this._subharmonicToggleHandler = (e) => {
          this.onSubharmonicToggle?.();
        };
        subharmonicToggle.addEventListener("click", this._subharmonicToggleHandler);
      }
    };
  }
});

// js/modules/spectralSystem/spectralSystemController.js
var SpectralSystemController;
var init_spectralSystemController = __esm({
  "js/modules/spectralSystem/spectralSystemController.js"() {
    init_BaseController();
    init_spectralSystemActions();
    init_SpectralSystemComponent();
    init_config();
    init_events();
    SpectralSystemController = class extends BaseController {
      init() {
        super.init();
        this.component.bindComponentEvents();
      }
      update() {
        const props = super.update();
        this.component.updateSelector(props);
      }
      /**
       * Instantiate the component.
       * BaseComponent will validate the target selector internally.
       */
      createComponent(selector) {
        return new SpectralSystemComponent(selector);
      }
      /**
       * Always provide fresh props for each render cycle.
       * The BaseController.update() method will call this before
       * every component.render(props).
       */
      getProps() {
        return {
          systems: spectralSystems,
          currentSystem: AppState.currentSystem,
          isSubharmonic: AppState.isSubharmonic
        };
      }
      /**
       * Connect component → actions.
       * The component uses event callbacks instead of touching global state.
       */
      bindComponentEvents() {
        this.component.onChange = (systemIndex) => {
          SpectralSystemActions.setSystem(systemIndex);
        };
        this.component.onSubharmonicToggle = () => {
          SpectralSystemActions.toggleSubharmonic();
        };
        if (typeof this.component.bindComponentEvents === "function") {
          this.component.bindComponentEvents();
        }
      }
      /**
       * Listen for external/global events and refresh the UI.
       */
      bindExternalEvents() {
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
          this.update();
        });
        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
          if (typeof this.component.renderSubharmonicToggle === "function") {
            this.component.renderSubharmonicToggle({
              isSubharmonic: AppState.isSubharmonic
            });
          }
          this.update();
          SpectralSystemActions.updateAudio();
        });
      }
    };
  }
});

// js/modules/waveform/WaveformComponent.js
function lcm(a, b) {
  return a * b / gcd(a, b);
}
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
function lcmArray(arr) {
  return arr.reduce((a, b) => lcm(a, b), 1);
}
function createWaveformSketch(component) {
  return function(p) {
    component._waveformP5 = p;
    p.setup = function() {
      const container = component.el;
      const width = container?.clientWidth || 400;
      const height = 150;
      p.createCanvas(width, height).parent(container);
      p.noLoop();
    };
    p.windowResized = function() {
      const container = component.el;
      const width = container?.clientWidth || 400;
      const height = 150;
      p.resizeCanvas(width, height);
      p.redraw();
    };
    p.draw = function() {
      const props = component.props;
      if (!props?.p5Instance || !props.harmonicAmplitudes?.length) return;
      const width = p.width;
      const height = p.height;
      const ampScale = height * 0.4;
      p.background("#0d131f");
      p.stroke("#374151");
      p.strokeWeight(1);
      p.line(0, height / 2, width, height / 2);
      p.stroke("#10b981");
      p.strokeWeight(2);
      p.noFill();
      p.beginShape();
      if (props.mode === "single") {
        for (let x = 0; x < width; x++) {
          const theta = p.map(x, 0, width, 0, p.TWO_PI * 2);
          const ratio = props.currentSystem.ratios[0];
          const wave = getWaveValue2(
            props.currentWaveform,
            ratio * theta,
            props.customWaveCoefficients?.[props.currentWaveform]
          );
          const y = height / 2 - wave * ampScale;
          p.vertex(x, y);
        }
      } else {
        let fullPeriodMultiplier = 2;
        if (props.isSubharmonic) {
          const denominators = props.currentSystem.ratios.map((r, h) => props.harmonicAmplitudes[h] > 1e-3 ? Math.round(r) : null).filter(Boolean);
          if (denominators.length > 0) {
            fullPeriodMultiplier = lcmArray(denominators);
            fullPeriodMultiplier = Math.min(fullPeriodMultiplier, 32);
          }
        }
        const thetaScale = p.TWO_PI * fullPeriodMultiplier / width;
        for (let x = 0; x < width; x++) {
          const theta = x * thetaScale;
          let sum = 0;
          let totalAmp = 0;
          for (let h = 0; h < props.harmonicAmplitudes.length; h++) {
            const amp = props.harmonicAmplitudes[h] || 0;
            if (amp > 1e-3) {
              const ratio = props.currentSystem.ratios[h];
              const harmonicPhase = props.isSubharmonic ? theta / ratio : ratio * theta;
              sum += getWaveValue2(
                props.currentWaveform,
                harmonicPhase,
                component.props.customWaveCoefficients?.[props.currentWaveform]
              ) * amp;
              totalAmp += amp;
            }
          }
          const y = height / 2 - sum / (totalAmp || 1) * ampScale;
          p.vertex(x, y);
        }
      }
      p.endShape();
    };
  };
}
var WaveformComponent;
var init_WaveformComponent = __esm({
  "js/modules/waveform/WaveformComponent.js"() {
    init_BaseComponent();
    init_tonewheelActions();
    WaveformComponent = class extends BaseComponent {
      constructor(elementId) {
        super(elementId);
        this._waveformP5 = null;
        this.props = {};
      }
      /**
       * Render waveform with new props
       * @param {object} props - Includes p5Instance, currentWaveform, harmonicAmplitudes, currentSystem
       */
      render(props) {
        this.props = props;
        this.teardown();
        if (!props.p5Instance) {
          requestAnimationFrame(() => this.render(props));
          return;
        }
        const sketch = createWaveformSketch(this);
        this._waveformP5 = new p5(sketch, this.el);
      }
      /**
       * Clean up p5 instance and any other resources
       */
      teardown() {
        if (this._waveformP5?.remove) {
          this._waveformP5.remove();
          this._waveformP5 = null;
        }
        super.teardown?.();
      }
    };
  }
});

// js/modules/tonewheel/tonewheelActions.js
function createVisualizationSketch() {
  return function(p) {
    AppState.p5Instance = p;
    p.setSpreadFactor = function(value) {
      spreadFactor = value;
    };
    p.getSpreadFactor = function() {
      return spreadFactor;
    };
    p.setup = function() {
      const container = document.getElementById("tonewheel-canvas");
      let w = container ? container.clientWidth : 800;
      let h = w;
      if (w === 0) {
        w = window.innerWidth < 640 ? 320 : 800;
        h = w;
        console.warn("Canvas container width was 0, using fallback width:", w);
      }
      p.createCanvas(w, h).parent(container ? "tonewheel-canvas" : "body");
      p.angleMode(p.RADIANS);
      updateDimensions();
    };
    function updateDimensions() {
      const radialHeight = p.height * CANVAS_HEIGHT_RATIOS.RADIAL;
      maxAmplitudeRadial = p.min(p.width, radialHeight) * (1 - baseRadiusRatio) * 0.45;
      baseRadius = p.min(p.width, radialHeight) * baseRadiusRatio;
    }
    p.updateDimensions = updateDimensions;
    p.customWaveTables = {};
    p.precomputeCustomWaveTable = function(coeffs) {
      const tableSize = 512;
      const table = new Float32Array(tableSize);
      for (let i = 0; i < tableSize; i++) {
        const theta = i / tableSize * p.TWO_PI;
        let sum = 0;
        for (let k = 1; k < coeffs.real.length && k < coeffs.imag.length; k++) {
          sum += coeffs.real[k] * p.cos(k * theta) + coeffs.imag[k] * p.sin(k * theta);
        }
        table[i] = sum;
      }
      return table;
    };
    p.clearCustomWaveCache = function() {
      p.customWaveTables = {};
    };
    function computeHarmonicLaneRadii({ harmonicAmplitudes, baseRadius: baseRadius2, maxLaneHeight }) {
      const activeHarmonics = harmonicAmplitudes.map((amp, idx) => ({ amp, idx })).filter((h) => h.amp > 0);
      const num = activeHarmonics.length;
      const radii = new Array(harmonicAmplitudes.length);
      const laneSpacing = maxLaneHeight / num;
      let currentRadius = baseRadius2;
      for (let i = 0; i < num; i++) {
        const hIdx = activeHarmonics[i].idx;
        radii[hIdx] = currentRadius;
        currentRadius += laneSpacing;
      }
      return radii;
    }
    function drawRadialDisplay() {
      p.push();
      p.translate(p.width / 2, p.height / 2);
      p.noFill();
      p.stroke("#374151");
      p.ellipse(0, 0, baseRadius * 2, baseRadius * 2);
      const points = 360;
      const rotationSpeed = AppState.visualizationFrequency * p.TWO_PI / 60;
      const currentAngle = p.frameCount * rotationSpeed;
      drawIndividualPartials(points, currentAngle);
      p.pop();
    }
    function drawIndividualPartials(points, currentAngle) {
      const type = AppState.currentWaveform;
      const numHarmonics = AppState.harmonicAmplitudes.length;
      const laneRadii = computeHarmonicLaneRadii({
        harmonicAmplitudes: AppState.harmonicAmplitudes,
        baseRadius,
        maxLaneHeight: maxAmplitudeRadial
      });
      let fullPeriodMultiplier = 1;
      if (AppState.isSubharmonic) {
        const denominators = AppState.currentSystem.ratios.map((r, h) => AppState.harmonicAmplitudes[h] > 1e-3 ? Math.round(r) : null).filter(Boolean);
        if (denominators.length > 0) {
          fullPeriodMultiplier = lcmArray(denominators);
          fullPeriodMultiplier = Math.min(fullPeriodMultiplier, 32);
        }
      }
      const thetaScale = p.TWO_PI * fullPeriodMultiplier / points;
      for (let h = 0; h < numHarmonics; h++) {
        const amp = AppState.harmonicAmplitudes[h];
        if (amp <= 1e-3) continue;
        const ratio = AppState.currentSystem.ratios[h];
        const ringRadius = laneRadii[h];
        const MAX_RING_MOD = 0.45;
        const visualAmp = MAX_RING_MOD * (maxAmplitudeRadial / numHarmonics) * spreadFactor * amp;
        p.stroke(p.color(HARMONIC_COLORS[h] + "99"));
        p.strokeWeight(2);
        p.noFill();
        p.beginShape();
        for (let i = 0; i < points; i++) {
          const theta = i * thetaScale;
          const harmonicPhase = AppState.isSubharmonic ? theta / ratio : theta * ratio;
          const waveValue = getWaveValue2(type, harmonicPhase, AppState.customWaveCoefficients?.[type]);
          const rotatedTheta = theta + currentAngle;
          const r = ringRadius + waveValue * visualAmp;
          const x = r * p.cos(rotatedTheta);
          const y = r * p.sin(rotatedTheta);
          p.vertex(x, y);
        }
        p.endShape(p.CLOSE);
      }
    }
    p.draw = function() {
      p.clear();
      updateDimensions();
      drawRadialDisplay();
    };
    p.windowResized = function() {
      const container = document.getElementById("tonewheel-canvas");
      let w = container ? container.clientWidth : 800;
      let h = w;
      if (w === 0) {
        w = window.innerWidth < 640 ? 320 : 800;
        h = w;
      }
      p.resizeCanvas(w, h);
      updateDimensions();
    };
  };
}
function getWaveValue2(type, theta, customCoeffs) {
  if (type && type.startsWith("custom")) {
    const key = type;
    if (!waveformTables.has(key) && customCoeffs) {
      waveformTables.set(key, precomputeWaveTable(customCoeffs, TABLE_SIZE));
    }
    const table = waveformTables.get(key);
    if (!table) return Math.sin(theta);
    const normalizedTheta = theta % (2 * Math.PI) / (2 * Math.PI);
    const index = normalizedTheta * (table.length - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);
    const frac = index - low;
    return low === high ? table[low] : table[low] * (1 - frac) + table[high] * frac;
  }
  switch (type) {
    case "sine":
      return Math.sin(theta);
    case "square": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n < terms * 2; n += 2) sum += 1 / n * Math.sin(theta * n);
      return sum * (4 / Math.PI) * 0.7;
    }
    case "sawtooth": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n <= terms; n++) sum += 1 / n * Math.sin(theta * n);
      return sum * (2 / Math.PI) * 0.7;
    }
    case "triangle": {
      let sum = 0;
      const terms = 16;
      for (let n = 1; n < terms * 2; n += 2) {
        const sign = (n - 1) / 2 % 2 === 0 ? 1 : -1;
        sum += sign / (n * n) * Math.sin(theta * n);
      }
      return sum * (8 / (Math.PI * Math.PI)) * 0.7;
    }
    default:
      return Math.sin(theta);
  }
}
var spreadFactor, baseRadius, maxAmplitudeRadial, baseRadiusRatio, TonewheelActions, waveformTables, TABLE_SIZE;
var init_tonewheelActions = __esm({
  "js/modules/tonewheel/tonewheelActions.js"() {
    init_config();
    init_audio();
    init_WaveformComponent();
    spreadFactor = 1;
    baseRadiusRatio = 0.08;
    TonewheelActions = {
      initVisualization() {
        if (p5) {
          const sketch = createVisualizationSketch();
          return new p5(sketch, "tonewheel-canvas");
        }
        return null;
      },
      setVisualizationFrequency(freq) {
        updateAppState({ visualizationFrequency: freq });
      },
      setSpreadFactor(value) {
        if (AppState.p5Instance && AppState.p5Instance.setSpreadFactor) {
          AppState.p5Instance.setSpreadFactor(value);
        }
      },
      getSpreadFactor() {
        if (AppState.p5Instance && AppState.p5Instance.getSpreadFactor) {
          return AppState.p5Instance.getSpreadFactor();
        }
        return 0.2;
      },
      clearCustomWaveCache() {
        if (AppState.p5Instance && AppState.p5Instance.clearCustomWaveCache) {
          AppState.p5Instance.clearCustomWaveCache();
        }
      }
    };
    waveformTables = /* @__PURE__ */ new Map();
    TABLE_SIZE = 512;
  }
});

// js/modules/waveform/waveformActions.js
function handleWaveformChange(e) {
  const currentWaveform = e.target.value;
  updateAppState({ currentWaveform });
  document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED, {
    detail: { currentWaveform }
  }));
  if (AppState.isPlaying) {
    restartAudio();
  }
}
function handleAddToWaveforms(routingMode, isSubharmonic) {
  sampleCurrentWaveform(routingMode, isSubharmonic).then((sampledData) => {
    const buffer = sampledData.buffer || sampledData;
    if (buffer.length > 0) {
      addToWaveforms(sampledData);
    }
  }).catch((error) => {
    console.error("Failed to sample waveform for adding:", error);
    showStatus("Failed to sample waveform for adding", "error");
  });
}
async function addToWaveforms(sampledData) {
  const buffer = sampledData.buffer || sampledData;
  const periodMultiplier = sampledData.periodMultiplier || 1;
  if (buffer.length === 0) {
    showStatus("Warning: Cannot add empty waveform data.", "warning");
    return;
  }
  try {
    const { waveKey, coefficients, periodicWave } = await addWaveformToAudio(buffer, periodMultiplier, AppState);
    const customWaveIndex = addWaveformToState(
      AppState,
      waveKey,
      coefficients,
      periodicWave,
      periodMultiplier
    );
    addWaveformToUI(AppState, waveKey, customWaveIndex);
    document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED));
  } catch (error) {
    showStatus(`Failed to add waveform: ${error.message}`, "error");
  }
}
function addWaveformToState(AppState2, waveKey, coefficients, periodicWave, periodMultiplier) {
  AppState2.blWaveforms[waveKey] = periodicWave;
  if (!AppState2.customWaveCoefficients) {
    AppState2.customWaveCoefficients = {};
  }
  AppState2.customWaveCoefficients[waveKey] = coefficients;
  AppState2.customWaveCount = (AppState2.customWaveCount || 0) + 1;
  if (!AppState2.customWavePeriodMultipliers) {
    AppState2.customWavePeriodMultipliers = {};
  }
  AppState2.customWavePeriodMultipliers[waveKey] = periodMultiplier;
  TonewheelActions.clearCustomWaveCache();
  return AppState2.customWaveCount;
}
function addWaveformToUI(AppState2, waveKey, customWaveIndex) {
  const select = document.getElementById("waveform-select");
  if (!select) return;
  const parts = generateFilenameParts();
  const optionName = `${parts.noteLetter}-${parts.waveform}-${parts.systemName}-${parts.levels}` + (parts.subharmonicFlag ? `-${parts.subharmonicFlag}` : "");
  const option = document.createElement("option");
  option.textContent = `Custom ${customWaveIndex}: ${optionName}`;
  option.value = waveKey;
  select.appendChild(option);
  updateAppState({ currentWaveform: waveKey });
  select.value = waveKey;
  showStatus(
    `Successfully added new waveform: Custom ${customWaveIndex}. Now synthesizing with it!`,
    "success"
  );
  if (AppState2.isPlaying) {
    restartAudio();
  }
}
var CURRENT_WAVEFORM_CHANGED;
var init_waveformActions = __esm({
  "js/modules/waveform/waveformActions.js"() {
    init_audio();
    init_config();
    init_domUtils();
    init_utils();
    init_tonewheelActions();
    CURRENT_WAVEFORM_CHANGED = "currentWaveformChanged";
  }
});

// js/modules/waveform/waveformController.js
var WaveformController;
var init_waveformController = __esm({
  "js/modules/waveform/waveformController.js"() {
    init_config();
    init_events();
    init_BaseController();
    init_waveformActions();
    init_WaveformComponent();
    WaveformController = class extends BaseController {
      constructor(selector, options = {}) {
        super(selector);
        this.mode = options.mode || "sum";
      }
      createComponent(selector) {
        return new WaveformComponent(selector);
      }
      getProps() {
        const { p5Instance, harmonicAmplitudes, currentSystem, currentWaveform, customWaveCoefficients, isSubharmonic } = AppState;
        return {
          p5Instance,
          harmonicAmplitudes,
          currentSystem,
          currentWaveform,
          customWaveCoefficients,
          isSubharmonic,
          mode: this.mode
        };
      }
      bindExternalEvents() {
        document.addEventListener(DRAWBARS_RESET, () => this.update());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.update());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.update());
        document.addEventListener(DRAWBAR_CHANGE, () => this.update());
        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.update());
        document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.update());
      }
    };
  }
});

// js/modules/downloadControl/DownloadControlComponent.js
var DownloadControlComponent;
var init_DownloadControlComponent = __esm({
  "js/modules/downloadControl/DownloadControlComponent.js"() {
    init_BaseComponent();
    DownloadControlComponent = class extends BaseComponent {
      constructor(selector) {
        super(selector);
        this.onRoutingChange = null;
        this.onDownload = null;
      }
      render({ routingMode }) {
        this.renderRoutingMode({ routingMode });
      }
      renderRoutingMode({ routingMode }) {
        const select = document.getElementById("routing-mode-select");
        if (select) {
          select.value = routingMode;
        }
      }
      bindRenderedEvents() {
        const select = document.getElementById("routing-mode-select");
        if (select) {
          this.bindEvent(select, "change", (e) => {
            this.onRoutingChange?.(e.target.value);
          });
        }
        const downloadBtn = document.getElementById("export-wav-button");
        if (downloadBtn) {
          this.bindEvent(downloadBtn, "click", () => {
            this.onDownload?.();
          });
        }
        const addWaveBtn = document.getElementById("add-wave-button");
        if (addWaveBtn) {
          this.bindEvent(addWaveBtn, "click", () => {
            this.onAddToWaveforms?.();
          });
        }
      }
      setRoutingMode(mode) {
        const select = document.getElementById("routing-mode-select");
        if (select) {
          select.value = mode;
        }
      }
    };
  }
});

// js/modules/downloadControl/downloadControlActions.js
var DownloadControlActions;
var init_downloadControlActions = __esm({
  "js/modules/downloadControl/downloadControlActions.js"() {
    init_audio();
    init_config();
    init_domUtils();
    init_events();
    DownloadControlActions = {
      setRoutingMode(mode) {
        if (AppState.audioRoutingMode !== mode) {
          updateAppState({ audioRoutingMode: mode });
          document.dispatchEvent(new CustomEvent(ROUTING_MODE_CHANGED, { detail: { mode } }));
        }
      },
      handleExportWAV(routingMode, isSubharmonic) {
        sampleCurrentWaveform(routingMode, isSubharmonic).then((sampled) => {
          exportAsWAV(sampled, 1);
        }).catch((error) => {
          console.error("Failed to sample waveform for export:", error);
          showStatus("Failed to sample waveform for export", "error");
        });
      }
    };
  }
});

// js/modules/downloadControl/downloadControlController.js
var DownloadControlController;
var init_downloadControlController = __esm({
  "js/modules/downloadControl/downloadControlController.js"() {
    init_BaseController();
    init_DownloadControlComponent();
    init_downloadControlActions();
    init_config();
    init_events();
    init_waveformActions();
    DownloadControlController = class extends BaseController {
      createComponent(selector) {
        return new DownloadControlComponent(selector);
      }
      getProps() {
        return {
          routingMode: AppState.audioRoutingMode,
          isSubharmonic: AppState.isSubharmonic
        };
      }
      bindComponentEvents() {
        this.component.onRoutingChange = (mode) => {
          DownloadControlActions.setRoutingMode(mode);
        };
        this.component.onDownload = () => {
          const { routingMode, isSubharmonic } = this.getProps();
          DownloadControlActions.handleExportWAV(routingMode, isSubharmonic);
        };
        this.component.onAddToWaveforms = () => {
          const { routingMode, isSubharmonic } = this.getProps();
          handleAddToWaveforms(routingMode, isSubharmonic);
        };
      }
      bindExternalEvents() {
        document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());
      }
    };
  }
});

// js/HelpDialog.js
var HelpDialog;
var init_HelpDialog = __esm({
  "js/HelpDialog.js"() {
    HelpDialog = class {
      static init() {
        const helpBtn = document.getElementById("help-button");
        const modal = document.getElementById("help-modal");
        const closeBtn = document.getElementById("close-help-modal");
        if (!helpBtn || !modal || !closeBtn) return;
        helpBtn.addEventListener("click", () => {
          modal.classList.remove("hidden");
        });
        closeBtn.addEventListener("click", () => {
          modal.classList.add("hidden");
        });
        modal.addEventListener("click", (e) => {
          if (e.target === modal) {
            modal.classList.add("hidden");
          }
        });
        document.addEventListener("keydown", (e) => {
          if (!modal.classList.contains("hidden") && (e.code === "Escape" || e.code === "Enter")) {
            modal.classList.add("hidden");
          }
        });
      }
    };
  }
});

// js/UIStateManager.js
var UIStateManager_exports = {};
__export(UIStateManager_exports, {
  UIStateManager: () => UIStateManager
});
var UIStateManager;
var init_UIStateManager = __esm({
  "js/UIStateManager.js"() {
    init_config();
    init_ui();
    init_audio();
    UIStateManager = class _UIStateManager {
      // Get current AppState
      static getState() {
        return AppState;
      }
      // Set fundamental by MIDI note
      static setFundamentalByMidi(midiNote) {
        const midi = Math.min(127, midiNote);
        const frequency = _UIStateManager.midiToFreq(midi);
        const octave = Math.floor(midi / 12) - 1;
        updateAppState({
          currentMidiNote: midi,
          fundamentalFrequency: frequency,
          currentOctave: octave
        });
        updateFundamentalDisplay();
        updateKeyboardUI();
        updateAudioProperties();
      }
      // Set fundamental by frequency
      static setFundamentalByFrequency(freq) {
        const midi = Math.round(_UIStateManager.freqToMidi(freq));
        _UIStateManager.setFundamentalByMidi(midi);
      }
      // Utility: MIDI <-> Frequency
      static midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
      }
      static freqToMidi(freq) {
        return 69 + 12 * Math.log2(freq / 440);
      }
    };
  }
});

// js/KeyboardShortcuts.js
var KeyboardShortcuts;
var init_KeyboardShortcuts = __esm({
  "js/KeyboardShortcuts.js"() {
    init_drawbarsActions();
    init_ui();
    init_UIStateManager();
    KeyboardShortcuts = class {
      constructor() {
        this.focusedDrawbar = null;
      }
      init() {
        document.addEventListener("keydown", (e) => {
          if (e.code === "Space") {
            e.preventDefault();
            handlePlayToggle();
            return;
          }
          const qwertyKeys = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Backslash"];
          const qwertyIndex = qwertyKeys.indexOf(e.code);
          if (qwertyIndex !== -1) {
            const state = UIStateManager.getState();
            const baseMidi = ((state?.currentOctave ?? 3) + 1) * 12;
            UIStateManager.setFundamentalByMidi(baseMidi + qwertyIndex);
            return;
          }
          const drawbarKeys = [
            "Digit1",
            "Digit2",
            "Digit3",
            "Digit4",
            "Digit5",
            "Digit6",
            "Digit7",
            "Digit8",
            "Digit9",
            "Digit0",
            "Minus",
            "Equal"
          ];
          const drawbarIndex = drawbarKeys.indexOf(e.code);
          if (drawbarIndex !== -1) {
            const drawbars = document.querySelectorAll("#drawbars .drawbar-slider");
            if (drawbars[drawbarIndex]) {
              drawbars[drawbarIndex].focus();
              this.focusedDrawbar = drawbars[drawbarIndex];
            }
            return;
          }
          if (this.focusedDrawbar) {
            const drawbars = document.querySelectorAll("#drawbars .drawbar-slider");
            const currentIndex = parseInt(this.focusedDrawbar.dataset.index);
            if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
              e.preventDefault();
              const delta = e.code === "ArrowLeft" ? -1 : 1;
              const nextIndex = (currentIndex + delta + drawbars.length) % drawbars.length;
              drawbars[nextIndex].focus();
              this.focusedDrawbar = drawbars[nextIndex];
              return;
            }
            if (e.shiftKey && (e.code === "ArrowUp" || e.code === "ArrowDown")) {
              e.preventDefault();
              const value = e.code === "ArrowUp" ? 1 : 0;
              this.focusedDrawbar.value = value.toFixed(2);
              DrawbarsActions.setDrawbar(currentIndex, value);
              return;
            }
            if (e.code === "ArrowUp" || e.code === "ArrowDown") {
              e.preventDefault();
              const step = e.metaKey || e.ctrlKey ? 0.1 : 0.01;
              const newValue = parseFloat(this.focusedDrawbar.value) + (e.code === "ArrowUp" ? step : -step);
              const clamped = Math.max(0, Math.min(1, newValue));
              this.focusedDrawbar.value = clamped.toFixed(2);
              DrawbarsActions.setDrawbar(currentIndex, clamped);
              return;
            }
          }
          if (!this.focusedDrawbar && (e.ctrlKey || e.metaKey)) {
            if (e.code === "ArrowUp") {
              e.preventDefault();
              window.changeOctave?.(1);
            } else if (e.code === "ArrowDown") {
              e.preventDefault();
              window.changeOctave?.(-1);
            }
          }
        });
      }
    };
  }
});

// js/modules/atoms/slider/SliderComponent.js
var SliderComponent;
var init_SliderComponent = __esm({
  "js/modules/atoms/slider/SliderComponent.js"() {
    init_BaseComponent();
    SliderComponent = class extends BaseComponent {
      constructor(target) {
        super(target);
        this.input = null;
        this.labelEl = null;
      }
      /**
       * Render the slider UI
       * @param {object} props - { min, max, step, value, label, onChange }
       */
      render(props = {}) {
        this.teardown();
        this.props = props;
        this.el.innerHTML = "";
        if (props.label) {
          this.labelEl = document.createElement("label");
          this.labelEl.textContent = props.label;
          this.labelEl.className = "slider-label text-blue-300 text-xs md:text-sm font-medium mr-1";
          this.el.appendChild(this.labelEl);
        }
        this.input = document.createElement("input");
        this.input.type = "range";
        this.input.min = props.min ?? 0;
        this.input.max = props.max ?? 1;
        this.input.step = props.step ?? 0.01;
        this.input.value = props.value ?? 0;
        this.input.className = "slider-input w-16 md:w-24 accent-blue-400 bg-transparent rounded h-1 mx-1";
        this.el.appendChild(this.input);
        this.valueDisplay = document.createElement("span");
        this.valueDisplay.className = "slider-value text-blue-300 text-xs md:text-sm font-medium mr-1 min-w-12";
        const formatValue = typeof props.formatValue === "function" ? props.formatValue : (v) => v;
        const displayValue = props.value !== void 0 && props.value !== null ? parseFloat(props.value) : 0;
        this.valueDisplay.textContent = formatValue(displayValue);
        this.el.appendChild(this.valueDisplay);
        if (typeof props.onChange === "function") {
          this.bindEvent(this.input, "input", (e) => {
            const inputValue = e.target.value ?? "";
            const numValue = parseFloat(inputValue);
            this.valueDisplay.textContent = formatValue(numValue);
            props.onChange(numValue);
          });
        }
      }
      teardown() {
        super.teardown();
        this.input = null;
        this.labelEl = null;
        this.valueDisplay = null;
      }
    };
  }
});

// js/modules/atoms/slider/sliderActions.js
var SliderActions;
var init_sliderActions = __esm({
  "js/modules/atoms/slider/sliderActions.js"() {
    SliderActions = {
      clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }
    };
  }
});

// js/modules/atoms/slider/sliderController.js
var SliderController;
var init_sliderController = __esm({
  "js/modules/atoms/slider/sliderController.js"() {
    init_SliderComponent();
    init_sliderActions();
    SliderController = class {
      constructor(selector, props = {}, onChange = null) {
        this.component = new SliderComponent(selector);
        this.props = props;
        this.onChange = onChange;
      }
      init() {
        this.render(this.props);
      }
      render(props = {}) {
        this.props = props;
        this.component.render({
          ...props,
          onChange: (value) => {
            if (typeof this.onChange === "function") {
              this.onChange(value);
            }
          }
        });
      }
      setValue(value) {
        const clamped = SliderActions.clamp(value, this.props.min, this.props.max);
        this.render({ ...this.props, value: clamped });
      }
      teardown() {
        this.component.teardown();
      }
    };
  }
});

// js/modules/tonewheel/TonewheelComponent.js
var TonewheelComponent;
var init_TonewheelComponent = __esm({
  "js/modules/tonewheel/TonewheelComponent.js"() {
    init_BaseComponent();
    TonewheelComponent = class extends BaseComponent {
      constructor(selector) {
        super(selector);
        this.canvasId = "tonewheel-canvas";
      }
      render(props) {
        let container = this.el;
        if (!container) return;
        const oldCanvas = container.querySelector("canvas");
        if (oldCanvas) {
          oldCanvas.remove();
        }
        if (this._p5Instance && this._p5Instance.remove) {
          this._p5Instance.remove();
          this._p5Instance = null;
        }
        const canvas = document.createElement("div");
        canvas.id = this.canvasId;
        container.appendChild(canvas);
        if (props && props.p5Instance) {
          this._p5Instance = props.p5Instance;
          if (this._p5Instance.canvas && this._p5Instance.canvas.parentNode !== canvas) {
            canvas.appendChild(this._p5Instance.canvas);
          }
        }
      }
      teardown() {
        if (this._p5Instance && this._p5Instance.remove) {
          this._p5Instance.remove();
          this._p5Instance = null;
        }
        const canvas = this.el.querySelector(`#${this.canvasId}`);
        if (canvas) {
          canvas.remove();
        }
        super.teardown?.();
      }
    };
  }
});

// js/modules/tonewheel/tonewheelController.js
var spreadSliderController, vizFreqSliderController, TonewheelController;
var init_tonewheelController = __esm({
  "js/modules/tonewheel/tonewheelController.js"() {
    init_config();
    init_sliderController();
    init_BaseController();
    init_TonewheelComponent();
    init_tonewheelActions();
    TonewheelController = class extends BaseController {
      init() {
        super.init();
        spreadSliderController = new SliderController("#spread-slider-root", {
          min: 0,
          max: 1,
          step: 0.01,
          value: AppState.spreadFactor ?? 0.2,
          label: "Gain",
          formatValue: (v) => `${(v * 100).toFixed(0)}%`
        }, (value) => {
          TonewheelActions.setSpreadFactor(value);
        });
        spreadSliderController.init();
        vizFreqSliderController = new SliderController("#viz-freq-slider-root", {
          min: 0.1,
          max: 20,
          step: 0.1,
          value: AppState.visualizationFrequency ?? 1,
          label: "Rate",
          formatValue: (v) => `${v.toFixed(1)} Hz`
        }, (value) => {
          TonewheelActions.setVisualizationFrequency(value);
        });
        vizFreqSliderController.init();
      }
      createComponent(selector) {
        return new TonewheelComponent(selector);
      }
      getProps() {
        let p5Instance = null;
        p5Instance = TonewheelActions.initVisualization();
        return { p5Instance };
      }
      bindComponentEvents() {
      }
      bindExternalEvents() {
      }
    };
  }
});

// js/modules/midi/midiInputRouter.js
var MidiInputRouter;
var init_midiInputRouter = __esm({
  "js/modules/midi/midiInputRouter.js"() {
    init_utils();
    init_drawbarsActions();
    MidiInputRouter = class {
      constructor() {
        this.lastCC = {};
      }
      async init() {
        const midi = await navigator.requestMIDIAccess();
        for (let input of midi.inputs.values()) {
          input.onmidimessage = (msg) => this.route(msg);
        }
      }
      route(msg) {
        const [status, data1, data2] = msg.data;
        const isCC = (status & 240) === 176;
        if (isCC) return this.handleCC(data1, data2);
        const isNoteOn = (status & 240) === 144 && data2 > 0;
        const isNoteOff = (status & 240) === 128 || data2 === 0;
        if (isNoteOn) return this.handleNoteOn(data1, data2);
        if (isNoteOff) return this.handleNoteOff(data1);
      }
      handleCC(cc, val) {
        const norm = val / 127;
        switch (cc) {
          case 7:
            smoothUpdateMasterGain(norm);
            break;
          case 10:
            break;
          default:
            break;
        }
        if (this.lastCC[cc] === val) return;
        this.lastCC[cc] = val;
        if (cc > 19 && cc < 32) {
          DrawbarsActions.setDrawbar(cc - 20, norm);
        }
      }
      handleNoteOn(note, vel) {
      }
      handleNoteOff(note) {
      }
    };
  }
});

// js/ui.js
function initUI() {
  setupMainButtons();
  setupControlSliders();
  setupFundamentalControls();
  setupKeyboard();
  setupWaveformSelector();
  setupDrawbars();
  setupSpectralSystem();
  setupWaveforms();
  setupRoutingControl();
  updateFundamentalDisplay();
  updateKeyboardUI();
  HelpDialog.init();
  new KeyboardShortcuts().init();
  setTimeout(() => {
    new MidiInputRouter().init();
  }, 2e3);
}
function setupDrawbars() {
  drawbarsController = new DrawbarsController("#drawbars");
  drawbarsController.init();
}
function setupSpectralSystem() {
  spectralSystemController = new SpectralSystemController("#spectral-system-root");
  spectralSystemController.init();
  setupTonewheel();
}
function setupTonewheel() {
  tonewheelController = new TonewheelController("#tonewheel-container");
  tonewheelController.init();
}
function setupWaveforms() {
  summedWaveformController = new WaveformController("#waveform-canvas-area");
  summedWaveformController.init();
  waveformController = new WaveformController("#current-waveform-canvas-area", { mode: "single" });
  waveformController.init();
}
function setupRoutingControl() {
  downloadControlController = new DownloadControlController("#routing-control-root");
  downloadControlController.init();
}
function setupMainButtons() {
  setupEventListener("play-toggle", "click", handlePlayToggle);
}
function setupControlSliders() {
  masterGainSliderController = new SliderController("#master-gain-slider-root", {
    min: 0,
    max: 1,
    step: 0.01,
    value: AppState.masterGainValue,
    label: "Gain",
    formatValue: (v) => `${(v * 100).toFixed(0)}%`
  }, (value) => {
    smoothUpdateMasterGain(value);
  });
  masterGainSliderController.init();
  masterSlewSliderController = new SliderController("#master-slew-slider-root", {
    min: 0,
    max: 10,
    step: 0.01,
    value: AppState.masterSlewValue,
    label: "Slew",
    formatValue: (v) => {
      v = parseFloat(v);
      let displayValue = (v * 1e3).toFixed(0);
      let unit = "ms";
      if (v > 1) {
        displayValue = v.toFixed(2);
        unit = "s";
      }
      return `${displayValue}${unit}`;
    }
  }, (value) => {
    updateAppState({ masterSlewValue: value });
  });
  masterSlewSliderController.init();
}
async function handlePlayToggle() {
  const toggle = document.getElementById("play-toggle");
  const playLabel = document.getElementById("play-label");
  if (AppState.isPlaying) {
    stopTone();
    toggle.classList.remove("active");
    toggle.setAttribute("aria-checked", "false");
    playLabel.textContent = "Play";
  } else {
    try {
      await startTone();
      toggle.classList.add("active");
      toggle.setAttribute("aria-checked", "true");
      playLabel.textContent = "Stop";
    } catch (error) {
      console.error("Failed to start tone:", error);
      showStatus("Failed to start audio. Please check browser permissions.", "error");
    }
  }
}
function setupFundamentalControls() {
  const fundamentalInput = document.getElementById("fundamental-input");
  if (fundamentalInput) {
    fundamentalInput.addEventListener("change", handleFundamentalChange);
  }
  setupEventListener("octave-down", "click", () => changeOctave(-1));
  setupEventListener("octave-up", "click", () => changeOctave(1));
}
function handleFundamentalChange(e) {
  let val = parseFloat(e.target.value);
  if (isNaN(val) || val < 0.01 || val > 1e4) {
    showStatus("Frequency must be between 0.01 Hz and 10000 Hz.", "error");
    val = AppState.fundamentalFrequency;
  }
  Promise.resolve().then(() => (init_UIStateManager(), UIStateManager_exports)).then(({ UIStateManager: UIStateManager2 }) => {
    UIStateManager2.setFundamentalByFrequency(val);
    e.target.value = val.toFixed(2);
  });
}
function changeOctave(direction) {
  Promise.resolve().then(() => (init_UIStateManager(), UIStateManager_exports)).then(({ UIStateManager: UIStateManager2 }) => {
    const state = UIStateManager2.getState();
    const newMidiNote = state.currentMidiNote + direction * 12;
    UIStateManager2.setFundamentalByMidi(newMidiNote);
  });
}
function updateFundamentalDisplay() {
  updateValue("fundamental-input", AppState.fundamentalFrequency.toFixed(2));
  updateText("current-octave-display", `Octave ${AppState.currentOctave}`);
}
function setupKeyboard() {
  const keyboard = document.getElementById("piano-keyboard");
  if (!keyboard) return;
  const notes = [
    { name: "C", class: "white", index: 0 },
    { name: "C#", class: "black", index: 1 },
    { name: "D", class: "white", index: 2 },
    { name: "D#", class: "black", index: 3 },
    { name: "E", class: "white", index: 4 },
    { name: "F", class: "white", index: 5 },
    { name: "F#", class: "black", index: 6 },
    { name: "G", class: "white", index: 7 },
    { name: "G#", class: "black", index: 8 },
    { name: "A", class: "white", index: 9 },
    { name: "A#", class: "black", index: 10 },
    { name: "B", class: "white", index: 11 }
  ];
  keyboard.innerHTML = "";
  notes.forEach((note) => {
    const key = document.createElement("div");
    key.className = `key ${note.class}`;
    key.textContent = note.name;
    key.dataset.noteIndex = note.index;
    key.addEventListener("click", () => handleKeyClick(note.index));
    keyboard.appendChild(key);
  });
}
function handleKeyClick(noteIndex) {
  Promise.resolve().then(() => (init_UIStateManager(), UIStateManager_exports)).then(({ UIStateManager: UIStateManager2 }) => {
    const state = UIStateManager2.getState();
    const baseMidi = (state.currentOctave + 1) * 12;
    const newMidi = baseMidi + noteIndex;
    UIStateManager2.setFundamentalByMidi(newMidi);
  });
}
function updateKeyboardUI() {
  const keys = document.querySelectorAll(".key");
  keys.forEach((key) => key.classList.remove("active"));
  let noteIndex = AppState.currentMidiNote % 12;
  if (noteIndex < 0) noteIndex += 12;
  const selectedKey = document.querySelector(`.key[data-note-index="${noteIndex}"]`);
  if (selectedKey) {
    selectedKey.classList.add("active");
  }
}
function updateSystemDescription() {
  updateText("system-description", AppState.currentSystem.description, true);
}
function setupWaveformSelector() {
  const select = document.getElementById("waveform-select");
  if (select) {
    select.addEventListener("change", handleWaveformChange);
  }
}
function updateUI() {
  updateFundamentalDisplay();
  updateKeyboardUI();
  updateSystemDescription();
  const playButton = document.getElementById("play-button");
  if (playButton) {
    playButton.textContent = AppState.isPlaying ? "Stop Tone" : "Start Tone";
    playButton.classList.toggle("playing", AppState.isPlaying);
  }
  updateValue("waveform-select", AppState.currentWaveform);
}
var drawbarsController, spectralSystemController, waveformController, summedWaveformController, downloadControlController, tonewheelController, masterGainSliderController, masterSlewSliderController;
var init_ui = __esm({
  "js/ui.js"() {
    init_config();
    init_domUtils();
    init_drawbarsController();
    init_spectralSystemController();
    init_waveformController();
    init_waveformActions();
    init_downloadControlController();
    init_HelpDialog();
    init_KeyboardShortcuts();
    init_tonewheelController();
    init_audio();
    init_utils();
    init_sliderController();
    init_midiInputRouter();
  }
});

// js/app.js
init_config();
init_momentum_smoother();
init_ui();
init_domUtils();

// js/modules/favicon/faviconService.js
var FaviconService = class {
  constructor() {
    this.interval = null;
    this.faviconId = "dynamic-favicon";
  }
  start() {
    if (this.interval) return;
    this.updateFavicon();
    this.interval = setInterval(() => this.updateFavicon(), 100);
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  updateFavicon() {
    const container = document.getElementById("tonewheel-container");
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    try {
      const size = 128;
      const offscreen = document.createElement("canvas");
      offscreen.width = size;
      offscreen.height = size;
      const ctx = offscreen.getContext("2d");
      const srcW = canvas.width;
      const srcH = canvas.height;
      const cropX = srcW * 0.25;
      const cropY = srcH * 0.25;
      const cropW = srcW * 0.5;
      const cropH = srcH * 0.5;
      ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      this.increaseBrightness(imageData.data, 128);
      this.increaseContrast(imageData.data, 8);
      ctx.putImageData(imageData, 0, 0);
      const url = offscreen.toDataURL("image/png");
      this.setFavicon(url);
    } catch (e) {
    }
  }
  // Increase brightness by adding to each RGB channel
  increaseBrightness(data, amount = 128) {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.max(0, Math.min(255, data[i + c] + amount));
      }
    }
  }
  increaseContrast(data, factor = 1.2) {
    const avgLuminance = 128;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.max(0, Math.min(255, avgLuminance + factor * (data[i + c] - avgLuminance)));
      }
    }
  }
  setFavicon(dataUrl) {
    let link = document.getElementById(this.faviconId);
    if (!link) {
      link = document.createElement("link");
      link.id = this.faviconId;
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = dataUrl;
  }
};
var faviconService = new FaviconService();
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => faviconService.start());
}

// js/app.js
init_audio();
function initApp() {
  try {
    initUI();
    faviconService.start();
    updateUI();
  } catch (error) {
    console.error("Failed to initialize application:", error);
    showStatus("Failed to initialize application. Please refresh the page.", "error");
  }
}
function setupErrorHandling() {
  window.addEventListener("error", (e) => {
    console.error("Application error:", e.error);
    showStatus("An unexpected error occurred. Please check the console.", "error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled promise rejection:", e.reason);
    showStatus("A promise was rejected. Please check the console.", "error");
  });
}
function cleanup() {
  try {
    momentumSmoother.clear();
    if (AppState.isPlaying && AppState.audioContext) {
      AppState.oscillators.forEach((node) => {
        if (node.osc) {
          node.osc.stop();
          node.osc.disconnect();
          node.gainNode.disconnect();
        }
      });
    }
    if (AppState.audioContext && AppState.audioContext.state !== "closed") {
      AppState.audioContext.close();
    }
    console.log("Application cleaned up successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}
function setupCleanup() {
  window.addEventListener("beforeunload", cleanup);
  window.addEventListener("pagehide", cleanup);
}
function checkCompatibility() {
  const issues = [];
  if (!window.AudioContext && !window.webkitAudioContext) {
    issues.push("Web Audio API not supported");
  }
  if (!window.Promise) {
    issues.push("ES6 Promises not supported");
  }
  if (issues.length > 0) {
    const message = `Browser compatibility issues: ${issues.join(", ")}. Please use a modern browser.`;
    showStatus(message, "error");
    console.error(message);
    return false;
  }
  if (!navigator.requestMIDIAccess) {
    const message = "Web MIDI API not supported in this browser. MIDI functionality will be disabled.";
    showStatus(message, "warning");
    console.warn(message);
  }
  return true;
}
function startup() {
  setupErrorHandling();
  if (!checkCompatibility()) {
    return;
  }
  setupCleanup();
  initApp();
}
window.TWIG = {
  // State access
  getState: () => AppState,
  getAudioCtx: () => getAudioEngine().getContext(),
  // Module access (for debugging)
  updateUI,
  // Utility functions
  showStatus,
  // Manual cleanup
  cleanup
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startup);
} else {
  startup();
}
