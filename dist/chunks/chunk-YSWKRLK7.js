import {
  AppState,
  ENVELOPE_DEFAULTS,
  MIDI_NOTE_NAMES,
  WAVETABLE_SIZE,
  seriesStepAt,
  updateAppState
} from "./chunk-ZE2D7APW.js";

// js/events.js
var DRAWBAR_CHANGE = "drawbar-change";
var DRAWBARS_RANDOMIZED = "drawbars-randomized";
var DRAWBARS_RESET = "drawbars-reset";
var SPECTRAL_SYSTEM_CHANGED = "spectral-system-changed";
var SUBHARMONIC_TOGGLED = "subharmonic-toggled";
var ROUTING_MODE_CHANGED = "routing-mode-changed";
var FUNDAMENTAL_CHANGED = "fundamental-changed";
var PLAY_STATE_CHANGED = "play-state-changed";
var MASTER_GAIN_CHANGED = "master-gain-changed";
var MASTER_SLEW_CHANGED = "master-slew-changed";
var OVERTONE_SIGNAL_CHANGED = "overtone-signal-changed";
var ENVELOPE_MODE_CHANGED = "envelope-mode-changed";
var MIDI_OUTPUT_CHANGED = "midi-output-changed";
var MIDI_PORTS_CHANGED = "midi-ports-changed";
var PULSE = "overtone-pulse";
var SOURCE_CHANGED = "source-changed";
var CONVOLUTION_IRS_CHANGED = "convolution-irs-changed";
var IR_RING_CHANGED = "ir-ring-changed";
var RECORDER_CHANGED = "recorder-changed";
var RECORDINGS_CHANGED = "recordings-changed";
var LIBRARY_CHANGED = "library-changed";
var PRESETS_CHANGED = "presets-changed";
var LAYOUT_MODE_CHANGED = "layout-mode-changed";
var SURFACE_CHANGED = "surface-changed";
var INSPECTOR_CHANGED = "inspector-changed";
var LINK_ALL_CHANGED = "link-all-changed";
var SHAPE_MODE_CHANGED = "shape-mode-changed";

// js/appConfig.js
var MIDI_RANGE_SPAN = 12;
var midiConfig = {
  // --- Ports ---
  // One input port for everything inbound; null = listen on every input
  inputId: null,
  // One output port for note out; null = first available
  outputId: null,
  // Port for MIDI clock ticks and transport start/stop; null = same port
  // as note out. Clock messages are system-realtime — no channel exists.
  clockOutputId: null,
  // Every inbound concern has its own channel (1-16). The defaults keep an
  // in/out loop on one port (e.g. IAC) from feeding back: pulses leave on
  // channel 2 from note 13, above the trigger range, and the fundamental
  // listens on channel 1.
  // --- Fundamental note in: the whole note range sets the fundamental ---
  fundamentalChannel: 1,
  fundamentalTranspose: 0,
  // octaves added to the incoming note
  // --- ADSR trigger note in: start..start+11 gate overtones 1..12 ---
  triggerChannel: 2,
  triggerNoteStart: 1,
  // --- CC in: each start..start+11 drives overtones 1..12 ---
  ccChannel: 1,
  gainCCStart: 20,
  cutoffCCStart: 40,
  convWetCCStart: 102,
  // One CC sweeps the preset crossfader (A → B over its 128 values)
  crossfaderCC: 1,
  // --- Note out (overtone LF pulse blips): start..start+11 ---
  pulseChannel: 2,
  pulseNoteStart: 13,
  // Global master switches for the two pulse paths
  pulseMidiEnabled: true,
  pulseOscEnabled: true
};
var recorderConfig = {
  audioMode: "stereo",
  midiMode: "single",
  tempoMode: "fixed",
  lengthMode: "manual",
  videoEnabled: false,
  videoSize: "medium"
};
var presetConfig = {
  slotA: null,
  slotB: null,
  position: 0
};
var soundfileConfig = {
  mode: "poly",
  tune: true
};
var STORAGE_KEY = "twig.appConfig";
function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      midi: { ...midiConfig },
      recorder: { ...recorderConfig },
      presets: { ...presetConfig },
      soundfile: { ...soundfileConfig }
    }));
  } catch {
  }
}
var pending = null;
function persistAppConfig() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    write();
  }, 250);
}
function loadAppConfig() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return;
  }
  if (!saved || typeof saved !== "object") return;
  applyKnown(midiConfig, saved.midi);
  applyKnown(recorderConfig, saved.recorder);
  applyKnown(presetConfig, saved.presets);
  applyKnown(soundfileConfig, saved.soundfile);
}
function applyKnown(target, source) {
  if (!source || typeof source !== "object") return;
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue;
    const value = source[key];
    if (Array.isArray(target[key]) && !Array.isArray(value)) continue;
    target[key] = value;
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
      write();
    }
  });
}

// js/momentum-smoother.js
var MomentumSmoother = class {
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
var momentumSmoother = new MomentumSmoother();

// js/utils.js
function freqToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = (midi % 12 + 12) % 12;
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
  const systemName = AppState.currentSystem.name.replace(/[^a-zA-Z0-9_]/g, "");
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
function getVoicePan(index) {
  const pans = AppState.oscillatorPans || [];
  const stored = pans[index];
  if (typeof stored === "number") return stored;
  return index === 0 ? 0 : index % 2 === 0 ? -0.8 : 0.8;
}
function formatFrequency(hz) {
  return hz.toFixed(hz >= 1e4 ? 0 : hz >= 100 ? 1 : 2);
}
function formatHz(hz) {
  return `${formatFrequency(hz)} Hz`;
}
function calculateFrequency(ratio) {
  if (AppState.isSubharmonic) {
    return ratio === 0 ? 0 : AppState.fundamentalFrequency / ratio;
  } else {
    return AppState.fundamentalFrequency * ratio;
  }
}
function smoothUpdateHarmonicAmplitude(index, value, immediate = false) {
  AppState.harmonicAmplitudes[index] = value;
  updateHarmonicAmplitude(index, immediate ? 5e-3 : void 0);
}
function smoothUpdateMasterGain(value) {
  AppState.masterGainValue = value;
  updateAudioProperties();
  document.dispatchEvent(new CustomEvent(MASTER_GAIN_CHANGED, { detail: { value } }));
}
var pendingSystemIndex = null;
function smoothUpdateSystem(systemIndex, onComplete = null) {
  pendingSystemIndex = systemIndex;
  momentumSmoother.debounce("systemChange", 35, async () => {
    const idx = pendingSystemIndex;
    if (idx === null) return;
    const { setCurrentSystem } = await import("./config-JLWLBCTH.js");
    const { updateAudioProperties: updateAudioProperties2 } = await import("./audio-PDEMFJXY.js");
    setCurrentSystem(idx);
    if (AppState.isPlaying) {
      updateAudioProperties2();
    }
    if (onComplete) onComplete();
    pendingSystemIndex = null;
  });
}

// js/dsp/WaveformGenerator.js
var WaveformGenerator = class _WaveformGenerator {
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

// js/dsp/WAVExporter.js
var WAVExporter = class _WAVExporter {
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
  /**
   * Interleaved RIFF/WAVE bytes. 16-bit PCM by default; `{ float: true }`
   * writes 32-bit IEEE float (format 3) — no clipping, for takes that
   * may exceed full scale (pre-limiter stems). `gain` scales every
   * sample on the way out (e.g. a common normalization factor).
   */
  static createWAVBufferMulti(channelBuffers, sampleRate, { float = false, gain = 1 } = {}) {
    const numChannels = channelBuffers.length;
    const numFrames = channelBuffers[0].length;
    const bytesPerSample = float ? 4 : 2;
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
    view.setUint16(offset, float ? 3 : 1, true);
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
        if (float) {
          view.setFloat32(offset, channelBuffers[ch][i] * gain, true);
        } else {
          const sample = Math.max(-1, Math.min(1, channelBuffers[ch][i] * gain));
          view.setInt16(offset, sample * 32767, true);
        }
        offset += bytesPerSample;
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
  static downloadFile(arrayBuffer, filename, mimeType = "audio/wav") {
    const blob = new Blob([arrayBuffer], { type: mimeType });
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

// js/dsp/WavetableManager.js
var WavetableManager = class {
  constructor() {
    this.waveforms = /* @__PURE__ */ new Map();
    this.coefficients = /* @__PURE__ */ new Map();
    this.periodMultipliers = /* @__PURE__ */ new Map();
    this.names = /* @__PURE__ */ new Map();
    this.count = 0;
    this.ctx = null;
  }
  /**
   * The context PeriodicWaves are built on. Set when the engine starts;
   * anything adopted before then is built on first use.
   */
  useContext(ctx) {
    this.ctx = ctx;
  }
  /**
   * Take a stored waveform (assetLibrary) without building it yet: at
   * boot there is no AudioContext, and the menus only need to know it
   * exists. The PeriodicWave is made when something first plays it.
   */
  adopt(key, { real, imag, periodMultiplier = 1, name = "" }) {
    this.coefficients.set(key, { real, imag });
    this.periodMultipliers.set(key, periodMultiplier);
    this.names.set(key, name);
    this.count++;
  }
  /** Stored waveforms, oldest first: { key, name }. */
  list() {
    return [...this.coefficients.keys()].map((key) => ({ key, name: this.names.get(key) || "" }));
  }
  /** What the menus call this waveform. */
  name(key) {
    return this.names.get(key) || "";
  }
  setName(key, name) {
    if (this.coefficients.has(key)) this.names.set(key, name);
  }
  /** Forget a waveform (the library deleted it). */
  remove(key) {
    this.waveforms.delete(key);
    this.coefficients.delete(key);
    this.periodMultipliers.delete(key);
    this.names.delete(key);
  }
  /**
   * Stores a baked spectrum as a PeriodicWave.
   * @param {Float32Array} real - Real Fourier coefficients
   * @param {Float32Array} imag - Imaginary Fourier coefficients
   * @param {AudioContext} context
   * @param {number} periodMultiplier - Fundamental periods the table spans
   * @returns {string} Unique key for the stored waveform
   */
  addFromSpectrum(real, imag, context, periodMultiplier = 1, key = null, name = "") {
    this.ctx = this.ctx || context;
    this.count++;
    const id = key || `custom_${Date.now()}_${this.count}`;
    this.waveforms.set(id, context.createPeriodicWave(real, imag, { disableNormalization: false }));
    this.coefficients.set(id, { real, imag });
    this.periodMultipliers.set(id, periodMultiplier);
    this.names.set(id, name);
    return id;
  }
  /**
   * Is this waveform in the session's library? True for a stored bake
   * whose PeriodicWave has not been built yet (that needs a context).
   */
  has(key) {
    return Boolean(key) && this.coefficients.has(key);
  }
  /**
   * @param {string} key
   * @returns {PeriodicWave|null} built on first use for adopted waveforms
   */
  getWaveform(key) {
    const built = this.waveforms.get(key);
    if (built) return built;
    const coeffs = this.coefficients.get(key);
    if (!coeffs || !this.ctx) return null;
    const wave = this.ctx.createPeriodicWave(coeffs.real, coeffs.imag, { disableNormalization: false });
    this.waveforms.set(key, wave);
    return wave;
  }
  /**
   * @param {string} key
   * @returns {{real: Float32Array, imag: Float32Array}|null}
   */
  getCoefficients(key) {
    return this.coefficients.get(key) || null;
  }
  /**
   * @param {string} key
   * @returns {number} Period multiplier (1 for unknown keys)
   */
  getPeriodMultiplier(key) {
    return this.periodMultipliers.get(key) || 1;
  }
};

// js/dsp/AudioRecorder.js
var WORKLET_URL = "js/dsp/worklets/recorder-processor.js";
var AudioRecorder = class {
  /** Load the worklet module once per context. */
  static async load(ctx) {
    await ctx.audioWorklet.addModule(WORKLET_URL);
  }
  constructor(ctx) {
    this.ctx = ctx;
    this.node = null;
    this.taps = [];
    this.chunks = [];
    this.frames = 0;
    this.startTime = null;
    this.latencyFrames = 0;
    this.channelsPerTap = 1;
    this.recording = false;
  }
  /**
   * Begin capturing.
   * @param {Object} opts
   * @param {AudioNode[]} opts.taps - One node per input; each contributes `channelsPerTap` channels
   * @param {number} [opts.channelsPerTap=1] - Channels kept per tap (explicit up/down-mix)
   * @param {number} [opts.latencyFrames=0] - Frames the taps lag the source timeline by
   * @param {number|null} [opts.atTime=null] - Audio-clock time to start at (null = next block)
   * @param {number|null} [opts.endTime=null] - Audio-clock time to stop at, enforced
   *   sample-exactly on the audio thread; the take then arrives via `onEnded`
   * @returns {Promise<number>} the actual start time (audio clock, seconds)
   */
  start({ taps, channelsPerTap = 1, latencyFrames = 0, atTime = null, endTime = null }) {
    if (this.recording) throw new Error("AudioRecorder already recording");
    const ctx = this.ctx;
    this.chunks = [];
    this.frames = 0;
    this.latencyFrames = Math.max(0, Math.round(latencyFrames));
    this.channelsPerTap = channelsPerTap;
    this.recording = true;
    this.node = new AudioWorkletNode(ctx, "recorder-processor", {
      numberOfInputs: taps.length,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: channelsPerTap,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { inputs: taps.length, channelsPerInput: channelsPerTap }
    });
    this.taps = taps;
    taps.forEach((tap, i) => tap.connect(this.node, 0, i));
    this.node.connect(ctx.destination);
    return new Promise((resolve) => {
      this.node.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "started") {
          this.startTime = msg.frame / ctx.sampleRate;
          resolve(this.startTime);
        } else if (msg.type === "data") {
          this.chunks.push(msg.channels.map((b) => new Float32Array(b)));
          this.frames += msg.frames;
        } else if (msg.type === "stopped") {
          this._onStopped();
        }
      };
      const frame = atTime == null ? null : Math.round(atTime * ctx.sampleRate);
      const endFrame = endTime == null ? null : Math.round(endTime * ctx.sampleRate) + this.latencyFrames;
      this.node.port.postMessage({ type: "start", frame, endFrame });
    });
  }
  /**
   * Stop and assemble the take.
   * @returns {Promise<{sampleRate:number, channels:Float32Array[], startTime:number, duration:number}>}
   */
  stop() {
    if (!this.recording || !this.node) return Promise.resolve(null);
    return new Promise((resolve) => {
      this._stopped = resolve;
      this.node.port.postMessage({ type: "stop" });
    });
  }
  /**
   * The worklet finished — by 'stop' or by reaching its end frame.
   * Resolves a pending stop(); an unprompted end goes to `onEnded`.
   */
  _onStopped() {
    const node = this.node;
    for (const tap of this.taps) {
      try {
        tap.disconnect(node);
      } catch {
      }
    }
    this.taps = [];
    try {
      node.disconnect();
    } catch {
    }
    this.node = null;
    this.recording = false;
    const take = this._assemble();
    const resolve = this._stopped;
    this._stopped = null;
    if (resolve) resolve(take);
    else this.onEnded?.(take);
  }
  _assemble() {
    const sampleRate = this.ctx.sampleRate;
    const channelCount = this.chunks[0]?.length ?? 0;
    const trim = Math.min(this.latencyFrames, this.frames);
    const length = this.frames - trim;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const out = new Float32Array(length);
      let pos = -trim;
      for (const chunk of this.chunks) {
        const data = chunk[ch];
        if (pos + data.length <= 0) {
          pos += data.length;
          continue;
        }
        const from = pos < 0 ? -pos : 0;
        out.set(data.subarray(from), pos + from);
        pos += data.length;
      }
      channels.push(out);
    }
    this.chunks = [];
    return { sampleRate, channels, startTime: this.startTime, duration: length / sampleRate };
  }
};

// js/dsp/engine/Stage.js
var Stage = class {
  constructor() {
    this.nodes = [];
    this.input = null;
    this.output = null;
  }
  /** Register a node this stage owns, so dispose() can unhook it. */
  own(node) {
    this.nodes.push(node);
    return node;
  }
  dispose() {
    for (const node of this.nodes) node.disconnect();
  }
};
function setParam(param, value, time, ramp = 0) {
  if (ramp > 0) param.setTargetAtTime(value, time, ramp / 3);
  else param.setValueAtTime(value, time);
}

// js/dsp/engine/MasterBus.js
var MasterBus = class _MasterBus {
  constructor(ctx, gain) {
    this.ctx = ctx;
    const { compressor, limiter } = _MasterBus.createDynamics(ctx);
    this.limiter = limiter;
    this.input = compressor;
    this.gain = ctx.createGain();
    this.gain.gain.value = gain;
    compressor.connect(this.gain);
    this.gain.connect(limiter);
    limiter.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    limiter.connect(this.analyser);
    this.stemTaps = /* @__PURE__ */ new Map();
    this.latencyFrames = 0;
  }
  setGain(gain, ramp) {
    setParam(this.gain.gain, gain, this.ctx.currentTime, ramp);
  }
  /**
   * Persistent mono tap carrying voice `index`'s finished signal (after
   * drive/filter/convolution, before pan and the master chain).
   */
  stemTap(index) {
    let tap = this.stemTaps.get(index);
    if (!tap) {
      tap = this.ctx.createGain();
      this.stemTaps.set(index, tap);
    }
    return tap;
  }
  /**
   * Graph nodes a recorder should capture for a mode: the limiter output
   * (what reaches the speakers — lagging by latencyFrames) or one stem
   * tap per voice index.
   * @returns {{taps: AudioNode[], channelsPerTap: number, latencyFrames: number}}
   */
  recordingTaps(mode, voiceCount = 0) {
    if (mode === "multitrack") {
      const taps = Array.from({ length: voiceCount }, (_, i) => this.stemTap(i));
      return { taps, channelsPerTap: 1, latencyFrames: 0 };
    }
    return { taps: [this.limiter], channelsPerTap: mode === "mono" ? 1 : 2, latencyFrames: this.latencyFrames };
  }
  /**
   * The master dynamics: a gentle compressor feeding a fast limiter. One
   * factory for the live graph and the latency probe so their settings
   * can't drift apart.
   */
  static createDynamics(ctx) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 5e-3;
    limiter.release.value = 0.15;
    return { compressor, limiter };
  }
  /**
   * Frames of delay the compressor → limiter chain adds (each
   * DynamicsCompressor has a fixed look-ahead pre-delay), so recordings
   * tapped after them can be re-aligned to the voices' own timeline.
   * Rendered offline with an impulse: the output's peak position is the
   * latency.
   */
  static async measureLatency(sampleRate) {
    try {
      const length = 4096;
      const offline = new OfflineAudioContext(1, length, sampleRate);
      const impulse = offline.createBuffer(1, length, sampleRate);
      impulse.getChannelData(0)[0] = 0.1;
      const source = offline.createBufferSource();
      source.buffer = impulse;
      const { compressor, limiter } = _MasterBus.createDynamics(offline);
      source.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      const data = rendered.getChannelData(0);
      let peak = 0, at = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) {
          peak = v;
          at = i;
        }
      }
      return peak > 0 ? at : 0;
    } catch (err) {
      console.warn("[audio] master latency probe failed \u2014 assuming 0:", err);
      return 0;
    }
  }
};

