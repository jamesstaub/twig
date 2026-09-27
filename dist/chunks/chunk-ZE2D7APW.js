var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// js/config.js
var DEFAULT_PARTIAL_START = 1;
var DEFAULT_PARTIAL_END = 12;
var START_HARMONIC_MAX = 64;
var DEFAULT_STIFFNESS_B = 1e-3;
var STIFFNESS_B_MAX = 0.1;
var DEFAULT_TUBE_CLOSEDNESS = 1;
var DEFAULT_STRETCH_A = 2.1;
var STRETCH_A_MIN = 2;
var STRETCH_A_MAX = 3;
var DEFAULT_COMPRESS_A = 1.9;
var COMPRESS_A_MIN = 1.5;
var COMPRESS_A_MAX = 2;
var PHI = (1 + Math.sqrt(5)) / 2;
function range(start, end, step = 1) {
  const out = [];
  for (let v = start; v <= end + 1e-9; v += step) out.push(v);
  return out;
}
function harmonicSeries(start = DEFAULT_PARTIAL_START, end = DEFAULT_PARTIAL_END) {
  return range(start, end);
}
function stretchedSpectrum(A, start, end) {
  const exp = Math.log2(A);
  return range(start, end).map((n) => Math.pow(n, exp));
}
function stiffString(B, start, end) {
  const f = (n) => n * Math.sqrt(1 + B * n * n);
  return range(start, end).map((n) => f(n) / f(1));
}
function freeBar(start, end) {
  const kL = [4.7300408, 7.8532046, 10.9956078, 14.1371655, 17.2787597];
  while (kL.length < end) kL.push((2 * (kL.length + 1) + 1) * Math.PI / 2);
  return range(start, end).map((n) => Math.pow(kL[n - 1] / kL[0], 2));
}
function acousticTube(closedness, start, end) {
  const f = (n) => n - closedness / 2;
  return range(start, end).map((n) => f(n) / f(1));
}
function combinationTones(a, b, start, count) {
  const maxCoeff = 6 + start;
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
  return ratios.map((r) => r.toFixed(digits).replace(/\.?0+$/, ""));
}
function generative(def) {
  return { ...def, ...def.generate(DEFAULT_PARTIAL_START) };
}
var OTONALITY_PARTIALS = [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 21, 22];
var OTONALITY = OTONALITY_PARTIALS.map((n) => n / 8);
var spectralSystems = [
  generative({
    name: "Harmonic Series",
    description: '<b>Canonical.</b> Exact integer partials \u2014 the spectrum of bowed, blown, and sung tones, and the reference point for every other system here. See <a href="https://en.wikipedia.org/wiki/Harmonic_series_(music)">Harmonic series (Wikipedia)</a>.',
    generate(start) {
      const ratios = harmonicSeries(start, start + 11);
      return { ratios, labels: ratios.map((n) => `${n}:1`) };
    }
  }),
  generative({
    name: "Odd Harmonics",
    description: "<b>Canonical.</b> Odd partials only (1, 3, 5, \u2026) \u2014 the clarinet / closed-pipe / square-wave family. Also the natural companion timbre for the Bohlen\u2013Pierce system below, which was derived from odd partials of the tritave.",
    generate(start) {
      const ratios = range(start, start + 11).map((n) => 2 * n - 1);
      return { ratios, labels: ratios.map((n) => `${n}:1`) };
    }
  }),
  generative({
    name: "Stretched Spectrum (Sethares)",
    description: '<b>Designed, research-based.</b> Partial n falls at n<sup>log\u2082 A</sup> with the pseudo-octave A dialed above 2 \u2014 true octaves beat while the stretched octave stays pure. A = 2.1 is Sethares\u2019 classic timbre from <i>Tuning, Timbre, Spectrum, Scale</i>: a spectrum and the scale at its dissonance minima define each other. See <a href="https://sethares.engr.wisc.edu/consemi.html">Relating Tuning and Timbre</a> and <a href="https://en.xen.wiki/w/Xentimbre">xentimbre</a>.',
    params: ["stretchA"],
    generate(start, { stretchA = DEFAULT_STRETCH_A } = {}) {
      const ratios = stretchedSpectrum(stretchA, start, start + 11);
      return { ratios, labels: decimalLabels(ratios) };
    }
  }),
  generative({
    name: "Compressed Spectrum (Sethares)",
    description: "<b>Designed, research-based.</b> The mirror of the stretched spectrum: partial n at n<sup>log\u2082 A</sup> with the pseudo-octave A dialed below 2. Darker and more clustered than harmonic; its natural scale is compressed the same way. A = 1.9 is the classic mirror of Sethares\u2019 stretched timbre.",
    params: ["compressA"],
    generate(start, { compressA = DEFAULT_COMPRESS_A } = {}) {
      const ratios = stretchedSpectrum(compressA, start, start + 11);
      return { ratios, labels: decimalLabels(ratios) };
    }
  }),
  generative({
    name: "Stiff String (Piano Inharmonicity)",
    description: "<b>Physical model.</b> f<sub>n</sub> = n\xB7\u221A(1 + Bn\xB2): string stiffness sharpens upper partials progressively \u2014 the reason pianos are stretch-tuned. Real midrange pianos measure B \u2248 0.0001\u20130.001; raise it for exaggerated bell-piano hybrids.",
    params: ["stiffnessB"],
    // per-system dials (see SYSTEM_PARAM_DIALS)
    generate(start, { stiffnessB = DEFAULT_STIFFNESS_B } = {}) {
      const ratios = stiffString(stiffnessB, start, start + 11);
      return { ratios, labels: decimalLabels(ratios, 3) };
    }
  }),
  generative({
    name: "Free Bar (Glockenspiel / Saron)",
    description: "<b>Physical model.</b> Transverse modes of a free metal bar: 1, 2.76, 5.40, 8.93, 13.34\u2026 \u2014 the true metallic-clang spectrum of glockenspiels, chimes, and gamelan saron-family bars. Per Sethares, this is the timbre family from which slendro-like tunings emerge.",
    generate(start) {
      const ratios = freeBar(start, start + 7);
      return { ratios, labels: decimalLabels(ratios) };
    }
  }),
  {
    name: "Gamelan Bonang (Measured)",
    description: '<b>Measured.</b> Sethares\u2019 field measurement of a bonang gong: partials at 1, 1.52, 3.46, 3.92. The slendro scale falls out of this spectrum\u2019s dissonance minima. See <a href="https://searchingfornewsound.blogspot.com/2022/05/gamelan-tuning-and-instrumental-spectra.html">gamelan tuning &amp; instrumental spectra</a>.',
    ratios: [1, 1.52, 3.46, 3.92],
    labels: decimalLabels([1, 1.52, 3.46, 3.92])
  },
  {
    name: "Church Bell (Minor-Third Bell)",
    description: '<b>Measured, idealized profile.</b> The harmonically tuned bell: hum \xBD, prime 1, tierce 6/5, quint 3/2, nominal 2, then upper partials to the octave nominal. The minor-third tierce is what makes a bell sound like a bell. See <a href="https://www.hibberts.co.uk/basic-principles-of-bell-tuning/">Hibberts \u2014 bell tuning</a>.',
    ratios: [1 / 2, 1 / 1, 6 / 5, 3 / 2, 2 / 1, 5 / 2, 3 / 1, 4 / 1],
    labels: ["hum", "prime", "tierce", "quint", "nom.", "deciem", "s.quint", "oct.nom"]
  },
  generative({
    name: "Golden Ratio (Chowning, Stria)",
    description: '<b>Designed, historical.</b> Partials at powers of \u03C6 \u2248 1.618 \u2014 the spectrum of Chowning\u2019s <i>Stria</i> (1977). Self-reinforcing: the difference between adjacent partials is itself a partial (\u03C6<sup>n+1</sup> \u2212 \u03C6<sup>n</sup> = \u03C6<sup>n\u22121</sup>), so intermodulation stays inside the spectrum. See <a href="https://geometrycode.com/golden-ratio-and-sound-john-chowning-synthesis/">Chowning and the golden ratio</a>.',
    generate(start) {
      const exponents = range(start, start + 7).map((n) => n - 1);
      return {
        ratios: exponents.map((k) => Math.pow(PHI, k)),
        labels: exponents.map((k) => k === 0 ? "1" : `\u03C6^${k}`)
      };
    }
  }),
  generative({
    name: "Ring-Mod Spectrum (1 \xD7 \u221A2)",
    description: '<b>Designed, spectralist technique.</b> Sum tones m + n\xB7\u221A2 of two generators a tritone apart \u2014 the ring-modulation / combination-tone spectra Grisey and Murail built harmony from (cf. <a href="https://en.wikipedia.org/wiki/Partiels">Partiels</a>). Inharmonic but internally coherent.',
    generate(start) {
      const ratios = combinationTones(1, Math.SQRT2, start, 12);
      return { ratios, labels: decimalLabels(ratios) };
    }
  }),
  {
    name: "Otonality on 8 (Partch, 11-limit)",
    description: '<b>Historical, Partch.</b> Harmonics 8\u201322 (11-limit products only) rooted on the 8th partial \u2014 Partch\u2019s otonality, the overtone half of his tonality diamond. Flip the Subharmonic toggle for the utonality mirror: that duality <i>is</i> the diamond. See <a href="https://en.wikipedia.org/wiki/Otonality_and_utonality">Otonality and utonality</a>.',
    ratios: OTONALITY,
    labels: OTONALITY_PARTIALS.map((n) => `${n}/8`)
  },
  generative({
    name: "Bohlen\u2013Pierce (13-EDT)",
    description: '<b>Designed, scale-as-spectrum.</b> 13 equal divisions of the tritave (3:1), each step 3<sup>1/13</sup>. Strictly a scale used as a spectrum \u2014 BP was derived from odd partials 3:5:7, so try it with the Odd Harmonics character in mind. See <a href="https://en.wikipedia.org/wiki/Bohlen%E2%80%93Pierce_scale">Bohlen\u2013Pierce (Wikipedia)</a>.',
    generate(start) {
      const exponents = range(start, start + 12).map((n) => n - 1);
      return {
        ratios: exponents.map((k) => Math.pow(3, k / 13)),
        labels: exponents.map((k) => k === 0 ? "1/1" : `3^(${k}/13)`)
      };
    }
  }),
  {
    name: "Hammond \u2014 Standard 9 Drawbars",
    description: "<b>Historical.</b> Canonical Hammond single-manual drawbar mapping (left\u2192right): 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1' \u2014 each a harmonic/aliquot of the fundamental. The classic additive palette of B-3 / tonewheel organs.",
    ratios: [1 / 2, 3 / 2, 1 / 1, 2 / 1, 3 / 1, 4 / 1, 5 / 1, 6 / 1, 8 / 1],
    labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
    notes: "Hammond drawbars intentionally sample selected harmonics (sub-octave through high partials); the 7th harmonic is omitted in the classic tonewheel mapping."
  },
  {
    name: "Hammond \u2014 Worn Tonewheels (Detuned)",
    description: "<b>Designed.</b> The standard Hammond drawbar set with small progressive detunes modeling mechanical imperfection and tonewheel wear \u2014 slow beating and organic instability.",
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
    labels: ["1/2", "3/2", "1/1", "2/1", "3/1", "4/1", "5/1", "6/1", "8/1"],
    notes: "Detune multipliers are small fractional offsets (e.g. 8/10000 \u2248 0.8\u2030). Artistic suggestions \u2014 increase offsets for stronger beating."
  },
  {
    name: "Pipe Organ \u2014 Principal Chorus",
    description: "<b>Historical.</b> Common principal stops (footages) of an organ chorus: 16', 8', 4', 2', 1' \u2014 octave-related ranks in powers of two. Base palette for a church-organ sound; add the Cornet mutations below for color.",
    ratios: [1 / 2, 1 / 1, 2 / 1, 4 / 1, 8 / 1],
    labels: ["1/2", "1/1", "2/1", "4/1", "8/1"]
  },
  {
    name: "Cornet V (Baroque Mutations)",
    description: "<b>Historical.</b> The classic five-rank Cornet: 8\u2032 + 4\u2032 + 2\u2154\u2032 (Nazard) + 2\u2032 + 1\u2157\u2032 (Tierce) \u2014 literally harmonics 1\u20135 of the 8\u2032 fundamental. Mutation stops speaking at non-octave partials are essential to historical organ color.",
    ratios: [1, 2, 3, 4, 5],
    labels: ["8\u2032", "4\u2032", "2\u2154\u2032", "2\u2032", "1\u2157\u2032"]
  },
  // Appended last: /twig/system addresses systems by index, so new
  // systems must not renumber existing ones
  generative({
    name: "Acoustic Tube (Boundary Conditions)",
    description: "<b>Physical model.</b> Standing waves in a pipe: open at both ends (f<sub>n</sub> = nv/2L \u2014 every harmonic, the flute) or closed at one end (f<sub>n</sub> = nv/4L, odd harmonics only \u2014 the clarinet; the closed end forces a node). The dial sweeps the far-end boundary between them: a partially stopped pipe whose even modes slide continuously into the odd positions.",
    params: ["tubeClosedness"],
    generate(start, { tubeClosedness = DEFAULT_TUBE_CLOSEDNESS } = {}) {
      const ratios = acousticTube(tubeClosedness, start, start + 11);
      return { ratios, labels: decimalLabels(ratios) };
    }
  })
];
function systemWithStart(index, startHarmonic = 1, options = {}) {
  const base = spectralSystems[index];
  if (!base?.generate) return base;
  return { ...base, ...base.generate(startHarmonic, options) };
}
var MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var DEFAULT_FUNDAMENTAL = 130.81;
var DEFAULT_MIDI_NOTE = 48;
var DEFAULT_OCTAVE = 3;
var BASE_OCTAVE_MIDI = 48;
var WAVETABLE_SIZE = 4096;
var SOURCE_MODES = ["oscillators", "adc", "soundfile", "pink", "white"];
var SOUNDFILE_MODES = ["mono", "poly"];
var FILTER_TYPES = ["lowpass", "bandpass", "highpass"];
var DEFAULT_FILTER_TYPE = FILTER_TYPES[0];
var FILTER_BANK_Q = 30;
var IR_RING_MAX_SECONDS = 4;
var NUM_HARMONICS = spectralSystems[0].ratios.length;
var DEFAULT_MASTER_GAIN = 0.3;
var DEFAULT_MASTER_SLEW = 0.01;
var ENVELOPE_DEFAULTS = { a: 0.01, d: 0.15, s: 0.7, r: 0.4 };
var VISUAL_HARMONIC_TERMS = 12;
var CANVAS_HEIGHT_RATIOS = {
  RADIAL: 0.75,
  OSCILLOSCOPE: 0.25
};
var AppState = {
  // Routing mode for audio export
  audioRoutingMode: "mono",
  // Audio properties
  masterGainValue: DEFAULT_MASTER_GAIN,
  masterSlewValue: DEFAULT_MASTER_SLEW,
  fundamentalFrequency: DEFAULT_FUNDAMENTAL,
  currentMidiNote: DEFAULT_MIDI_NOTE,
  currentOctave: DEFAULT_OCTAVE,
  isPlaying: false,
  // Signal source: oscillator bank, or an external signal played through
  // the per-voice chains as a resonant filter bank
  sourceMode: "oscillators",
  // see SOURCE_MODES
  adcDeviceId: null,
  // audio input device (null = system default)
  adcChannel: 0,
  // 0-based channel within the input stream
  soundfileName: null,
  // display only; the buffer lives in SourceManager
  // Sound-file source (how it plays — mono/poly, tuning — is app config,
  // appConfig.js soundfileConfig). loop=false makes the file a one-shot
  // that the ADSR triggers restart; the fundamental (Hz) tunes poly
  // players, null = detected (a file of ≤ 1 s is taken as one period).
  soundfileLoop: true,
  soundfileFundamental: null,
  // The part of the file that plays/loops: [start, end] as 0-1 fractions
  // of its length, or null for the whole file
  soundfileRange: null,
  // Per-overtone convolution sends, sparse objects keyed by voice index:
  // { wet 0-1, feedback 0-0.99, gain -1..1, ir: IRManager key | null }
  oscillatorConvolutions: {},
  // "Create IR" ring time in seconds: 0 bakes one loop of the timbre;
  // longer tiles the loop with an exponential decay (−60 dB at the end),
  // turning the IR into a modal resonator that rings like a struck bar
  irRingSeconds: 0,
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
    const amplitudes = Array(NUM_HARMONICS).fill(0);
    amplitudes[0] = 1;
    return amplitudes;
  })(),
  isSubharmonic: false,
  currentWaveform: "square",
  // A preset crossfade between two waveforms: { a, b, t } (names, 0-1)
  // while one is in progress, else null. currentWaveform is then the
  // nearer endpoint — what the picker, the bake and the bridge see.
  waveformMorph: null,
  // Per-overtone cycle gates and filters, sparse objects keyed by
  // partial index. Gate: { mode: 0 off | 1 alternating | 2 euclidean |
  // 3 probability, x, y }. Filter: { multiplier (1-based partial index into
  // the current system, applied to the voice's OWN pitch; <= 0 open), q,
  // type (see FILTER_TYPES; the shape it takes once a cutoff is set) }.
  oscillatorGates: {},
  oscillatorFilters: {},
  // Per-overtone overdrive before the filter, sparse by index: amount
  // 0-5 (0 = clean bypass, 1 = full tanh saturation, up to 5 = hard clip).
  oscillatorDrives: {},
  // Envelope mode: 'open' (every voice sounds freely — the classic organ
  // behavior) or 'adsr' (voices rest silent; keyboard/pad triggers gate
  // each voice's ADSR: keydown = attack→decay→sustain, keyup = release).
  envelopeMode: "open",
  // Per-overtone ADSR, sparse by index: { a, d, r } seconds, { s } 0-1.
  // Unset voices fall back to ENVELOPE_DEFAULTS in the getter.
  oscillatorEnvelopes: {},
  // Per-overtone pulse outputs, sparse objects keyed by partial index:
  // { midi: bool, osc: bool, offset: bool }. Pulses fire once per
  // oscillator cycle (audible-gate cycles only) while the voice is
  // <= 50 Hz — at the cycle's start, or at 50% of it with `offset`.
  oscillatorPulseOuts: {},
  // Per-overtone sequencer (1:1 with voices for now), sparse by index:
  // { shape: waveform name (same options as the oscillator menu),
  //   amounts: { gain: 0-1, freq: -1..1 (partial-index span), res: 0-1 } }
  oscillatorSequencers: {},
  // Which overtone (index) drives the MIDI clock output; null = none.
  // Exclusive — at most one at a time.
  midiClockVoice: null,
  // Performance recorder RUNTIME (its configuration — audio/MIDI/tempo/
  // length modes — lives in appConfig.js). status: idle | armed |
  // recording; transport: stopped | playing | paused, for the selected
  // recording. Recordings themselves are session-only (RecordingStore).
  recorder: {
    status: "idle",
    selected: null,
    transport: "stopped"
  },
  // Visualization properties
  visualizationFrequency: 5.25,
  spreadFactor: 0.2,
  // Custom waveforms
  customWaveCount: 0,
  // P5 instance reference
  p5Instance: null
};
function updateAppState(updates) {
  Object.assign(AppState, updates);
}
function getCurrentSystem() {
  return AppState.currentSystem;
}
function currentSystemOptions() {
  return {
    stiffnessB: AppState.stiffnessB,
    tubeClosedness: AppState.tubeClosedness,
    stretchA: AppState.stretchA,
    compressA: AppState.compressA
  };
}
function setCurrentSystem(systemIndex) {
  AppState.currentSystemIndex = systemIndex;
  AppState.currentSystem = systemWithStart(systemIndex, AppState.startHarmonic, currentSystemOptions());
}
function seriesStepAt(step) {
  const system = AppState.currentSystem;
  const ratios = system?.ratios || [1];
  const labels = system?.labels || [];
  const n = Math.max(1, Math.round(step));
  if (n <= ratios.length) {
    return { ratio: Math.abs(ratios[n - 1]) || 1, label: labels[n - 1] ?? `${n}` };
  }
  if (system.generate) {
    const partial = (AppState.startHarmonic || DEFAULT_PARTIAL_START) + n - 1;
    const extended = system.generate(partial, currentSystemOptions());
    return {
      ratio: Math.abs(extended.ratios[0]) || 1,
      label: extended.labels[0] ?? `${partial}`
    };
  }
  const count = ratios.length;
  const last = Math.abs(ratios[count - 1]) || 1;
  const prev = count > 1 ? Math.abs(ratios[count - 2]) || 1 : 1;
  const interval = last > prev && prev > 0 ? last / prev : 2;
  return { ratio: last * Math.pow(interval, n - count), label: `+${n - count}` };
}
function getHarmonicAmplitude(index) {
  return AppState.harmonicAmplitudes[index] || 0;
}
function setHarmonicAmplitude(index, amplitude) {
  if (index >= 0 && index < AppState.harmonicAmplitudes.length) {
    AppState.harmonicAmplitudes[index] = amplitude;
  }
}