// js/dsp/engine/stages/modulator.js
var WORKLET_URL2 = "dist/gate-processor.js";
var PROCESSOR_NAME = "overtone-gate";
var CV_OUTPUTS = { cutoff: 1, q: 2, wet: 3, feedback: 4 };
var CV_BASES = { wet: "baseWet", feedback: "baseFeedback" };
var DEPTHS = {
  gain: ["depthGain", 1],
  freq: ["depthCutoff", 0],
  res: ["depthRes", 0],
  wet: ["depthWet", 0],
  fb: ["depthFeedback", 0]
};
var ModulatorStage = class extends Stage {
  /** Load the worklet module — served unbundled, once per context. */
  static load(ctx) {
    return ctx.audioWorklet.addModule(WORKLET_URL2);
  }
  /**
   * @param {AudioContext} ctx
   * @param {function(Object)} onPulse - Receives each pulse and clock message
   */
  constructor(ctx, onPulse) {
    super();
    const outputs = 1 + Object.keys(CV_OUTPUTS).length;
    this.node = this.own(new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfOutputs: outputs,
      outputChannelCount: new Array(outputs).fill(1)
    }));
    this.input = this.output = this.node;
    this.positionAnchor = null;
    this.node.port.onmessage = (e) => {
      const data = e.data;
      if (data?.type === "position") this.positionAnchor = data;
      else if (data?.type === "pulse" || data?.type === "clock") onPulse(data);
    };
  }
  /**
   * The cycle clock's position (whole cycles + phase) at audio-clock time
   * `now`, extrapolated from the worklet's last anchor; null before one.
   */
  cyclePosition(now) {
    const a = this.positionAnchor;
    if (!a) return null;
    return a.position + Math.max(0, now - a.audioTime) * a.rate;
  }
  /**
   * Sum control signals into their destinations.
   * @param {Object<string, Array<AudioParam|AudioNode>>} targets - keyed by CV_OUTPUTS name
   */
  route(targets) {
    for (const [name, destinations] of Object.entries(targets)) {
      for (const destination of destinations) this.node.connect(destination, CV_OUTPUTS[name]);
    }
  }
  /** The voice's cycle rate — its pitch, or a sampler's loop rate. */
  setCycleRate(hz, time, ramp) {
    setParam(this.param("cycleRate"), hz, time, ramp);
  }
  /** The voice's pitch, when the clock isn't it (the cutoff-CV curve reads it). */
  setPitch(hz, time, ramp) {
    setParam(this.param("pitch"), hz, time, ramp);
  }
  /** Restart the cycle at audio-clock time `at` (a sampler's player just did). */
  resetPhase(at) {
    this.node.port.postMessage({ type: "phase", at });
  }
  /** Base value of a clamped control signal's target (see CV_BASES). */
  setBase(name, value, time, ramp) {
    setParam(this.param(CV_BASES[name]), value, time, ramp);
  }
  /**
   * The cycle gate: which cycles sound (a pattern id and its two values —
   * see js/dsp/gate/patterns.js).
   * @param {{mode?: number, x?: number, y?: number, seq?: number[]}} gate
   */
  setGate({ mode = 0, x = 1, y = 1, seq } = {}, time) {
    this.param("pattern").setValueAtTime(mode, time);
    this.param("patternX").setValueAtTime(x, time);
    this.param("patternY").setValueAtTime(y, time);
    if (seq !== void 0) this.node.port.postMessage({ type: "sequence", steps: seq });
  }
  /**
   * The contour within each active cycle and how far it drives each
   * destination. Partial updates: only the fields present are written.
   * @param {Object} seq - { shape (0-6), stretch, amounts: {gain, freq, res, wet, fb},
   *   table (custom 0-1 contour), config: { ratios, baseStep } (the cutoff CV curve) }
   */
  setSequencer({ shape, stretch, amounts, table, config }, time) {
    if (shape !== void 0) this.param("contour").setValueAtTime(shape, time);
    if (stretch !== void 0) this.param("contourStretch").setValueAtTime(stretch, time);
    if (amounts) {
      for (const [name, [param, neutral]] of Object.entries(DEPTHS)) {
        if (name in amounts) this.param(param).setValueAtTime(amounts[name] ?? neutral, time);
      }
    }
    if (table !== void 0) this.node.port.postMessage({ type: "contourTable", table });
    if (config) this.node.port.postMessage({ type: "seriesConfig", ratios: config.ratios, baseStep: config.baseStep });
  }
  /** Enable/disable the per-cycle pulse messages. */
  setPulseOut(enabled, time) {
    this.param("pulseOut").setValueAtTime(enabled ? 1 : 0, time);
  }
  /** Where in its cycle a pulse lands: false = the start, true = 50%. */
  setPulseOffset(offset, time) {
    this.param("pulseOffset").setValueAtTime(offset ? 0.5 : 0, time);
  }
  /** Make this voice the MIDI clock source (beat messages) or not. */
  setClockOut(enabled, time) {
    this.param("clockOut").setValueAtTime(enabled ? 1 : 0, time);
  }
  param(name) {
    return this.node.parameters.get(name);
  }
  dispose() {
    this.node.port.postMessage("stop");
    super.dispose();
  }
};

// js/dsp/engine/stages/source.js
var SourceStage = class extends Stage {
  /**
   * @param {AudioContext} ctx
   * @param {Object} opts
   * @param {AudioNode|null} opts.external - Shared node to tap instead of oscillators
   * @param {boolean} opts.sampler - A per-voice sample player instead of oscillators
   */
  constructor(ctx, { external = null, sampler = false }) {
    super();
    this.ctx = ctx;
    this.external = external;
    this.frequency = 0;
    this.slots = null;
    this.sample = null;
    this.player = null;
    this.startedAt = null;
    this.clockOverride = null;
    if (external) {
      this.output = this.own(ctx.createGain());
      external.connect(this.output);
      return;
    }
    if (sampler) {
      this.output = this.own(ctx.createGain());
      this.sample = { buffer: null, loop: true, baseFrequency: null, range: null };
      return;
    }
    this.output = this.own(ctx.createGain());
    this.slots = [0, 1].map((i) => {
      const oscillator = this.own(ctx.createOscillator());
      const gain = this.own(ctx.createGain());
      gain.gain.value = i === 0 ? 1 : 0;
      oscillator.connect(gain);
      gain.connect(this.output);
      return { oscillator, gain, wave: null, period: 1 };
    });
    this.position = 0;
  }
  /**
   * The voice's pitch (Hz): each wave slot corrected for its table period;
   * a tuned sampler's playback rate.
   */
  setFrequency(frequency, time, ramp) {
    this.frequency = frequency;
    if (this.slots) {
      for (const slot of this.slots) setParam(slot.oscillator.frequency, frequency / slot.period, time, ramp);
    } else if (this.player) {
      setParam(this.player.playbackRate, this.playbackRate(), time, ramp);
    }
  }
  // ---- sampler ----
  /**
   * What the sampler plays. A new buffer, loop setting or range restarts
   * the player; a new base frequency only retunes it.
   * @param {{buffer: AudioBuffer|null, loop?: boolean, baseFrequency?: number|null,
   *   range?: number[]|null}} sample - range: [start, end] fractions of the file
   */
  setSample({ buffer, loop = true, baseFrequency = null, range = null }, time, ramp) {
    if (!this.sample) return null;
    const restart = buffer !== this.sample.buffer || loop !== this.sample.loop || (range?.[0] ?? 0) !== (this.sample.range?.[0] ?? 0) || (range?.[1] ?? 1) !== (this.sample.range?.[1] ?? 1);
    this.sample = { buffer, loop, baseFrequency, range };
    if (restart) {
      if (this.startedAt === null) return null;
      const at = Math.max(this.startedAt, time);
      this.play(at);
      return at;
    }
    if (this.player) setParam(this.player.playbackRate, this.playbackRate(), time, ramp);
    return null;
  }
  /** Play the sample again from its start (a one-shot's trigger); returns the start time. */
  retrigger(time) {
    if (!this.sample || this.startedAt === null) return null;
    this.play(time);
    return time;
  }
  playbackRate() {
    const base = this.sample?.baseFrequency;
    return base > 0 && this.frequency > 0 ? this.frequency / base : 1;
  }
  play(at) {
    if (this.player) {
      const old = this.player;
      try {
        old.stop(at);
      } catch {
      }
      old.onended = () => old.disconnect();
    }
    this.player = null;
    if (!this.sample.buffer) return;
    const player = this.ctx.createBufferSource();
    const { buffer, loop, range } = this.sample;
    player.buffer = buffer;
    player.loop = loop;
    player.playbackRate.value = this.playbackRate();
    const start = (range?.[0] ?? 0) * buffer.duration;
    const end = (range?.[1] ?? 1) * buffer.duration;
    player.loopStart = start;
    player.loopEnd = end;
    player.connect(this.output);
    if (loop) player.start(at, start);
    else player.start(at, start, Math.max(0, end - start));
    this.player = player;
  }
  /**
   * The rate the voice's cycle clock should run at: the audible table's
   * full period (a packed wavetable's cycle is all its periods); a
   * sampler's LOOP rate — the range at the playback rate — so pulses,
   * gate and contour follow the sample's own rhythm, not its pitch; an
   * external head's rate when the host set one (the mono sample player).
   */
  get clockFrequency() {
    if (this.clockOverride !== null) return this.clockOverride;
    if (this.slots) return this.frequency / this.slots[this.position < 0.5 ? 0 : 1].period;
    if (this.sample?.buffer) {
      const { buffer, range } = this.sample;
      const seconds = ((range?.[1] ?? 1) - (range?.[0] ?? 0)) * buffer.duration;
      return seconds > 0 ? this.playbackRate() / seconds : this.frequency;
    }
    return this.frequency;
  }
  /** An external head's cycle rate (null = the voice's pitch). */
  setClock(hz) {
    this.clockOverride = hz;
  }
  /**
   * What sounds: wave `a`, or `morph` (0-1) of the way from `a` to `b`.
   * Endpoints already in a slot keep it; a new one loads into the slot
   * that is silent, so a plain change of wave (b = null) becomes a
   * morph onto the idle slot over `ramp`.
   * @param {{a: WaveSlot, b?: WaveSlot|null, morph?: number}} waveform
   */
  setWaveform({ a, b = null, morph = 0 }, time, ramp) {
    if (!this.slots) return;
    if (!b || b.wave === a.wave) {
      b = a;
      morph = 0;
    }
    const [s0, s1] = this.slots;
    let target;
    if (s0.wave === a.wave && s1.wave === b.wave) {
      target = morph;
    } else if (s0.wave === b.wave && s1.wave === a.wave) {
      target = 1 - morph;
    } else {
      const idle = this.position < 0.5 ? 1 : 0;
      const live = 1 - idle;
      if (a === b) {
        this.load(idle, a, time);
        target = idle;
      } else if (this.slots[live].wave === a.wave) {
        this.load(idle, b, time);
        target = idle === 1 ? morph : 1 - morph;
      } else if (this.slots[live].wave === b.wave) {
        this.load(idle, a, time);
        target = idle === 1 ? 1 - morph : morph;
      } else {
        this.load(0, a, time);
        this.load(1, b, time);
        target = morph;
      }
    }
    this.morphTo(target, time, ramp);
  }
  load(index, { wave, period }, time) {
    const slot = this.slots[index];
    slot.wave = wave;
    slot.period = period;
    slot.oscillator.setPeriodicWave(wave);
    setParam(slot.oscillator.frequency, this.frequency / period, time, 0);
  }
  morphTo(position, time, ramp) {
    this.position = position;
    const [s0, s1] = this.slots;
    const coherent = s0.period === s1.period;
    const g1 = coherent ? position : Math.sin(position * Math.PI / 2);
    const g0 = coherent ? 1 - position : Math.cos(position * Math.PI / 2);
    setParam(s0.gain.gain, g0, time, ramp);
    setParam(s1.gain.gain, g1, time, ramp);
  }
  /**
   * Start sounding (an external source already is). A shared future `at`
   * puts every voice of a bank at phase 0 on the same frame; a time in
   * the past — the default — means "now".
   */
  start(at = 0) {
    if (this.slots) for (const slot of this.slots) slot.oscillator.start(at);
    if (this.sample) {
      this.startedAt = at;
      this.play(at);
    }
    return at;
  }
  stop(at) {
    if (this.slots) for (const slot of this.slots) slot.oscillator.stop(at);
    if (this.player) {
      try {
        this.player.stop(at);
      } catch {
      }
    }
  }
  dispose() {
    if (this.player) {
      try {
        this.player.disconnect();
      } catch {
      }
    }
    if (this.external) {
      try {
        this.external.disconnect(this.output);
      } catch {
      }
    }
    super.dispose();
  }
};

// js/dsp/engine/stages/envelope.js
var MIN_SEGMENT = 1e-3;
var EnvelopeStage = class extends Stage {
  constructor(ctx) {
    super();
    this.input = this.output = this.own(ctx.createGain());
    this.gain = this.input.gain;
  }
  setOpen(open, time, ramp) {
    this.gain.cancelScheduledValues(time);
    setParam(this.gain, open ? 1 : 0, time, ramp);
  }
  /**
   * Gate on: ramp to full over the attack, then down to the sustain
   * level over the decay. Holds at sustain until release().
   */
  attack({ a, d, s }, time) {
    this.holdAt(time);
    const attackEnd = time + Math.max(MIN_SEGMENT, a);
    this.gain.linearRampToValueAtTime(1, attackEnd);
    this.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, s)), attackEnd + Math.max(MIN_SEGMENT, d));
  }
  /** Gate off: ramp to silence over the release. */
  release({ r }, time) {
    this.holdAt(time);
    this.gain.linearRampToValueAtTime(0, time + Math.max(MIN_SEGMENT, r));
  }
  /** Instantaneous envelope level (0..1) — follows the scheduled ramps. */
  get level() {
    return this.gain.value;
  }
  /** Drop whatever was scheduled and continue from the current level. */
  holdAt(time) {
    this.gain.cancelScheduledValues(time);
    this.gain.setValueAtTime(this.gain.value, time);
  }
};

// js/dsp/engine/stages/level.js
var LevelStage = class extends Stage {
  constructor(ctx) {
    super();
    this.input = this.output = this.own(ctx.createGain());
    this.gain = this.input.gain;
  }
  setGain(gain, time, ramp) {
    setParam(this.gain, gain, time, ramp);
  }
  /** Teardown fade: drop everything scheduled and decay to silence. */
  fadeOut(time, timeConstant) {
    this.gain.cancelScheduledValues(time);
    this.gain.setTargetAtTime(0, time, timeConstant);
  }
};

// js/dsp/driveCurve.js
var CURVE_LENGTH = 1024;
function driveCurve(amount) {
  if (!(amount > 0)) return null;
  const k = 1 + amount * 29;
  const norm = Math.tanh(k);
  const curve = new Float32Array(CURVE_LENGTH);
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const x = i / (CURVE_LENGTH - 1) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

// js/dsp/engine/stages/drive.js
var DriveStage = class extends Stage {
  constructor(ctx) {
    super();
    this.shaper = this.own(ctx.createWaveShaper());
    this.shaper.oversample = "4x";
    this.input = this.output = this.shaper;
  }
  setAmount(amount) {
    this.shaper.curve = driveCurve(amount);
  }
};

// js/dsp/engine/stages/filter.js
var OPEN_CUTOFF = 2e4;
var FLAT_Q = 0.707;
var TYPES = /* @__PURE__ */ new Set(["lowpass", "bandpass", "highpass"]);
var FilterStage = class extends Stage {
  constructor(ctx) {
    super();
    this.biquad = this.own(ctx.createBiquadFilter());
    this.biquad.type = "lowpass";
    this.biquad.frequency.value = OPEN_CUTOFF;
    this.biquad.Q.value = FLAT_Q;
    this.input = this.output = this.biquad;
    this._type = "lowpass";
    this._open = true;
  }
  get cutoff() {
    return this.biquad.frequency;
  }
  get q() {
    return this.biquad.Q;
  }
  /**
   * @param {Object} filter
   * @param {number} [filter.cutoff] - Hz; ≤ 0 opens (bypasses) the filter
   * @param {number} [filter.q]
   * @param {string} [filter.type] - 'lowpass' | 'bandpass' | 'highpass'
   */
  set({ cutoff, q, type }, time, ramp) {
    if (type !== void 0 && TYPES.has(type)) this._type = type;
    if (cutoff !== void 0) {
      this._open = !(cutoff > 0) || cutoff >= OPEN_CUTOFF;
      setParam(this.cutoff, this._open ? OPEN_CUTOFF : cutoff, time, ramp);
    }
    if (q !== void 0) setParam(this.q, q, time, ramp);
    const wanted = this._open ? "lowpass" : this._type;
    if (this.biquad.type !== wanted) this.biquad.type = wanted;
  }
};

// js/dsp/engine/stages/convolution.js
var MAX_LOOP = 10;
var SWAP_MIN_MS = 120;
var DUCK_DOWN_TAU = 1e-3;
var DUCK_UP_TAU = 2e-3;
var DUCK_MS = 6;
var ConvolutionStage = class extends Stage {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    const gain = (value) => {
      const node = this.own(ctx.createGain());
      node.gain.value = value;
      return node;
    };
    this.input = gain(1);
    this.output = gain(1);
    this.dry = gain(1);
    this.wet = gain(0);
    this.send = gain(1);
    this.sum = gain(1);
    this.feedback = gain(0);
    this.convolver = this.own(ctx.createConvolver());
    this.convolver.normalize = true;
    this.duck = gain(1);
    this.delay = this.own(ctx.createDelay(MAX_LOOP));
    this.delay.delayTime.value = this.loopDelayTime(0);
    this.wetInverse = gain(-1);
    this.wetInverse.connect(this.dry.gain);
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.convolver);
    this.convolver.connect(this.send);
    this.send.connect(this.duck);
    this.duck.connect(this.sum);
    this.sum.connect(this.wet);
    this.wet.connect(this.output);
    this.sum.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.sum);
    this.pendingBuffer = null;
    this.swapTimer = null;
    this.lastSwap = -Infinity;
  }
  get wetCV() {
    return [this.wet.gain, this.wetInverse];
  }
  get feedbackCV() {
    return [this.feedback.gain];
  }
  /**
   * @param {Object} conv
   * @param {number} [conv.wet] - Dry/wet mix, 0-1
   * @param {number} [conv.feedback] - Loop gain, −0.99..0.99
   * @param {number} [conv.gain] - Send level into the mix, 0-1
   * @param {AudioBuffer|null} [conv.buffer] - The IR (null = none)
   * @param {number} [conv.period] - Period the loop resonates on, seconds
   */
  set({ wet, feedback, gain, buffer, period }, time, ramp) {
    if (wet !== void 0) {
      setParam(this.dry.gain, 1 - wet, time, ramp);
      setParam(this.wet.gain, wet, time, ramp);
    }
    if (feedback !== void 0) setParam(this.feedback.gain, feedback, time, ramp);
    if (gain !== void 0) setParam(this.send.gain, gain, time, ramp);
    if (period !== void 0) setParam(this.delay.delayTime, this.loopDelayTime(period), time, ramp);
    if (buffer !== void 0 && buffer !== (this.swapTimer ? this.pendingBuffer : this.convolver.buffer)) {
      if (ramp > 0) this.swapBuffer(buffer);
      else this.convolver.buffer = buffer;
    }
  }
  /**
   * DelayNode time that makes the loop resonate on `period` seconds. Both
   * constraints here are Web Audio's, which is why they live in this
   * stage and not with the caller: a DelayNode inside a cycle carries one
   * extra render quantum of latency (the feedback edge is read from the
   * previous quantum), so that quantum is subtracted; and the loop can
   * therefore not be shorter than two quanta, so a shorter period gets
   * the smallest whole number of periods that clears it — the comb still
   * resonates on that period (and below it).
   */
  loopDelayTime(period) {
    const quantum = 128 / this.ctx.sampleRate;
    if (!(period > 0)) return quantum;
    const loop = Math.ceil(2 * quantum / period) * period;
    return Math.min(MAX_LOOP, loop - quantum);
  }
  /**
   * Swap the IR without a click: duck the wet output (and so the loop
   * entry) to silence, assign the buffer once the ramp has landed, then
   * ramp back. Swaps arriving meanwhile coalesce onto the latest buffer.
   * Rate-limited: assigning ConvolverNode.buffer allocates fresh FFT
   * state (large for long IRs), and a fundamental glide would otherwise
   * do it every 10 cents on every voice. The timers only postpone the
   * swap — if the main thread is throttled the duck just lasts longer;
   * nothing audible depends on them firing on time.
   */
  swapBuffer(buffer) {
    this.pendingBuffer = buffer;
    if (this.swapTimer) return;
    const wait = Math.max(0, this.lastSwap + SWAP_MIN_MS - performance.now());
    this.swapTimer = setTimeout(() => {
      const duck = this.duck.gain;
      const now = this.ctx.currentTime;
      duck.cancelScheduledValues(now);
      duck.setTargetAtTime(0, now, DUCK_DOWN_TAU);
      this.swapTimer = setTimeout(() => {
        this.swapTimer = null;
        this.convolver.buffer = this.pendingBuffer;
        this.pendingBuffer = null;
        this.lastSwap = performance.now();
        const t = this.ctx.currentTime;
        duck.cancelScheduledValues(t);
        duck.setTargetAtTime(1, t, DUCK_UP_TAU);
      }, DUCK_MS);
    }, wait);
  }
  /**
   * Teardown fade of the loop: cutting it abruptly is a click that the
   * feedback would repeat for as long as it decays.
   */
  fadeOut(time, timeConstant) {
    clearTimeout(this.swapTimer);
    this.swapTimer = null;
    this.sum.gain.cancelScheduledValues(time);
    this.sum.gain.setTargetAtTime(0, time, timeConstant);
  }
};

// js/dsp/engine/stages/pan.js
var PanStage = class extends Stage {
  constructor(ctx) {
    super();
    this.panner = this.own(ctx.createStereoPanner());
    this.input = this.output = this.panner;
  }
  setPan(pan, time, ramp) {
    setParam(this.panner.pan, pan, time, ramp);
  }
};

// js/dsp/engine/stages/meter.js
var MeterStage = class extends Stage {
  constructor(ctx) {
    super();
    this.analyser = this.own(ctx.createAnalyser());
    this.analyser.fftSize = 256;
    this.input = this.analyser;
    this.buffer = new Float32Array(this.analyser.fftSize);
  }
  /** Instantaneous peak level, 0-1. */
  level() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    let peak = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const a = Math.abs(this.buffer[i]);
      if (a > peak) peak = a;
    }
    return Math.min(1, peak);
  }
};