export {
  __export,
  DEFAULT_PARTIAL_START,
  DEFAULT_PARTIAL_END,
  START_HARMONIC_MAX,
  DEFAULT_STIFFNESS_B,
  STIFFNESS_B_MAX,
  DEFAULT_TUBE_CLOSEDNESS,
  DEFAULT_STRETCH_A,
  STRETCH_A_MIN,
  STRETCH_A_MAX,
  DEFAULT_COMPRESS_A,
  COMPRESS_A_MIN,
  COMPRESS_A_MAX,
  spectralSystems,
  systemWithStart,
  MIDI_NOTE_NAMES,
  DEFAULT_FUNDAMENTAL,
  DEFAULT_MIDI_NOTE,
  DEFAULT_OCTAVE,
  BASE_OCTAVE_MIDI,
  WAVETABLE_SIZE,
  SOURCE_MODES,
  SOUNDFILE_MODES,
  FILTER_TYPES,
  DEFAULT_FILTER_TYPE,
  FILTER_BANK_Q,
  IR_RING_MAX_SECONDS,
  NUM_HARMONICS,
  DEFAULT_MASTER_GAIN,
  DEFAULT_MASTER_SLEW,
  ENVELOPE_DEFAULTS,
  VISUAL_HARMONIC_TERMS,
  CANVAS_HEIGHT_RATIOS,
  AppState,
  updateAppState,
  getCurrentSystem,
  currentSystemOptions,
  setCurrentSystem,
  seriesStepAt,
  getHarmonicAmplitude,
  setHarmonicAmplitude
};