// js/dsp/engine/Voice.js
var DEFAULT_RAMP = 0.02;
var TEARDOWN_TAU = 2e-3;
var TEARDOWN_MS = 15;
var APPLY = {
  waveform(s, waveform, time, ramp) {
    s.source.setWaveform(waveform, time, ramp);
    s.modulator.setCycleRate(s.source.clockFrequency, time, ramp);
  },
  sample(s, sample, time, ramp) {
    const restartedAt = s.source.setSample(sample, time, ramp);
    s.modulator.setCycleRate(s.source.clockFrequency, time, ramp);
    if (restartedAt !== null) s.modulator.resetPhase(restartedAt);
  },
  clock(s, { frequency, at }, time, ramp) {
    s.source.setClock(frequency ?? null);
    s.modulator.setCycleRate(s.source.clockFrequency, time, ramp);
    if (at != null) s.modulator.resetPhase(at);
  },
  frequency(s, hz, time, ramp) {
    s.source.setFrequency(hz, time, ramp);
    s.modulator.setCycleRate(s.source.clockFrequency, time, ramp);
    s.modulator.setPitch(hz, time, ramp);
  },
  gain: (s, gain, time, ramp) => s.level.setGain(gain, time, ramp),
  envelopeOpen: (s, open, time, ramp) => s.envelope.setOpen(open, time, ramp),
  gate: (s, gate, time) => s.modulator.setGate(gate, time),
  sequencer: (s, sequencer, time) => s.modulator.setSequencer(sequencer, time),
  pulseOut: (s, enabled, time) => s.modulator.setPulseOut(enabled, time),
  pulseOffset: (s, offset, time) => s.modulator.setPulseOffset(offset, time),
  clockOut: (s, enabled, time) => s.modulator.setClockOut(enabled, time),
  drive: (s, amount) => s.drive.setAmount(amount),
  filter: (s, filter, time, ramp) => s.filter.set(filter, time, ramp),
  convolution(s, conv, time, ramp) {
    s.convolution.set(conv, time, ramp);
    if (conv.wet !== void 0) s.modulator.setBase("wet", conv.wet, time, ramp);
    if (conv.feedback !== void 0) s.modulator.setBase("feedback", conv.feedback, time, ramp);
  },
  pan: (s, pan, time, ramp) => s.pan.setPan(pan, time, ramp)
};
var Voice = class {
  /**
   * @param {AudioContext} ctx
   * @param {Object} head - What the voice is made of (fixed for its lifetime)
   * @param {AudioNode|null} head.external - Shared source to tap instead of oscillators
   * @param {boolean} [head.sampler] - A per-voice sample player instead of oscillators
   * @param {number|null} head.startAt - Audio-clock time to start at (null = now)
   * @param {function(Object)} head.onPulse - Receives the modulator's pulse messages
   * @param {VoiceParams} params - Initial parameters
   */
  constructor(ctx, { external, sampler = false, startAt, onPulse }, params) {
    this.ctx = ctx;
    const s = this.stages = {
      source: new SourceStage(ctx, { external, sampler }),
      envelope: new EnvelopeStage(ctx),
      level: new LevelStage(ctx),
      modulator: new ModulatorStage(ctx, onPulse),
      drive: new DriveStage(ctx),
      filter: new FilterStage(ctx),
      convolution: new ConvolutionStage(ctx),
      pan: new PanStage(ctx),
      meter: new MeterStage(ctx)
    };
    chain(s.source, s.envelope, s.level, s.modulator, s.drive, s.filter, s.convolution, s.pan);
    s.filter.output.connect(s.meter.input);
    s.modulator.route({
      cutoff: [s.filter.cutoff],
      q: [s.filter.q],
      wet: s.convolution.wetCV,
      feedback: s.convolution.feedbackCV
    });
    this.set(params, 0);
    const at = s.source.start(startAt ?? 0);
    if (s.source.sample) s.modulator.resetPhase(at || ctx.currentTime);
  }
  /**
   * Join the master bus: the panned signal into `bus`, the finished mono
   * signal (before pan) into the voice's stem tap.
   */
  connect(bus, stemTap) {
    this.stages.pan.output.connect(bus);
    this.stages.convolution.output.connect(stemTap);
  }
  /**
   * Apply a (partial) set of parameters.
   * @param {VoiceParams} params
   * @param {number} [ramp] - Smoothing in seconds; 0 writes a step
   */
  set(params, ramp = DEFAULT_RAMP) {
    const time = this.ctx.currentTime;
    for (const name of Object.keys(APPLY)) {
      if (params[name] !== void 0) APPLY[name](this.stages, params[name], time, ramp);
    }
  }
  /** Gate the envelope on: { a, d, s } in seconds / level. */
  attack(envelope) {
    this.stages.envelope.attack(envelope, this.ctx.currentTime);
  }
  /** A sampler head: play the sample again from its start. */
  retrigger() {
    const at = this.stages.source.retrigger(this.ctx.currentTime);
    if (at !== null) this.stages.modulator.resetPhase(at);
  }
  /** Gate the envelope off: { r } in seconds. */
  release(envelope) {
    this.stages.envelope.release(envelope, this.ctx.currentTime);
  }
  /** Instantaneous envelope level, 0..1. */
  get envelopeLevel() {
    return this.stages.envelope.level;
  }
  /** Instantaneous peak level (0-1), post gate and filter. */
  level() {
    return this.stages.meter.level();
  }
  /** The gate's cycle clock now — whole cycles + phase (the sequence playhead), or null. */
  cyclePosition() {
    return this.stages.modulator.cyclePosition(this.ctx.currentTime);
  }
  /**
   * Fade out, then unhook. An abrupt stop is a click — and the
   * convolution loop would repeat it. A throttled timer only delays the
   * cleanup of an already-silent voice.
   */
  stop() {
    const now = this.ctx.currentTime;
    this.stages.level.fadeOut(now, TEARDOWN_TAU);
    this.stages.convolution.fadeOut(now, TEARDOWN_TAU);
    this.stages.source.stop(now + TEARDOWN_MS / 1e3);
    setTimeout(() => {
      for (const stage of Object.values(this.stages)) stage.dispose();
    }, TEARDOWN_MS);
  }
};
function chain(...stages) {
  for (let i = 1; i < stages.length; i++) stages[i - 1].output.connect(stages[i].input);
}

// js/dsp/engine/AudioEngine.js
var STANDARD_WAVEFORMS = ["square", "sawtooth", "triangle"];
var STANDARD_WAVEFORM_HARMONICS = 128;
var AudioEngine = class {
  constructor() {
    this.context = null;
    this.master = null;
    this.voices = /* @__PURE__ */ new Map();
    this.standardWaves = /* @__PURE__ */ new Map();
    this.recorderReady = false;
    this.onPulse = null;
    this.ready = null;
  }
  /**
   * Create the context and the master bus. Concurrent callers share one
   * in-flight initialization — nobody may see a half-built engine.
   */
  initialize(masterGain = 0.5) {
    this.ready ??= this.build(masterGain);
    return this.ready;
  }
  async build(masterGain) {
    const ctx = new AudioContext();
    await ModulatorStage.load(ctx);
    try {
      await AudioRecorder.load(ctx);
      this.recorderReady = true;
    } catch (err) {
      console.warn("[audio] recorder worklet unavailable \u2014 recording disabled:", err);
    }
    const master = new MasterBus(ctx, masterGain);
    master.latencyFrames = await MasterBus.measureLatency(ctx.sampleRate);
    for (const type of STANDARD_WAVEFORMS) {
      this.standardWaves.set(type, WaveformGenerator.createBandLimitedWaveform(ctx, type, STANDARD_WAVEFORM_HARMONICS));
    }
    this.standardWaves.set("sine", ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1])));
    this.context = ctx;
    this.master = master;
  }
  /** Resume the context if the browser suspended it (autoplay policy). */
  async resume() {
    if (this.context?.state === "suspended") await this.context.resume();
  }
  /** The audio clock, seconds. */
  now() {
    return this.context.currentTime;
  }
  get sampleRate() {
    return this.context.sampleRate;
  }
  /**
   * Build, start and register the voice for overtone `index`.
   * @param {number} index
   * @param {Object} spec - VoiceParams (see Voice.js), plus what the voice is made of:
   * @param {AudioNode|null} [spec.source] - Shared external node to tap instead of oscillators
   * @param {boolean} [spec.sampler] - A per-voice sample player instead of oscillators
   * @param {number|null} [spec.startAt] - Audio-clock start time, shared by a
   *   bank to put every voice at phase 0 on the same frame (null = now)
   * @returns {Voice}
   */
  addVoice(index, { source = null, sampler = false, startAt = null, ...params }) {
    if (!this.master) throw new Error("AudioEngine must be initialized before adding voices");
    this.voices.get(index)?.stop();
    const voice = new Voice(this.context, {
      external: source,
      sampler,
      startAt,
      onPulse: (pulse) => this.onPulse?.(index, pulse)
    }, params);
    voice.connect(this.master.input, this.master.stemTap(index));
    this.voices.set(index, voice);
    return voice;
  }
  /** The running voice of overtone `index`, if any. */
  voice(index) {
    return this.voices.get(index);
  }
  stopAllVoices() {
    for (const voice of this.voices.values()) voice.stop();
    this.voices.clear();
  }
  /** The table of a standard waveform ('sine', 'square', 'sawtooth', 'triangle'). */
  standardWave(name) {
    const wave = this.standardWaves.get(name);
    if (!wave) throw new Error(`Unknown waveform: ${name}`);
    return wave;
  }
};
var audioEngine = new AudioEngine();

// js/dsp/IRManager.js
var PITCHED_MAX_SECONDS = 4;
var PITCHED_CACHE_MAX = 48;
var PITCHED_FADE_SECONDS = 0.02;
var IRManager = class {
  constructor() {
    this.irs = /* @__PURE__ */ new Map();
    this.pitchedCache = /* @__PURE__ */ new Map();
    this.count = 0;
    this.ctx = null;
  }
  /**
   * The context IR buffers are built on. Set when the engine starts;
   * anything adopted before then is built on first use.
   */
  useContext(ctx) {
    this.ctx = ctx;
  }
  /**
   * Take a stored IR (assetLibrary) as samples, without an AudioBuffer:
   * at boot there is no AudioContext, and the steppers only need to know
   * it exists. The buffer is made when a voice first rings through it.
   */
  adopt(key, { pcm, sampleRate, bakeFrequency, name }) {
    this.count++;
    this.irs.set(key, { name: name || `IR ${this.count}`, buffer: null, bakeFrequency, pcm, sampleRate });
  }
  /**
   * @param {AudioBuffer} buffer
   * @param {string} name - Display name
   * @param {number} bakeFrequency - Fundamental (Hz) the IR was baked at
   * @returns {string} key
   */
  add(buffer, name, bakeFrequency, key = null) {
    this.count++;
    const id = key || `ir_${this.count}`;
    this.irs.set(id, { name: name || `IR ${this.count}`, buffer, bakeFrequency, pcm: null, sampleRate: 0 });
    return id;
  }
  /**
   * Is this IR in the session's library? True for a stored IR whose
   * buffer has not been built yet — existence is not the same question
   * as "can it play right now", which needs a context.
   */
  has(key) {
    return Boolean(key) && this.irs.has(key);
  }
  /** @returns {AudioBuffer|null} the IR as baked; built on first use when adopted */
  get(key) {
    const ir = this.irs.get(key);
    if (!ir) return null;
    if (!ir.buffer && ir.pcm && this.ctx) {
      ir.buffer = this.ctx.createBuffer(1, ir.pcm.length, ir.sampleRate);
      ir.buffer.copyToChannel(ir.pcm, 0);
    }
    return ir.buffer || null;
  }
  setName(key, name) {
    const ir = this.irs.get(key);
    if (ir) ir.name = name;
  }
  /**
   * Forget an IR (the library deleted it), along with every pitched copy
   * cached for it — those hold an AudioBuffer each.
   */
  remove(key) {
    this.irs.delete(key);
    for (const cacheKey of [...this.pitchedCache.keys()]) {
      if (cacheKey.startsWith(`${key}@`)) this.pitchedCache.delete(cacheKey);
    }
  }
  /** @returns {number} fundamental the IR was baked at (0 if unknown) */
  bakeFrequency(key) {
    return this.irs.get(key)?.bakeFrequency || 0;
  }
  /**
   * The IR resampled so its resonances land on `frequency` instead of the
   * bake fundamental: a voice at 3× the bake pitch gets the IR played 3×
   * faster. Quantized to 10-cent steps and cached, so pitch glides reuse
   * buffers instead of rebuilding (and re-triggering the convolver) per
   * update.
   *
   * @param {string} key
   * @param {number} frequency - Target fundamental (Hz)
   * @param {AudioContext} ctx
   * @returns {AudioBuffer|null}
   */
  pitched(key, frequency, ctx) {
    const ir = this.irs.get(key);
    const base = this.get(key);
    if (!ir || !base) return null;
    if (!(frequency > 0) || !(ir.bakeFrequency > 0)) return base;
    const cents = Math.round(1200 * Math.log2(frequency / ir.bakeFrequency) / 10) * 10;
    if (cents === 0) return base;
    const cacheKey = `${key}@${cents}`;
    const cached = this.pitchedCache.get(cacheKey);
    if (cached) {
      this.pitchedCache.delete(cacheKey);
      this.pitchedCache.set(cacheKey, cached);
      return cached;
    }
    const factor = Math.pow(2, cents / 1200);
    const src = base.getChannelData(0);
    const wanted = Math.max(2, Math.round(src.length / factor));
    const maxLength = Math.round(PITCHED_MAX_SECONDS * ctx.sampleRate);
    const length = Math.min(wanted, maxLength);
    const out = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = out.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const pos = i * factor;
      const i0 = Math.floor(pos);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const frac = pos - i0;
      data[i] = (src[i0] ?? 0) * (1 - frac) + (src[i1] ?? 0) * frac;
    }
    if (length < wanted) {
      const fade = Math.min(length, Math.round(PITCHED_FADE_SECONDS * ctx.sampleRate));
      for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
    }
    this.pitchedCache.set(cacheKey, out);
    while (this.pitchedCache.size > PITCHED_CACHE_MAX) {
      this.pitchedCache.delete(this.pitchedCache.keys().next().value);
    }
    return out;
  }
  /** @returns {Array<{key: string, name: string}>} in creation order */
  list() {
    return [...this.irs].map(([key, v]) => ({ key, name: v.name }));
  }
  /** Key by creation index (for the bridge's /twig/convir/<n> [i]). */
  keyAt(index) {
    return this.list()[index]?.key ?? null;
  }
  indexOf(key) {
    return this.list().findIndex((ir) => ir.key === key);
  }
};
var irManager = new IRManager();

// js/dsp/pitchDetect.js
var SINGLE_CYCLE_MAX_S = 1;
var ANALYSIS_SAMPLES = 4096;
var WORKER_URL = "js/dsp/workers/pitch-worker.js";
var worker = null;
var nextId = 1;
var pending2 = /* @__PURE__ */ new Map();
function pitchWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_URL, { type: "module" });
  worker.onmessage = (e) => {
    const { id, hz } = e.data;
    pending2.get(id)?.(hz);
    pending2.delete(id);
  };
  worker.onerror = (err) => {
    console.warn("[pitch] worker failed \u2014 no fundamental detected:", err.message);
    for (const resolve of pending2.values()) resolve(null);
    pending2.clear();
  };
  return worker;
}
function detectFundamental(buffer, range = null) {
  const { length, sampleRate } = buffer;
  if (length < 2) return Promise.resolve(null);
  if (!range && length <= sampleRate * SINGLE_CYCLE_MAX_S) return Promise.resolve(sampleRate / length);
  const from = range ? Math.floor(range[0] * length) : 0;
  const to = range ? Math.max(from + 1, Math.floor(range[1] * length)) : length;
  const data = monoMix(buffer, Math.min(to - from, ANALYSIS_SAMPLES), from);
  return new Promise((resolve) => {
    const id = nextId++;
    pending2.set(id, resolve);
    pitchWorker().postMessage({ id, data, sampleRate }, [data.buffer]);
  });
}
function monoMix(buffer, count = buffer.length, offset = 0) {
  const n = buffer.numberOfChannels;
  const out = new Float32Array(count);
  for (let c = 0; c < n; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < count; i++) out[i] += d[offset + i] / n;
  }
  return out;
}

// js/dsp/overview.js
var OVERVIEW_BINS = 1024;
function overviewOfData(data, duration) {
  const bins = Math.max(1, Math.min(OVERVIEW_BINS, data.length));
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * data.length / bins);
    const to = Math.max(from + 1, Math.floor((b + 1) * data.length / bins));
    let lo = Infinity, hi = -Infinity;
    for (let i = from; i < to; i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max, duration };
}

// js/dsp/SourceManager.js
function overviewOf(buffer) {
  return overviewOfData(monoMix(buffer), buffer.duration);
}
var NOISE_SECONDS = 4;
function whiteNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, NOISE_SECONDS * ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
function pinkNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, NOISE_SECONDS * ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
  }
  return buffer;
}
var SourceManager = class {
  constructor() {
    this.node = null;
    this._bufferSource = null;
    this._stream = null;
    this._fileBuffer = null;
    this.fileName = null;
    this.fileSource = null;
    this.fileFundamental = null;
    this.fileOverview = null;
    this._loop = true;
    this._range = null;
    this._ctx = null;
    this.playerStartedAt = null;
  }
  /**
   * Build (or rebuild) the shared source for a mode. Disposes whatever
   * was active first. Returns the tap node, or null for 'oscillators'.
   *
   * @param {AudioContext} ctx
   * @param {string} mode - 'oscillators'|'adc'|'soundfile'|'pink'|'white'
   * @param {Object} opts - { deviceId, channel } for adc; { loop, range } for soundfile
   */
  async prepare(ctx, mode, { deviceId = null, channel = 0, loop = true, range = null } = {}) {
    this.dispose();
    if (mode === "oscillators") return null;
    this._ctx = ctx;
    this._loop = loop;
    this._range = range;
    const out = ctx.createGain();
    if (mode === "adc") {
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      };
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mediaSource = ctx.createMediaStreamSource(this._stream);
      const channels = Math.max(1, mediaSource.channelCount || 1);
      const splitter = ctx.createChannelSplitter(channels);
      mediaSource.connect(splitter);
      splitter.connect(out, Math.min(channel, channels - 1), 0);
    } else if (mode === "soundfile") {
      if (this._fileBuffer) this._startPlayer(this._fileBuffer, out, loop, range);
    } else {
      this._startPlayer(mode === "pink" ? pinkNoiseBuffer(ctx) : whiteNoiseBuffer(ctx), out, true);
    }
    this.node = out;
    return out;
  }
  _startPlayer(buffer, out, loop, range = null) {
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    const start = (range?.[0] ?? 0) * buffer.duration;
    const end = (range?.[1] ?? 1) * buffer.duration;
    src.loopStart = start;
    src.loopEnd = end;
    src.connect(out);
    const at = this._ctx.currentTime;
    if (loop) src.start(at, start);
    else src.start(at, start, Math.max(0, end - start));
    this._bufferSource = src;
    this.playerStartedAt = at;
  }
  /** Seconds one pass of the file (or its range) takes, or null without a file. */
  get loopSeconds() {
    if (!this._fileBuffer) return null;
    return ((this._range?.[1] ?? 1) - (this._range?.[0] ?? 0)) * this._fileBuffer.duration;
  }
  _stopPlayer() {
    if (this._bufferSource) {
      try {
        this._bufferSource.stop();
      } catch {
      }
      this._bufferSource.disconnect();
      this._bufferSource = null;
    }
  }
  /** Sound-file mode: play the file again from its start (a one-shot's trigger). */
  retrigger() {
    if (!this.node || !this._fileBuffer) return;
    this._stopPlayer();
    this._startPlayer(this._fileBuffer, this.node, this._loop, this._range);
  }
  /** Sound-file mode: loop or one-shot; the file restarts under the new setting. */
  setLoop(loop) {
    this._loop = loop;
    if (this.node && this._fileBuffer) this.retrigger();
  }
  /** Sound-file mode: the part of the file to play ([start, end] fractions, null = all). */
  setRange(range) {
    this._range = range;
    if (this.node && this._fileBuffer) this.retrigger();
  }
  /**
   * Keep a decoded sound file for 'soundfile' mode and detect its
   * fundamental (YIN, in a worker). Resolves once the fundamental is
   * known; a newer file loaded meanwhile wins.
   */
  async setFileBuffer(audioBuffer, name, source = null) {
    this._fileBuffer = audioBuffer;
    this.fileName = name;
    this.fileSource = source;
    this.fileFundamental = null;
    this.fileOverview = overviewOf(audioBuffer);
    if (this.node) this.retrigger();
    return this.detectFundamental(null);
  }
  /**
   * Re-detect the fundamental for a part of the file ([start, end]
   * fractions; null = the whole file) — a selected region can have its
   * own pitch. Keeps the previous value when the region has none.
   */
  async detectFundamental(range) {
    const buffer = this._fileBuffer;
    if (!buffer) return null;
    const hz = await detectFundamental(buffer, range);
    if (this._fileBuffer !== buffer) return this.fileFundamental;
    if (hz !== null) this.fileFundamental = hz;
    return this.fileFundamental;
  }
  get hasFile() {
    return Boolean(this._fileBuffer);
  }
  /** The decoded file, for per-voice players (poly sample mode). */
  get fileBuffer() {
    return this._fileBuffer;
  }
  /** Stop and release the active source (keeps the loaded file). */
  dispose() {
    this._stopPlayer();
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
      }
      this.node = null;
    }
  }
  /** Available audio-input devices for the ADC selector. */
  async inputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput").map((d) => ({ id: d.deviceId, label: d.label || `Input ${d.deviceId.slice(0, 6)}` }));
  }
};
var sourceManager = new SourceManager();

// js/dsp/gate/contours.js
var CONTOUR = {
  square: 0,
  sine: 1,
  triangle: 2,
  sawtooth: 3,
  sawRise: 4,
  custom: 5,
  hold: 6
};
var TWO_PI = Math.PI * 2;
var CONTOURS = [
  { id: CONTOUR.square, name: "square", fn: (phase) => phase < 0.5 ? 1 : 0 },
  { id: CONTOUR.sine, name: "sine", fn: (phase) => (1 - Math.cos(TWO_PI * phase)) / 2 },
  { id: CONTOUR.triangle, name: "triangle", fn: (phase) => 1 - Math.abs(2 * phase - 1) },
  { id: CONTOUR.sawtooth, name: "sawtooth", fn: (phase) => 1 - phase },
  { id: CONTOUR.sawRise, name: "sawRise", fn: (phase) => phase },
  { id: CONTOUR.custom, name: "custom", fn: null },
  { id: CONTOUR.hold, name: "hold", fn: () => 1 }
];
var BY_ID = new Map(CONTOURS.map((c) => [c.id, c]));
var BY_NAME = new Map(CONTOURS.map((c) => [c.name, c]));
function contourFn(name) {
  return BY_NAME.get(name)?.fn ?? null;
}
function contourIdFor(name) {
  return BY_NAME.get(name)?.id ?? CONTOUR.custom;
}

// js/dsp/assetStore.js
var DB_NAME = "twig";
var DB_VERSION = 1;
var STORE = "assets";
var ASSET = {
  wave: { kind: "wave", prefix: "custom_" },
  ir: { kind: "ir", prefix: "ir_" },
  soundfile: { kind: "soundfile", prefix: "sf_" }
};
var ID_LENGTH = 12;
var OPEN_TIMEOUT_MS = 3e3;
var dbPromise = null;
var memoryOnly = false;
var memory = /* @__PURE__ */ new Map();
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const timer = setTimeout(() => reject(new Error(`open timed out after ${OPEN_TIMEOUT_MS} ms`)), OPEN_TIMEOUT_MS);
    const settle = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    resolve = settle(resolve);
    reject = settle(reject);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onblocked = () => reject(new Error("open blocked by another tab"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("kind", "kind");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    if (!memoryOnly) {
      memoryOnly = true;
      console.warn("[assets] no persistent storage \u2014 this session only:", err.message);
    }
    return null;
  });
  return dbPromise;
}
function transact(db, mode, run) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("transaction timed out")), OPEN_TIMEOUT_MS);
    const done = resolve, failed = reject;
    resolve = (v) => {
      clearTimeout(timer);
      done(v);
    };
    reject = (e) => {
      clearTimeout(timer);
      failed(e);
    };
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
var assetStore = {
  /** True when nothing will survive a reload (storage was unavailable). */
  get ephemeral() {
    return memoryOnly;
  },
  /**
   * Save an asset under the hash of its content; an identical one that
   * is already stored is left alone and its id returned.
   *
   * @param {Object} asset
   * @param {string} asset.kind - An ASSET kind
   * @param {Array} asset.identity - What makes this asset itself: the
   *   parts to hash (strings, numbers, typed arrays). NOT the name — the
   *   same bake under two names is one asset.
   * @param {Object} asset.payload - The stored fields (typed arrays welcome)
   * @param {Object} [asset.meta] - Display data: name, and whatever the kind needs
   * @returns {Promise<string>} the id
   */
  async put({ kind, identity, payload, meta = {} }) {
    const spec = ASSET[kind];
    if (!spec) throw new Error(`Unknown asset kind: ${kind}`);
    const id = spec.prefix + (await digest(identity)).slice(0, ID_LENGTH);
    const record = { id, kind, savedAt: Date.now(), meta, ...payload };
    const db = await openDb();
    if (!db) {
      if (!memory.has(id)) memory.set(id, record);
      return id;
    }
    const existing = await transact(db, "readonly", (store) => store.getKey(id));
    if (existing === void 0) await transact(db, "readwrite", (store) => store.put(record));
    return id;
  },
  /** One asset, or null. */
  async get(id) {
    const db = await openDb();
    if (!db) return memory.get(id) ?? null;
    return await transact(db, "readonly", (store) => store.get(id)) ?? null;
  },
  /**
   * Rename an asset. The id is the hash of the CONTENT, and a name is
   * not content — so renaming is a metadata write and every preset that
   * references the asset keeps pointing at it.
   */
  async setName(id, name) {
    const db = await openDb();
    if (!db) {
      const record2 = memory.get(id);
      if (record2) record2.meta = { ...record2.meta, name };
      return;
    }
    const record = await transact(db, "readonly", (store) => store.get(id));
    if (!record) return;
    record.meta = { ...record.meta, name };
    await transact(db, "readwrite", (store) => store.put(record));
  },
  /** Every asset of a kind, oldest first. */
  async list(kind) {
    const db = await openDb();
    if (!db) {
      return [...memory.values()].filter((r) => r.kind === kind).sort((a, b) => a.savedAt - b.savedAt);
    }
    const all = await transact(db, "readonly", (store) => store.index("kind").getAll(kind));
    return (all || []).sort((a, b) => a.savedAt - b.savedAt);
  },
  async remove(id) {
    memory.delete(id);
    const db = await openDb();
    if (db) await transact(db, "readwrite", (store) => store.delete(id));
  },
  /**
   * A kind's assets WITHOUT their payloads: what the library view lists.
   * The bytes are counted here and the records dropped, so browsing a
   * library of sound files doesn't hold every file in memory.
   */
  async summaries(kind) {
    return (await this.list(kind)).map((record) => ({
      id: record.id,
      kind: record.kind,
      name: record.meta?.name || "",
      meta: record.meta || {},
      savedAt: record.savedAt,
      bytes: recordBytes(record)
    }));
  },
  /** Bytes held, by kind — for a future library view and storage limits. */
  async usage() {
    const out = {};
    for (const kind of Object.keys(ASSET)) {
      const records = await this.list(kind);
      out[kind] = { count: records.length, bytes: records.reduce((sum, r) => sum + recordBytes(r), 0) };
    }
    return out;
  },
  /**
   * What the browser has granted this origin and how much of it is spent,
   * or null where it won't say. Its figure covers everything the origin
   * stores, not only the library.
   */
  async quota() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      return estimate ? { usage: estimate.usage || 0, quota: estimate.quota || 0 } : null;
    } catch {
      return null;
    }
  }
};
function recordBytes(record) {
  let bytes = 0;
  for (const value of Object.values(record)) {
    if (ArrayBuffer.isView(value)) bytes += value.byteLength;
    else if (value instanceof ArrayBuffer) bytes += value.byteLength;
  }
  return bytes;
}
async function digest(parts) {
  const bytes = concat(parts);
  if (globalThis.crypto?.subtle) {
    try {
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
    }
  }
  return fnv1a(bytes);
}
function concat(parts) {
  const chunks = parts.map((part) => {
    if (typeof part === "string") return new TextEncoder().encode(part);
    if (typeof part === "number") return new Uint8Array(new Float64Array([part]).buffer);
    if (ArrayBuffer.isView(part)) return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    if (part instanceof ArrayBuffer) return new Uint8Array(part);
    return new TextEncoder().encode(String(part));
  });
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
function fnv1a(bytes) {
  let hi = 52210, lo = 172505283306277;
  let h1 = 2166136261, h2 = 16777619 ^ hi ^ lo & 65535;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
    h2 = Math.imul(h2 + bytes[i] + 1, 2246822507) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// js/dsp/assetLibrary.js
function saveWave({ real, imag, periodMultiplier, name }) {
  return assetStore.put({
    kind: ASSET.wave.kind,
    identity: [real, imag, periodMultiplier],
    payload: { real, imag },
    meta: { periodMultiplier, name }
  });
}
function saveIR({ buffer, name, bakeFrequency }) {
  const pcm = buffer.getChannelData(0).slice();
  return assetStore.put({
    kind: ASSET.ir.kind,
    identity: [pcm, buffer.sampleRate, bakeFrequency],
    payload: { pcm },
    meta: { sampleRate: buffer.sampleRate, bakeFrequency, name }
  });
}
function saveSoundFile({ bytes, name }) {
  return assetStore.put({
    kind: ASSET.soundfile.kind,
    identity: [bytes],
    payload: { bytes },
    meta: { name }
  });
}
function listAssets(kind) {
  return assetStore.summaries(kind);
}
function assetRecord(id) {
  return assetStore.get(id);
}
function renameAsset(id, name) {
  return assetStore.setName(id, name);
}
function forgetAsset(id) {
  return assetStore.remove(id);
}
async function restore(wavetableManager2) {
  const [waves, irs] = await Promise.all([
    assetStore.list(ASSET.wave.kind),
    assetStore.list(ASSET.ir.kind)
  ]);
  for (const record of waves) {
    wavetableManager2.adopt(record.id, {
      real: record.real,
      imag: record.imag,
      periodMultiplier: record.meta?.periodMultiplier || 1,
      name: record.meta?.name || ""
    });
  }
  for (const record of irs) {
    irManager.adopt(record.id, {
      pcm: record.pcm,
      sampleRate: record.meta?.sampleRate || 48e3,
      bakeFrequency: record.meta?.bakeFrequency || 0,
      name: record.meta?.name || ""
    });
  }
  return { waves: waves.length, irs: irs.length };
}
function useContext(ctx, wavetableManager2) {
  wavetableManager2?.useContext(ctx);
  irManager.useContext(ctx);
  sourceManager.useContext?.(ctx);
}

// js/modules/pulse/pulseBus.js
var PulseBus = class {
  constructor() {
    this._subscribers = /* @__PURE__ */ new Map();
    this._sinks = /* @__PURE__ */ new Set();
    this._leadSinks = /* @__PURE__ */ new Set();
    this._clockSinks = /* @__PURE__ */ new Set();
  }
  /** Clock-beat consumers: fn(index, beat). */
  addClockSink(fn) {
    this._clockSinks.add(fn);
    return () => this._clockSinks.delete(fn);
  }
  /** Scheduling consumers — called half a period before a pulse lands. */
  addLeadSink(fn) {
    this._leadSinks.add(fn);
    return () => this._leadSinks.delete(fn);
  }
  /** Reacting consumers — called as a pulse lands: fn(index, pulse). */
  addSink(fn) {
    this._sinks.add(fn);
    return () => this._sinks.delete(fn);
  }
  /**
   * Public API: subscribe to one voice's pulses (0-based index) or all
   * voices with '*'. Returns an unsubscribe function.
   */
  subscribe(voice, fn) {
    const key = voice === "*" ? "*" : Number(voice);
    if (!this._subscribers.has(key)) this._subscribers.set(key, /* @__PURE__ */ new Set());
    this._subscribers.get(key).add(fn);
    return () => this._subscribers.get(key)?.delete(fn);
  }
  /** Entry point — wired to AudioEngine.onPulse (voiceIndex, pulse). */
  dispatch(index, pulse) {
    if (pulse.type === "clock") {
      for (const sink of this._clockSinks) sink(index, pulse);
      return;
    }
    if (pulse.lead) {
      for (const sink of this._leadSinks) sink(index, pulse);
      return;
    }
    for (const sink of this._sinks) sink(index, pulse);
    for (const fn of this._subscribers.get(index) || []) safeCall(fn, index, pulse);
    for (const fn of this._subscribers.get("*") || []) safeCall(fn, index, pulse);
    document.dispatchEvent(new CustomEvent(PULSE, {
      detail: { index, ...pulse }
    }));
  }
  /** Voice frequency carried by the last pulse — handy for consumers. */
  voiceFrequency(index, pulse) {
    return pulse.frequency || AppState.fundamentalFrequency;
  }
};
function safeCall(fn, index, pulse) {
  try {
    fn(index, pulse);
  } catch (err) {
    console.error("[pulse] subscriber threw:", err);
  }
}
var pulseBus = new PulseBus();

// js/modules/pulse/pulseTime.js
function audioTimeToPerformanceMs(ctx, audioTime) {
  const now = window.performance.now();
  if (!ctx || !(audioTime >= 0)) return now;
  const ots = ctx.getOutputTimestamp?.();
  if (ots && ots.performanceTime > 0) {
    return ots.performanceTime + (audioTime - ots.contextTime) * 1e3;
  }
  const latencyMs = (ctx.outputLatency ?? ctx.baseLatency ?? 0) * 1e3;
  return now + (audioTime - ctx.currentTime) * 1e3 + latencyMs;
}
function pulseLandingMs(ctx, pulse) {
  const now = window.performance.now();
  if (!ctx || !(pulse?.frequency > 0) || !(pulse?.audioTime > 0)) return now;
  const periodMs = 1e3 / pulse.frequency;
  let t = audioTimeToPerformanceMs(ctx, pulse.audioTime + 0.5 / pulse.frequency);
  while (t < now) t += periodMs;
  return t;
}
function pulseLandingAudioTime(pulse) {
  if (!(pulse?.frequency > 0) || !(pulse?.audioTime >= 0)) return pulse?.audioTime ?? 0;
  return pulse.audioTime + 0.5 / pulse.frequency;
}

// js/modules/midi/portUtils.js
function resolvePortSelector(ports, selector) {
  if (typeof selector === "number") return ports[Math.round(selector)]?.id ?? null;
  const s = String(selector ?? "").trim();
  if (!s) return null;
  const port = ports.find((p) => p.id === s) || ports.find((p) => p.name === s) || ports.find((p) => p.name.toLowerCase().includes(s.toLowerCase()));
  return port ? port.id : s;
}

// js/modules/midi/pulseMidi.js
var BLIP_MS = 50;
function noteForVoice(index) {
  return Math.max(0, Math.min(127, midiConfig.pulseNoteStart + index));
}
function pulseChannel() {
  return midiConfig.pulseChannel;
}
function velocityForVoice(index) {
  const amp = AppState.harmonicAmplitudes[index] || 0;
  return amp <= 1e-3 ? 0 : Math.max(1, Math.round(amp * 127));
}
function blipForPulse(index, pulse) {
  const midiOn = AppState.oscillatorPulseOuts[index]?.midi ?? midiConfig.pulseMidiEnabled;
  if (!midiOn || !pulse.gateOn) return null;
  const velocity = velocityForVoice(index);
  if (velocity === 0) return null;
  return { note: noteForVoice(index), velocity, channel: pulseChannel(), durationMs: BLIP_MS };
}
function isClockVoice(index) {
  return AppState.midiClockVoice === index;
}

// js/dsp/gate/clockBeats.js
var CLOCK_MIN_HZ = 0.5;
var CLOCK_MAX_HZ = 5;
function clockFold(hz) {
  if (!(hz > 0)) return 0;
  let fold = 0;
  while (hz * 2 ** fold > CLOCK_MAX_HZ) fold--;
  while (hz * 2 ** fold < CLOCK_MIN_HZ) fold++;
  return fold;
}

// js/modules/midi/clockTicks.js
var CLOCK_PPQN = 24;
var DROPOUT_TICKS = 4;
var DROPOUT_MIN_MS = 250;
function planCycleTicks({ boundary, periodMs, cursor = -Infinity, carried = 0 }) {
  const spacing = periodMs / CLOCK_PPQN;
  if (cursor < boundary) {
    return Array.from({ length: CLOCK_PPQN }, (_, k) => boundary + k * spacing);
  }
  const room = boundary + periodMs - cursor;
  const fits = Math.floor(room / (spacing / 2)) - 1;
  const count = Math.max(0, Math.min(CLOCK_PPQN - carried, fits));
  const step = room / (count + 1);
  return Array.from({ length: count }, (_, j) => cursor + (j + 1) * step);
}
function isClockDropout(cursor, nextTick, spacing) {
  return nextTick - cursor > Math.max(DROPOUT_TICKS * spacing, DROPOUT_MIN_MS);
}

// js/modules/midi/midiOutputRouter.js
var NOTE_ON = 144;
var NOTE_OFF = 128;
var CLOCK_TICK = 248;
var CLOCK_START = 250;
var CLOCK_CONTINUE = 251;
var CLOCK_STOP = 252;
var TRANSPORT_AFTER_TICK_MS = 0.1;
var MidiOutputRouter = class {
  constructor() {
    this.midi = null;
    this.output = null;
    this.clockOutput = null;
    this.available = false;
    this._clockRunning = false;
    this._tickCursor = -Infinity;
    this._streamTicks = [];
    this._tickSpacing = null;
  }
  async init() {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.midi = await navigator.requestMIDIAccess();
      const portsChanged = () => {
        this._pick();
        document.dispatchEvent(new CustomEvent(MIDI_PORTS_CHANGED));
      };
      portsChanged();
      this.midi.onstatechange = portsChanged;
    } catch {
      return;
    }
    pulseBus.addLeadSink((index, pulse) => this.onPulse(index, pulse));
    pulseBus.addClockSink((index, beat) => {
      if (this.clockOutput && isClockVoice(index)) this.sendClockTicks(beat);
    });
  }
  /** Resolve the active outputs: configured ports if present, else first. */
  _pick() {
    if (this._selector != null && !this.outputPorts().some((o) => o.id === midiConfig.outputId)) {
      const id = resolvePortSelector(this.outputPorts(), this._selector);
      if (id) midiConfig.outputId = id;
    }
    if (this._clockSelector != null && !this.outputPorts().some((o) => o.id === midiConfig.clockOutputId)) {
      const id = resolvePortSelector(this.outputPorts(), this._clockSelector);
      if (id) midiConfig.clockOutputId = id;
    }
    const outs = this.midi ? [...this.midi.outputs.values()] : [];
    this.output = outs.find((o) => o.id === midiConfig.outputId) || outs[0] || null;
    this.clockOutput = outs.find((o) => o.id === midiConfig.clockOutputId) || this.output;
    this.available = Boolean(this.output);
  }
  /** Available system output ports, for the settings panel's selectors. */
  outputPorts() {
    return this.midi ? [...this.midi.outputs.values()].map((o) => ({ id: o.id, name: o.name })) : [];
  }
  /**
   * Route note blips to a specific output port — by id, 0-based index, or
   * name (see resolvePortSelector). null/'' clears to first available.
   * The raw selector is remembered so it can resolve after late MIDI init.
   */
  selectOutput(selector) {
    const cleared = selector == null || selector === "";
    this._selector = cleared ? null : selector;
    midiConfig.outputId = cleared ? null : resolvePortSelector(this.outputPorts(), selector);
    this._pick();
  }
  /**
   * Route clock + transport to a specific output port. null/'' clears
   * back to "same as note out". A running clock is stopped on the old
   * port first so downstream gear doesn't free-run.
   */
  selectClockOutput(selector) {
    this.stopClock();
    const cleared = selector == null || selector === "";
    this._clockSelector = cleared ? null : selector;
    midiConfig.clockOutputId = cleared ? null : resolvePortSelector(this.outputPorts(), selector);
    this._pick();
  }
  onPulse(index, pulse) {
    if (this.output) {
      const blip = blipForPulse(index, pulse);
      if (blip) this.sendNoteAt(blip, pulseLandingMs(audioEngine.context, pulse));
    }
    if (AppState.midiClockVoice === null) this.stopClock();
  }
  /**
   * A note on/off pair on the note-out port at wall-clock `atMs`
   * (performance.now() timeline). The off is scheduled `durationMs`
   * later — nothing waits on a timer, so page throttling can't drop it.
   */
  sendNoteAt({ note, velocity, channel, durationMs }, atMs) {
    if (!this.output) return;
    const status = Math.max(0, Math.min(15, (channel || 1) - 1));
    this.output.send([NOTE_ON | status, note, velocity], atMs);
    this.output.send([NOTE_OFF | status, note, 0], atMs + durationMs);
  }
  /** One clock tick on the clock port at wall-clock `atMs`. */
  sendClockTickAt(atMs) {
    if (!this.clockOutput) return;
    this.clockOutput.send([CLOCK_TICK], atMs);
    this._tickCursor = Math.max(this._tickCursor, atMs);
  }
  /** Schedule one clock beat's ticks from its {frequency, audioTime} message. */
  sendClockTicks(beat) {
    const freq = beat.frequency;
    if (!(freq > 0)) return;
    const periodMs = 1e3 / freq;
    const boundary = pulseLandingMs(audioEngine.context, beat);
    const ahead = this._streamTicks.filter((t) => t >= boundary);
    const ticks = planCycleTicks({ boundary, periodMs, cursor: this._tickCursor, carried: ahead.length });
    if (ticks.length === 0) return;
    if (!this._clockRunning) {
      this.clockOutput.send([CLOCK_START], ticks[0]);
      this._clockRunning = true;
    } else if (this._tickSpacing !== null && isClockDropout(this._tickCursor, ticks[0], this._tickSpacing)) {
      this.clockOutput.send([CLOCK_CONTINUE], ticks[0]);
    }
    for (const t of ticks) this.clockOutput.send([CLOCK_TICK], t);
    this._streamTicks = [...ahead, ...ticks];
    this._tickCursor = ticks[ticks.length - 1];
    this._tickSpacing = periodMs / CLOCK_PPQN;
  }
  /**
   * End the tick stream's bookkeeping. The cursor stays: ticks already
   * scheduled still fire, and the next START must come after them.
   */
  _endStream() {
    this._clockRunning = false;
    this._streamTicks = [];
    this._tickSpacing = null;
  }
  stopClock() {
    if (this.clockOutput && this._clockRunning) this.clockOutput.send([CLOCK_STOP]);
    this._endStream();
  }
  /**
   * Wall-clock send time for a transport message at audio-clock
   * `atAudioTime` (null = now) — never before the last scheduled tick: a
   * previous run's ticks landing after START would start the receiver
   * early and then leave it without a clock until the first real cycle.
   */
  _transportMs(atAudioTime) {
    const at = atAudioTime != null ? audioTimeToPerformanceMs(audioEngine.context, atAudioTime) : window.performance.now();
    return Math.max(at, this._tickCursor + TRANSPORT_AFTER_TICK_MS);
  }
  /**
   * Transport start on the clock port. Pass the audio-clock time the
   * voices started at and the message is scheduled to their audible
   * onset, through the same clock mapping as blips and ticks; omitted,
   * it fires immediately.
   */
  sendTransportStart(atAudioTime = null) {
    if (!this.clockOutput) return;
    this._endStream();
    this.clockOutput.send([CLOCK_START], this._transportMs(atAudioTime));
    this._clockRunning = true;
  }
  /** Transport continue (resume from a paused position) on the clock port. */
  sendTransportContinue(atAudioTime = null) {
    if (!this.clockOutput) return;
    this._endStream();
    this.clockOutput.send([CLOCK_CONTINUE], this._transportMs(atAudioTime));
    this._clockRunning = true;
  }
  /** Transport stop on the clock port. */
  sendTransportStop() {
    if (!this.clockOutput) return;
    this.clockOutput.send([CLOCK_STOP]);
    this._endStream();
  }
};
var midiOutputRouter = new MidiOutputRouter();

// js/dsp/PartialSpectrum.js
function choosePeriodMultiplier(ratios, maxPeriod, centsTolerance = 0.5) {
  if (ratios.length === 0) return 1;
  let bestPeriod = 1;
  let bestWorst = Infinity;
  for (let period = 1; period <= maxPeriod; period++) {
    const worst = worstDetuneCents(ratios, period);
    if (worst < bestWorst) {
      bestWorst = worst;
      bestPeriod = period;
    }
    if (worst <= centsTolerance) break;
  }
  return bestPeriod;
}
function worstDetuneCents(ratios, period) {
  let worst = 0;
  for (const ratio of ratios) {
    const bin = Math.round(ratio * period);
    if (bin < 1) return Infinity;
    const cents = Math.abs(1200 * Math.log2(bin / period / ratio));
    if (cents > worst) worst = cents;
  }
  return worst;
}
function chooseBeatPreservingPeriod(partials, maxPeriod, maxBin, centsTolerance = 0.5) {
  const ratios = partials.map((p) => p.ratio);
  if (ratios.length === 0) return 1;
  for (let period = 1; period <= maxPeriod; period++) {
    if (worstDetuneCents(ratios, period) > centsTolerance) continue;
    if (countBinCollisions(partials, period, maxBin) === 0) return period;
  }
  return choosePeriodMultiplier(ratios, maxPeriod, centsTolerance);
}
function countBinCollisions(partials, periodMultiplier, maxBin) {
  const occupied = new Uint8Array(maxBin + 1);
  let collisions = 0;
  for (const partial of partials) {
    forEachComponentBin(partial, periodMultiplier, (bin) => {
      if (bin < 1 || bin > maxBin || occupied[bin]) collisions++;
      else occupied[bin] = 1;
    });
  }
  return collisions;
}
function forEachComponentBin(partial, periodMultiplier, fn) {
  const { ratio, source, maxSourceBin } = partial;
  const lastBin = Math.min(
    Math.min(source.real.length, source.imag.length) - 1,
    maxSourceBin ?? Infinity
  );
  const baseBin = source.period === 1 ? Math.round(ratio * periodMultiplier) : 0;
  for (let k = 1; k <= lastBin; k++) {
    if (source.real[k] === 0 && source.imag[k] === 0) continue;
    const bin = source.period === 1 ? k * baseBin : Math.round(k / source.period * ratio * periodMultiplier);
    fn(bin, k);
  }
}
function buildSpectrum(partials, periodMultiplier, maxBin) {
  const real = new Float32Array(maxBin + 1);
  const imag = new Float32Array(maxBin + 1);
  let top = 1;
  for (const partial of partials) {
    const { amplitude, source } = partial;
    forEachComponentBin(partial, periodMultiplier, (bin, k) => {
      if (bin < 1 || bin > maxBin) return;
      real[bin] += amplitude * source.real[k];
      imag[bin] += amplitude * source.imag[k];
      if (bin > top) top = bin;
    });
  }
  return {
    real: real.slice(0, top + 1),
    imag: imag.slice(0, top + 1)
  };
}
function renderSpectrum(spectrum, sampleCount) {
  const { real, imag } = spectrum;
  const bins = Math.min(real.length, imag.length);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const theta = i / sampleCount * 2 * Math.PI;
    let sum = 0;
    for (let k = 1; k < bins; k++) {
      sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
    }
    samples[i] = sum;
  }
  return samples;
}
function spectrumPeak(spectrum, resolution = 2048) {
  const samples = renderSpectrum(spectrum, resolution);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return peak || 1;
}
function normalizeBuffers(buffers) {
  let peak = 0;
  for (const buf of buffers) {
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak > 0) {
    const scale = 1 / peak;
    for (const buf of buffers) {
      for (let i = 0; i < buf.length; i++) buf[i] *= scale;
    }
  }
}

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

// js/audio.js
var MAX_SPECTRUM_BIN = 2047;
var wavetableManager = new WavetableManager();
function setPulseHandler(fn) {
  audioEngine.onPulse = fn;
}
function setDownloadRoutingMode(mode) {
  AppState.downloadRoutingMode = mode;
}
function getWavetableManager() {
  return wavetableManager;
}
async function initAudio() {
  await audioEngine.initialize(AppState.masterGainValue);
  useContext(audioEngine.context, wavetableManager);
  await audioEngine.resume();
}
function waveSlot(name) {
  if (name?.startsWith("custom_")) {
    const wave = wavetableManager.getWaveform(name);
    if (wave) return { wave, period: wavetableManager.getPeriodMultiplier(name) };
  }
  return { wave: audioEngine.standardWave(name || "sine"), period: 1 };
}
function harmonicWaveformPayload() {
  const morph = AppState.waveformMorph;
  if (morph) return { a: waveSlot(morph.a), b: waveSlot(morph.b), morph: morph.t };
  return { a: waveSlot(AppState.currentWaveform) };
}
var WAVEFORM_MORPH_S = 0.02;
function polySampleMode() {
  return AppState.sourceMode === "soundfile" && soundfileConfig.mode === "poly";
}
function harmonicSamplePayload() {
  const tune = soundfileConfig.tune;
  return {
    buffer: sourceManager.fileBuffer,
    loop: AppState.soundfileLoop,
    baseFrequency: tune ? AppState.soundfileFundamental ?? sourceManager.fileFundamental : null,
    range: AppState.soundfileRange
  };
}
function updateAllHarmonicSamples() {
  if (!polySampleMode()) return;
  const sample = harmonicSamplePayload();
  for (const voice of audioEngine.voices.values()) voice.set({ sample });
}
function harmonicClockPayload() {
  const mono = AppState.sourceMode === "soundfile" && !polySampleMode();
  const seconds = mono ? sourceManager.loopSeconds : null;
  return seconds > 0 ? { frequency: 1 / seconds, at: sourceManager.playerStartedAt } : { frequency: null, at: null };
}
function updateAllHarmonicClocks() {
  const clock = harmonicClockPayload();
  for (const voice of audioEngine.voices.values()) voice.set({ clock });
}
function updateAllHarmonicWaveforms(ramp = WAVEFORM_MORPH_S) {
  if (AppState.sourceMode !== "oscillators" || audioEngine.voices.size === 0) return;
  const waveform = harmonicWaveformPayload();
  for (const voice of audioEngine.voices.values()) voice.set({ waveform }, ramp);
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
var startPending = false;
async function startTone({ startAt = null } = {}) {
  if (startPending) return;
  startPending = true;
  try {
    await initAudio();
    if (AppState.isPlaying) return;
    await startToneWithOscillators(startAt);
    updateAppState({ isPlaying: true });
    midiOutputRouter.sendTransportStart(startAt ?? audioEngine.now());
    document.dispatchEvent(new CustomEvent(PLAY_STATE_CHANGED, { detail: { isPlaying: true } }));
  } catch (error) {
    console.error("Failed to start synthesis:", error);
    throw error;
  } finally {
    startPending = false;
  }
}
function createHarmonicVoice(i, ratio, gain, startAt = null) {
  const sampler = polySampleMode();
  const source = !sampler && AppState.sourceMode !== "oscillators" ? sourceManager.node : null;
  const frequency = calculateFrequency(ratio);
  return audioEngine.addVoice(i, {
    source,
    sampler,
    startAt,
    // The wave slots correct for their own table periods; an
    // external-source voice has none (frequency tunes its filter and clock)
    waveform: source || sampler ? void 0 : harmonicWaveformPayload(),
    sample: sampler ? harmonicSamplePayload() : void 0,
    clock: source ? harmonicClockPayload() : void 0,
    frequency,
    gain,
    envelopeOpen: AppState.envelopeMode !== "adsr",
    gate: AppState.oscillatorGates[i],
    sequencer: harmonicSequencerPayload(i),
    pulseOut: harmonicPulseEnabled(i),
    pulseOffset: Boolean(AppState.oscillatorPulseOuts[i]?.offset),
    clockOut: AppState.midiClockVoice === i,
    drive: AppState.oscillatorDrives[i] || 0,
    filter: {
      cutoff: harmonicFilterCutoff(i, frequency),
      q: AppState.oscillatorFilters[i]?.q,
      type: AppState.oscillatorFilters[i]?.type
    },
    convolution: harmonicConvolutionPayload(i),
    pan: getVoicePan(i)
  });
}
async function startToneWithOscillators(startAt = null) {
  if (AppState.sourceMode !== "oscillators" && !polySampleMode()) {
    try {
      await sourceManager.prepare(audioEngine.context, AppState.sourceMode, {
        deviceId: AppState.adcDeviceId,
        channel: AppState.adcChannel,
        loop: AppState.soundfileLoop,
        range: AppState.soundfileRange
      });
    } catch (error) {
      console.error(`Source '${AppState.sourceMode}' unavailable:`, error);
      showStatus(`Source unavailable (${error.message}) \u2014 using oscillators`, "warning");
    }
  }
  const count = Math.min(AppState.currentSystem.ratios.length, AppState.harmonicAmplitudes.length);
  for (let i = 0; i < count; i++) {
    const ratio = AppState.currentSystem.ratios[i];
    if (!(ratio > 0)) continue;
    const amplitude = AppState.harmonicAmplitudes[i] || 0;
    try {
      createHarmonicVoice(i, ratio, amplitude * AppState.masterGainValue, startAt);
    } catch (error) {
      console.error(`Failed to create voice ${i}:`, error);
    }
  }
}
function stopTone() {
  if (!AppState.isPlaying) return;
  audioEngine.stopAllVoices();
  sourceManager.dispose();
  midiOutputRouter.sendTransportStop();
  updateAppState({ isPlaying: false });
  document.dispatchEvent(new CustomEvent(PLAY_STATE_CHANGED, { detail: { isPlaying: false } }));
}
function updateHarmonicAmplitude(index, rampTime = AppState.masterSlewValue) {
  if (!AppState.isPlaying) return;
  const voice = audioEngine.voice(index);
  if (voice) {
    const amplitude = AppState.harmonicAmplitudes[index] || 0;
    voice.set({ gain: amplitude * AppState.masterGainValue }, rampTime);
  } else {
    updateAudioProperties();
  }
}
var MIN_FILTER_HZ = 10;
var MAX_FILTER_PARTIALS = 24;
function filterPartialRatio(step) {
  return seriesStepAt(Math.min(MAX_FILTER_PARTIALS, Math.max(1, Math.round(step)))).ratio;
}
function filterCutoffHz(voiceFrequency, step) {
  return Math.min(2e4, Math.max(MIN_FILTER_HZ, partialFrequency(voiceFrequency, step)));
}
function harmonicFilterCutoff(index, frequency) {
  const multiplier = AppState.oscillatorFilters[index]?.multiplier;
  if (!(multiplier > 0) || !(frequency > 0)) return 2e4;
  return filterCutoffHz(frequency, multiplier);
}
function partialFrequency(frequency, step) {
  return frequency * filterPartialRatio(step);
}
function harmonicSequencerPayload(index) {
  const seq = AppState.oscillatorSequencers[index] || {};
  const shapeName = seq.shape || "square";
  let shape = contourIdFor(shapeName);
  let table;
  if (shape === CONTOUR.custom) {
    const coeffs = AppState.customWaveCoefficients?.[shapeName];
    if (coeffs) {
      const raw = precomputeWavetableFromCoefficients(coeffs, 512);
      let min = Infinity, max = -Infinity;
      for (const v of raw) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const span = max - min || 1;
      table = Float32Array.from(raw, (v) => (v - min) / span);
    } else {
      shape = CONTOUR.hold;
    }
  }
  return {
    shape,
    stretch: seq.stretch || 1,
    amounts: {
      gain: 1,
      freq: 0,
      res: 0,
      ...seq.amounts,
      // Convolution CVs are moot (and would dip the dry mix) without an IR
      wet: harmonicHasIR(index) ? seq.amounts?.wet ?? 0 : 0,
      fb: harmonicHasIR(index) ? seq.amounts?.fb ?? 0 : 0
    },
    ...table !== void 0 ? { table } : {},
    config: {
      ratios: Array.from({ length: MAX_FILTER_PARTIALS }, (_, k) => filterPartialRatio(k + 1)),
      baseStep: AppState.oscillatorFilters[index]?.multiplier || 0
    }
  };
}
function updateHarmonicSequencer(index) {
  audioEngine.voice(index)?.set({ sequencer: harmonicSequencerPayload(index) });
}
function getVoiceLevel(index) {
  return audioEngine.voice(index)?.level() ?? 0;
}
function harmonicCyclePosition(index) {
  return audioEngine.voice(index)?.cyclePosition() ?? null;
}
function getOutputAnalyser() {
  return audioEngine.master?.analyser ?? null;
}
function harmonicPulseEnabled(index) {
  const out = AppState.oscillatorPulseOuts[index];
  return Boolean(
    (out?.midi ?? midiConfig.pulseMidiEnabled) || (out?.osc ?? midiConfig.pulseOscEnabled)
  );
}
function updateAllHarmonicPulses() {
  for (let i = 0; i < AppState.currentSystem.ratios.length; i++) {
    updateHarmonicPulse(i);
  }
}
function updateHarmonicPulse(index) {
  audioEngine.voice(index)?.set({
    pulseOut: harmonicPulseEnabled(index),
    pulseOffset: Boolean(AppState.oscillatorPulseOuts[index]?.offset),
    clockOut: AppState.midiClockVoice === index
  });
}
function harmonicEnvelope(index) {
  return { ...ENVELOPE_DEFAULTS, ...AppState.oscillatorEnvelopes[index] };
}
function triggerHarmonicAttack(index) {
  if (AppState.envelopeMode !== "adsr") return;
  const voice = audioEngine.voice(index);
  if (!voice) return;
  voice.attack(harmonicEnvelope(index));
  if (AppState.sourceMode === "soundfile" && !AppState.soundfileLoop) {
    if (polySampleMode()) {
      voice.retrigger();
    } else {
      sourceManager.retrigger();
      updateAllHarmonicClocks();
    }
  }
}
function triggerHarmonicRelease(index) {
  if (AppState.envelopeMode !== "adsr") return;
  audioEngine.voice(index)?.release(harmonicEnvelope(index));
}
function harmonicEnvelopeLevel(index) {
  if (AppState.envelopeMode !== "adsr") return 1;
  return audioEngine.voice(index)?.envelopeLevel ?? 0;
}
function updateAllHarmonicEnvelopeModes() {
  const envelopeOpen = AppState.envelopeMode !== "adsr";
  for (const voice of audioEngine.voices.values()) voice.set({ envelopeOpen });
}
function updateHarmonicGate(index) {
  audioEngine.voice(index)?.set({ gate: AppState.oscillatorGates[index] || { mode: 0 } });
}
function harmonicHasIR(index) {
  return irManager.has(AppState.oscillatorConvolutions[index]?.ir ?? null);
}
function harmonicConvolutionPayload(index) {
  const conv = AppState.oscillatorConvolutions[index] || {};
  const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
  const buffer = conv.ir ? irManager.pitched(conv.ir, voiceFreq, audioEngine.context) : null;
  const tune = conv.tune ?? 0;
  if (!buffer) {
    return { wet: 0, feedback: 0, gain: conv.gain ?? 1, buffer: null, period: 0 };
  }
  return {
    wet: conv.wet ?? 0,
    feedback: conv.feedback ?? 0,
    gain: conv.gain ?? 1,
    buffer,
    period: tune > 0 && voiceFreq > 0 ? 1 / partialFrequency(voiceFreq, tune) : buffer.duration
  };
}
function updateHarmonicConvolution(index) {
  const voice = audioEngine.voice(index);
  if (!voice) return;
  voice.set({ convolution: harmonicConvolutionPayload(index) });
  updateHarmonicSequencer(index);
}
function updateHarmonicPan(index) {
  audioEngine.voice(index)?.set({ pan: getVoicePan(index) }, AppState.masterSlewValue);
}
function updateHarmonicDrive(index) {
  audioEngine.voice(index)?.set({ drive: AppState.oscillatorDrives[index] || 0 });
}
function updateHarmonicFilter(index) {
  const voice = audioEngine.voice(index);
  if (!voice) return;
  const frequency = calculateFrequency(AppState.currentSystem.ratios[index]);
  voice.set({
    filter: {
      cutoff: harmonicFilterCutoff(index, frequency),
      q: AppState.oscillatorFilters[index]?.q,
      type: AppState.oscillatorFilters[index]?.type
    }
  }, AppState.masterSlewValue);
  updateHarmonicSequencer(index);
}
function updateAudioProperties() {
  if (!AppState.isPlaying) return;
  const rampTime = AppState.masterSlewValue;
  updateAudioPropertiesOscillators(rampTime);
}
var lastSeqConfigSystem = null;
function updateAudioPropertiesOscillators(rampTime) {
  audioEngine.master.setGain(AppState.masterGainValue, rampTime);
  const seqCurveStale = AppState.currentSystem !== lastSeqConfigSystem;
  lastSeqConfigSystem = AppState.currentSystem;
  const numPartials = AppState.currentSystem.ratios.length;
  for (const [i, voice] of audioEngine.voices) {
    if (i >= numPartials) voice.set({ gain: 0 }, rampTime);
  }
  for (let i = 0; i < numPartials; i++) {
    const ratio = AppState.currentSystem.ratios[i];
    const amplitude = AppState.harmonicAmplitudes[i] || 0;
    let newGain = amplitude * AppState.masterGainValue;
    let voice = audioEngine.voice(i);
    if (!voice) {
      if (!(ratio > 0)) continue;
      try {
        voice = createHarmonicVoice(i, ratio, 0);
      } catch (error) {
        console.error(`Failed to create voice ${i}:`, error);
        continue;
      }
    }
    if (seqCurveStale) updateHarmonicSequencer(i);
    const baseFreq = calculateFrequency(ratio);
    if (!isFinite(baseFreq) || isNaN(baseFreq)) {
      newGain = 0;
    } else {
      voice.set({ frequency: baseFreq, filter: { cutoff: harmonicFilterCutoff(i, baseFreq) } }, rampTime);
      updateHarmonicConvolution(i);
    }
    voice.set({ gain: newGain }, rampTime);
  }
}
function restartAudio() {
  if (AppState.isPlaying) {
    stopTone();
    setTimeout(startTone, 50);
  }
}
var primitiveSources = {};
function resolvePrimitiveSource(waveformName) {
  if (waveformName?.startsWith("custom_")) {
    const coeffs = AppState.customWaveCoefficients?.[waveformName];
    if (coeffs) {
      const source = {
        real: coeffs.real,
        imag: coeffs.imag,
        period: AppState.customWavePeriodMultipliers?.[waveformName] || 1
      };
      return {
        source,
        peak: spectrumPeak(source, 2 * Math.max(2048, coeffs.real.length))
      };
    }
    waveformName = "sine";
  }
  const type = ["square", "sawtooth", "triangle"].includes(waveformName) ? waveformName : "sine";
  if (!primitiveSources[type]) {
    let source;
    if (type === "sine") {
      source = { real: new Float32Array(2), imag: Float32Array.from([0, 1]), period: 1 };
    } else {
      const imag = Float32Array.from(WaveformGenerator.getFourierCoefficients(type, 128));
      source = { real: new Float32Array(imag.length), imag, period: 1 };
    }
    primitiveSources[type] = { source, peak: spectrumPeak(source) };
  }
  return primitiveSources[type];
}
function collectBakePartials(isSubharmonic) {
  const { source, peak } = resolvePrimitiveSource(AppState.currentWaveform);
  const nyquist = audioEngine.sampleRate / 2;
  const f0 = AppState.fundamentalFrequency;
  const partials = [];
  for (let h = 0; h < AppState.harmonicAmplitudes.length; h++) {
    const amp = AppState.harmonicAmplitudes[h] || 0;
    const r = AppState.currentSystem.ratios[h];
    if (amp <= 1e-3 || !(r > 0)) continue;
    const ratio = isSubharmonic ? 1 / r : r;
    partials.push({
      index: h,
      ratio,
      amplitude: amp / peak,
      pan: AppState.oscillatorPans?.[h] ?? 0,
      source,
      maxSourceBin: Math.floor(nyquist * source.period / (ratio * f0))
    });
  }
  return partials;
}
async function buildCurrentSpectrum(isSubharmonic = false) {
  await initAudio();
  if (!AppState.currentSystem?.ratios) {
    console.error("Spectral system missing");
    return null;
  }
  const partials = collectBakePartials(isSubharmonic);
  if (partials.length === 0) return null;
  let maxComponentRatio = 0;
  for (const p of partials) {
    const lastBin = Math.min(
      Math.min(p.source.real.length, p.source.imag.length) - 1,
      p.maxSourceBin
    );
    maxComponentRatio = Math.max(
      maxComponentRatio,
      p.ratio,
      lastBin / p.source.period * p.ratio
    );
  }
  const maxPeriod = Math.max(1, Math.floor(MAX_SPECTRUM_BIN / maxComponentRatio));
  const periodMultiplier = chooseBeatPreservingPeriod(partials, maxPeriod, MAX_SPECTRUM_BIN);
  const { real, imag } = buildSpectrum(partials, periodMultiplier, MAX_SPECTRUM_BIN);
  return { real, imag, periodMultiplier, partials };
}
async function sampleCurrentWaveform(routingMode = "mono", isSubharmonic = false) {
  const spectrum = await buildCurrentSpectrum(isSubharmonic);
  if (!spectrum) return { buffer: new Float32Array(0), periodMultiplier: 1 };
  const { periodMultiplier, partials } = spectrum;
  const tableSize = WAVETABLE_SIZE;
  const renderPartial = (partial) => renderSpectrum(buildSpectrum([partial], periodMultiplier, MAX_SPECTRUM_BIN), tableSize);
  switch (routingMode) {
    case "stereo": {
      const left = new Float32Array(tableSize);
      const right = new Float32Array(tableSize);
      for (const partial of partials) {
        const buf = renderPartial(partial);
        const p = (partial.pan + 1) * 0.5;
        const gainL = Math.cos(p * Math.PI * 0.5);
        const gainR = Math.sin(p * Math.PI * 0.5);
        for (let i = 0; i < tableSize; i++) {
          left[i] += buf[i] * gainL;
          right[i] += buf[i] * gainR;
        }
      }
      normalizeBuffers([left, right]);
      return { buffers: [left, right], periodMultiplier };
    }
    case "multichannel": {
      const numChannels = 12;
      const channels = Array.from(
        { length: numChannels },
        () => new Float32Array(tableSize)
      );
      for (const partial of partials) {
        if (partial.index >= numChannels) continue;
        const buf = renderPartial(partial);
        normalizeBuffers([buf]);
        channels[partial.index] = buf;
      }
      return { buffers: channels, periodMultiplier };
    }
    default: {
      const mono = renderSpectrum(spectrum, tableSize);
      normalizeBuffers([mono]);
      return { buffer: mono, periodMultiplier };
    }
  }
}
function exportAsWAV(data, numCycles = 1) {
  if (!audioEngine.context) {
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
  const baseSampleRate = audioEngine.sampleRate;
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
var VISUAL_TABLE_SIZE = 4096;
var wavetableCache = {};
function forgetCustomWaveTable(waveKey) {
  delete wavetableCache[waveKey];
}
function getWaveValue(type, theta, customCoeffs) {
  if (type.startsWith("custom")) {
    let table = wavetableCache[type];
    if (!table) {
      if (!customCoeffs) return Math.sin(theta);
      table = wavetableCache[type] = precomputeWavetableFromCoefficients(customCoeffs, VISUAL_TABLE_SIZE);
    }
    const normalized = theta % (2 * Math.PI) / (2 * Math.PI);
    const index = normalized * table.length;
    const i0 = Math.floor(index) % table.length;
    const i1 = (i0 + 1) % table.length;
    const frac = index - Math.floor(index);
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
async function addWaveformToAudio(spectrum, name = "") {
  await initAudio();
  const waveKey = await saveWave({
    real: spectrum.real,
    imag: spectrum.imag,
    periodMultiplier: spectrum.periodMultiplier,
    name
  });
  getWavetableManager().addFromSpectrum(
    spectrum.real,
    spectrum.imag,
    audioEngine.context,
    spectrum.periodMultiplier,
    waveKey,
    name
  );
  const coefficients = getWavetableManager().getCoefficients(waveKey);
  wavetableCache[waveKey] = precomputeWavetableFromCoefficients(coefficients, VISUAL_TABLE_SIZE);
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

export {
  MIDI_RANGE_SPAN,
  midiConfig,
  recorderConfig,
  presetConfig,
  soundfileConfig,
  persistAppConfig,
  loadAppConfig,
  DRAWBAR_CHANGE,
  DRAWBARS_RANDOMIZED,
  DRAWBARS_RESET,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED,
  ROUTING_MODE_CHANGED,
  FUNDAMENTAL_CHANGED,
  PLAY_STATE_CHANGED,
  MASTER_GAIN_CHANGED,
  MASTER_SLEW_CHANGED,
  OVERTONE_SIGNAL_CHANGED,
  ENVELOPE_MODE_CHANGED,
  MIDI_OUTPUT_CHANGED,
  MIDI_PORTS_CHANGED,
  SOURCE_CHANGED,
  CONVOLUTION_IRS_CHANGED,
  IR_RING_CHANGED,
  RECORDER_CHANGED,
  RECORDINGS_CHANGED,
  LIBRARY_CHANGED,
  PRESETS_CHANGED,
  LAYOUT_MODE_CHANGED,
  SURFACE_CHANGED,
  INSPECTOR_CHANGED,
  LINK_ALL_CHANGED,
  SHAPE_MODE_CHANGED,
  momentumSmoother,
  WAVExporter,
  AudioRecorder,
  audioEngine,
  irManager,
  overviewOfData,
  sourceManager,
  contourFn,
  ASSET,
  assetStore,
  saveIR,
  saveSoundFile,
  listAssets,
  assetRecord,
  renameAsset,
  forgetAsset,
  restore,
  pulseBus,
  audioTimeToPerformanceMs,
  pulseLandingAudioTime,
  resolvePortSelector,
  noteForVoice,
  pulseChannel,
  blipForPulse,
  isClockVoice,
  clockFold,
  CLOCK_PPQN,
  midiOutputRouter,
  choosePeriodMultiplier,
  updateText,
  updateValue,
  showStatus,
  setPulseHandler,
  setDownloadRoutingMode,
  getWavetableManager,
  initAudio,
  harmonicWaveformPayload,
  polySampleMode,
  updateAllHarmonicSamples,
  updateAllHarmonicClocks,
  updateAllHarmonicWaveforms,
  getFrequencyCorrection,
  startTone,
  stopTone,
  updateHarmonicAmplitude,
  MAX_FILTER_PARTIALS,
  filterPartialRatio,
  filterCutoffHz,
  harmonicFilterCutoff,
  partialFrequency,
  updateHarmonicSequencer,
  getVoiceLevel,
  harmonicCyclePosition,
  getOutputAnalyser,
  harmonicPulseEnabled,
  updateAllHarmonicPulses,
  updateHarmonicPulse,
  triggerHarmonicAttack,
  triggerHarmonicRelease,
  harmonicEnvelopeLevel,
  updateAllHarmonicEnvelopeModes,
  updateHarmonicGate,
  updateHarmonicConvolution,
  updateHarmonicPan,
  updateHarmonicDrive,
  updateHarmonicFilter,
  updateAudioProperties,
  restartAudio,
  buildCurrentSpectrum,
  sampleCurrentWaveform,
  exportAsWAV,
  forgetCustomWaveTable,
  getWaveValue,
  addWaveformToAudio,
  precomputeWaveTable,
  precomputeWavetableFromCoefficients,
  freqToMidi,
  generateFilenameParts,
  getVoicePan,
  formatFrequency,
  formatHz,
  calculateFrequency,
  smoothUpdateHarmonicAmplitude,
  smoothUpdateMasterGain,
  smoothUpdateSystem
};
