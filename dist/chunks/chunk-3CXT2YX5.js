import {
  CONV_FEEDBACK_MAX,
  DRIVE_MAX,
  ENV_TIME_MAX,
  OvertoneSignalActions,
  PresetActions,
  Q_MAX,
  TonewheelActions,
  strokePath
} from "./chunk-IXPH2EMF.js";
import {
  ASSET,
  AudioRecorder,
  CLOCK_PPQN,
  DRAWBARS_RANDOMIZED,
  DRAWBARS_RESET,
  DRAWBAR_CHANGE,
  FUNDAMENTAL_CHANGED,
  LIBRARY_CHANGED,
  MAX_FILTER_PARTIALS,
  MIDI_OUTPUT_CHANGED,
  MIDI_PORTS_CHANGED,
  MIDI_RANGE_SPAN,
  RECORDER_CHANGED,
  RECORDINGS_CHANGED,
  SOURCE_CHANGED,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED,
  WAVExporter,
  assetRecord,
  assetStore,
  audioEngine,
  audioTimeToPerformanceMs,
  blipForPulse,
  calculateFrequency,
  choosePeriodMultiplier,
  filterCutoffHz,
  formatHz,
  getFrequencyCorrection,
  getVoicePan,
  initAudio,
  irManager,
  isClockVoice,
  midiConfig,
  midiOutputRouter,
  persistAppConfig,
  polySampleMode,
  pulseBus,
  pulseLandingAudioTime,
  recorderConfig,
  resolvePortSelector,
  restartAudio,
  saveSoundFile,
  showStatus,
  smoothUpdateHarmonicAmplitude,
  smoothUpdateMasterGain,
  smoothUpdateSystem,
  soundfileConfig,
  sourceManager,
  startTone,
  stopTone,
  triggerHarmonicAttack,
  triggerHarmonicRelease,
  updateAllHarmonicClocks,
  updateAllHarmonicSamples,
  updateAudioProperties,
  updateText,
  updateValue
} from "./chunk-YSWKRLK7.js";
import {
  AppState,
  COMPRESS_A_MAX,
  COMPRESS_A_MIN,
  DEFAULT_FILTER_TYPE,
  FILTER_BANK_Q,
  FILTER_TYPES,
  SOUNDFILE_MODES,
  SOURCE_MODES,
  START_HARMONIC_MAX,
  STIFFNESS_B_MAX,
  STRETCH_A_MAX,
  STRETCH_A_MIN,
  __export,
  seriesStepAt,
  setCurrentSystem,
  updateAppState
} from "./chunk-ZE2D7APW.js";

// js/modules/recording/RecordingStore.js
var RecordingStore = class {
  constructor() {
    this.recordings = /* @__PURE__ */ new Map();
    this.count = 0;
  }
  /** @returns {string} key */
  add(recording) {
    this.count++;
    const key = `rec_${this.count}`;
    this.recordings.set(key, { key, ...recording });
    return key;
  }
  get(key) {
    return this.recordings.get(key) || null;
  }
  rename(key, name) {
    const recording = this.recordings.get(key);
    if (recording) recording.name = name;
  }
  /**
   * Drop a take. `count` is NOT decremented: it names the next take, and
   * two takes called "rec 3" in one session would be a worse confusion
   * than a gap in the numbering.
   */
  remove(key) {
    return this.recordings.delete(key);
  }
  /** Next sequence number, for naming a take before it is stored. */
  nextNumber() {
    return this.count + 1;
  }
  /** @returns {Array<{key:string, name:string, duration:number}>} in creation order */
  list() {
    return [...this.recordings.values()].map(({ key, name, duration }) => ({ key, name, duration }));
  }
  keyAt(index) {
    return this.list()[index]?.key ?? null;
  }
  indexOf(key) {
    return this.list().findIndex((r) => r.key === key);
  }
};
var recordingStore = new RecordingStore();

// js/dsp/RecordingPlayer.js
var RecordingPlayer = class {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination - Where playback is routed
   * @param {{sampleRate:number, channels:Float32Array[]}} take - 1 or 2 channels
   */
  constructor(ctx, destination, take) {
    this.ctx = ctx;
    this.destination = destination;
    this.buffer = ctx.createBuffer(take.channels.length, take.channels[0].length, take.sampleRate);
    take.channels.forEach((data, ch) => this.buffer.copyToChannel(data, ch));
    this.source = null;
    this.startedAt = 0;
    this.offset = 0;
    this.onEnded = null;
  }
  get duration() {
    return this.buffer.duration;
  }
  get playing() {
    return this.source !== null;
  }
  /**
   * Start from `offset` seconds at audio time `atTime` (default: now).
   * @returns {number} the audio time playback begins
   */
  play(offset = 0, atTime = null) {
    this.stop();
    const at = atTime ?? this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.destination);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.offset = 0;
      this.onEnded?.();
    };
    source.start(at, Math.max(0, Math.min(offset, this.buffer.duration)));
    this.source = source;
    this.startedAt = at;
    this.offset = offset;
    return at;
  }
  /** Current position in seconds. */
  position() {
    if (!this.source) return this.offset;
    return Math.min(this.buffer.duration, this.offset + Math.max(0, this.ctx.currentTime - this.startedAt));
  }
  /** Stop playback, keeping the position for a later play(). @returns {number} position */
  stop() {
    if (!this.source) return this.offset;
    const position = this.position();
    const source = this.source;
    this.source = null;
    try {
      source.stop();
    } catch {
    }
    try {
      source.disconnect();
    } catch {
    }
    this.offset = position;
    return position;
  }
  /** Mix any number of mono stems to one channel (center-pan equivalent). */
  static mixdown(channels) {
    const length = channels[0]?.length ?? 0;
    const out = new Float32Array(length);
    const scale = Math.SQRT1_2;
    for (const data of channels) {
      for (let i = 0; i < length; i++) out[i] += data[i] * scale;
    }
    return out;
  }
};

// js/dsp/midiFile.js
var DEFAULT_US_PER_BEAT = 5e5;
function secondsToTicks(tempoMap, ppq, seconds2) {
  const map = normalizeTempoMap(tempoMap);
  let ticks = 0;
  for (let i = 0; i < map.length; i++) {
    const seg = map[i];
    const end = i + 1 < map.length ? map[i + 1].time : Infinity;
    if (seconds2 <= seg.time) break;
    const span = Math.min(seconds2, end) - seg.time;
    ticks += span * 1e6 / seg.usPerBeat * ppq;
    if (seconds2 <= end) break;
  }
  return Math.max(0, Math.round(ticks));
}
function normalizeTempoMap(tempoMap) {
  const map = (tempoMap || []).filter((t) => t && t.usPerBeat > 0 && Number.isFinite(t.time)).map((t) => ({ time: Math.max(0, t.time), usPerBeat: t.usPerBeat })).sort((a, b) => a.time - b.time);
  if (map.length === 0) return [{ time: 0, usPerBeat: DEFAULT_US_PER_BEAT }];
  if (map[0].time > 0) map.unshift({ time: 0, usPerBeat: map[0].usPerBeat });
  return map;
}
function tempoMapFromBeats(beats, { tolerance = 1e-3 } = {}) {
  const times = (beats || []).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (times.length < 2) return [];
  const map = [];
  let runStart = 0;
  let runMean = times[1] - times[0];
  for (let i = 1; i < times.length; i++) {
    const interval = times[i] - times[i - 1];
    const n = i - runStart;
    if (n > 0 && Math.abs(interval - runMean) > tolerance * runMean) {
      map.push({ time: times[runStart], usPerBeat: runMean * 1e6 });
      runStart = i - 1;
      runMean = interval;
    } else {
      runMean = (times[i] - times[runStart]) / n;
    }
  }
  map.push({ time: times[runStart], usPerBeat: runMean * 1e6 });
  return map;
}
function vlq(value) {
  const bytes = [value & 127];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift(v & 127 | 128);
    v >>= 7;
  }
  return bytes;
}
function textBytes(str) {
  return [...str].map((c) => c.charCodeAt(0) & 127);
}
function u32(value) {
  return [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255];
}
function u16(value) {
  return [value >>> 8 & 255, value & 255];
}
function trackChunk(events, endTick) {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body = [];
  let last = 0;
  for (const ev of sorted) {
    body.push(...vlq(Math.max(0, ev.tick - last)), ...ev.bytes);
    last = Math.max(last, ev.tick);
  }
  body.push(...vlq(Math.max(0, endTick - last)), 255, 47, 0);
  return [...textBytes("MTrk"), ...u32(body.length), ...body];
}
function metaEvent(tick, type, data, order = 0) {
  return { tick, order, bytes: [255, type, ...vlq(data.length), ...data] };
}
function encodeMidiFile(doc, { fixedTempo = false } = {}) {
  const ppq = doc.ppq || 960;
  const fullMap = normalizeTempoMap(doc.tempoMap);
  const tempoMap = fixedTempo ? [fullMap[0]] : fullMap;
  const toTicks = (seconds2) => secondsToTicks(tempoMap, ppq, seconds2);
  const endTick = toTicks(doc.duration || 0);
  const tempoTrack = [
    metaEvent(0, 3, textBytes(doc.name || "twig")),
    metaEvent(0, 88, [4, 2, 24, 8])
    // 4/4
  ];
  for (const t of tempoMap) {
    const us = Math.max(1, Math.min(16777215, Math.round(t.usPerBeat)));
    tempoTrack.push(metaEvent(toTicks(t.time), 81, [us >> 16 & 255, us >> 8 & 255, us & 255], 1));
  }
  const chunks = [trackChunk(tempoTrack, endTick)];
  for (const track of doc.tracks || []) {
    const status = Math.max(0, Math.min(15, (track.channel || 1) - 1));
    const events = [metaEvent(0, 3, textBytes(track.name || ""))];
    for (const n of track.notes || []) {
      const on = toTicks(n.time);
      const off = Math.max(on + 1, toTicks(n.time + (n.durationMs || 0) / 1e3));
      const note = Math.max(0, Math.min(127, Math.round(n.note)));
      const velocity = Math.max(1, Math.min(127, Math.round(n.velocity)));
      events.push({ tick: on, order: 2, bytes: [144 | status, note, velocity] });
      events.push({ tick: off, order: 1, bytes: [128 | status, note, 0] });
    }
    chunks.push(trackChunk(events, endTick));
  }
  const header = [...textBytes("MThd"), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(ppq)];
  return Uint8Array.from([...header, ...chunks.flat()]);
}

// js/dsp/zipStore.js
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  }
  return (c ^ 4294967295) >>> 0;
}
function dosDateTime(date) {
  const d = date || new Date(1980, 0, 1);
  return {
    time: d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1,
    date: d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()
  };
}
function buildZip(entries, date) {
  const { time, date: dosDate } = dosDateTime(date);
  const nameBytes = entries.map((e) => Uint8Array.from([...e.name].map((c) => c.charCodeAt(0) & 127)));
  const crcs = entries.map((e) => crc32(e.data));
  const localSize = entries.reduce((n, e, i) => n + 30 + nameBytes[i].length + e.data.length, 0);
  const centralSize = entries.reduce((n, _, i) => n + 46 + nameBytes[i].length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets = [];
  entries.forEach((entry, i) => {
    offsets.push(pos);
    view.setUint32(pos, 67324752, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, time, true);
    view.setUint16(pos + 12, dosDate, true);
    view.setUint32(pos + 14, crcs[i], true);
    view.setUint32(pos + 18, entry.data.length, true);
    view.setUint32(pos + 22, entry.data.length, true);
    view.setUint16(pos + 26, nameBytes[i].length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(nameBytes[i], pos + 30);
    out.set(entry.data, pos + 30 + nameBytes[i].length);
    pos += 30 + nameBytes[i].length + entry.data.length;
  });
  const centralStart = pos;
  entries.forEach((entry, i) => {
    view.setUint32(pos, 33639248, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, time, true);
    view.setUint16(pos + 14, dosDate, true);
    view.setUint32(pos + 16, crcs[i], true);
    view.setUint32(pos + 20, entry.data.length, true);
    view.setUint32(pos + 24, entry.data.length, true);
    view.setUint16(pos + 28, nameBytes[i].length, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, offsets[i], true);
    out.set(nameBytes[i], pos + 46);
    pos += 46 + nameBytes[i].length;
  });
  view.setUint32(pos, 101010256, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - centralStart, true);
  view.setUint32(pos + 16, centralStart, true);
  return out;
}

// js/modules/recording/midiCapture.js
var MidiCapture = class {
  constructor() {
    this.notes = [];
    this.beats = [];
    this._unsubscribe = null;
  }
  get active() {
    return this._unsubscribe !== null;
  }
  start() {
    if (this.active) return;
    this.notes = [];
    this.beats = [];
    const offPulse = pulseBus.addLeadSink((index, pulse) => this._onPulse(index, pulse));
    const offClock = pulseBus.addClockSink((index, beat) => {
      if (isClockVoice(index)) this.beats.push(pulseLandingAudioTime(beat));
    });
    this._unsubscribe = () => {
      offPulse();
      offClock();
    };
  }
  /** @returns {{notes: Array, beats: number[]}} */
  stop() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    return { notes: this.notes, beats: this.beats };
  }
  _onPulse(index, pulse) {
    const time = pulseLandingAudioTime(pulse);
    const blip = blipForPulse(index, pulse);
    if (blip) this.notes.push({ time, voice: index, ...blip });
  }
};

// js/modules/recording/midiDocument.js
var PPQ = 960;
var DEFAULT_US_PER_BEAT2 = 5e5;
var START_SLACK_S = 5e-4;
function buildMidiDocument(log, take, { midiMode = "single", name = "twig" } = {}) {
  const { startTime, duration } = take;
  const inTake = (t) => t >= startTime - START_SLACK_S && t <= startTime + duration;
  const notes = log.notes.filter((n) => inTake(n.time)).map((n) => ({ ...n, time: Math.max(0, n.time - startTime) })).sort((a, b) => a.time - b.time);
  const beats = log.beats.filter(inTake).map((t) => Math.max(0, t - startTime));
  const tempoMap = normalizeTempoMap(tempoMapFromBeats(beats));
  const hasClock = beats.length >= 2;
  const tracks = midiMode === "multi" ? tracksPerVoice(notes) : [{ name: "twig", channel: notes[0]?.channel ?? 1, notes }];
  return {
    name,
    ppq: PPQ,
    duration,
    hasClock,
    tempoMap: hasClock ? tempoMap : [{ time: 0, usPerBeat: DEFAULT_US_PER_BEAT2 }],
    tracks
  };
}
function tracksPerVoice(notes) {
  const byVoice = /* @__PURE__ */ new Map();
  for (const n of notes) {
    if (!byVoice.has(n.voice)) byVoice.set(n.voice, []);
    byVoice.get(n.voice).push(n);
  }
  return [...byVoice.keys()].sort((a, b) => a - b).map((voice) => ({
    name: `overtone ${voice + 1}`,
    channel: voice % 16 + 1,
    notes: byVoice.get(voice).map((n) => ({ ...n, channel: voice % 16 + 1 }))
  }));
}

// js/modules/recording/midiPlayback.js
var LOOKAHEAD_S = 1.5;
var INTERVAL_MS = 250;
var MidiPlayback = class {
  constructor() {
    this._timer = null;
    this._notes = [];
    this._noteIndex = 0;
    this._ticks = null;
    this._anchor = 0;
    this._offset = 0;
    this._end = 0;
  }
  get running() {
    return this._timer !== null;
  }
  /**
   * @param {Object} doc - MIDI document (see midiDocument.js)
   * @param {number} offset - Position (seconds) within the take
   * @param {number} anchor - Audio-clock time that position starts sounding
   */
  start(doc, offset, anchor) {
    this.stop();
    this._notes = doc.tracks.flatMap((t) => t.notes).sort((a, b) => a.time - b.time);
    this._noteIndex = this._notes.findIndex((n) => n.time >= offset);
    if (this._noteIndex < 0) this._noteIndex = this._notes.length;
    this._ticks = doc.hasClock ? clockTicks(doc.tempoMap, offset) : null;
    this._anchor = anchor;
    this._offset = offset;
    this._end = anchor + (doc.duration - offset);
    if (doc.hasClock) {
      if (offset > 0) midiOutputRouter.sendTransportContinue(anchor);
      else midiOutputRouter.sendTransportStart(anchor);
    }
    this._fill();
    this._timer = setInterval(() => this._fill(), INTERVAL_MS);
  }
  /** Stop scheduling. Already-handed-off events (≤ LOOKAHEAD_S) still play. */
  stop() {
    if (!this.running) return;
    clearInterval(this._timer);
    this._timer = null;
    if (this._ticks) midiOutputRouter.sendTransportStop();
    this._ticks = null;
  }
  _fill() {
    const ctx = audioEngine.context;
    if (!ctx) return;
    const horizon = Math.min(this._end, ctx.currentTime + LOOKAHEAD_S);
    const toMs = (docTime) => audioTimeToPerformanceMs(ctx, this._anchor + (docTime - this._offset));
    while (this._noteIndex < this._notes.length) {
      const note = this._notes[this._noteIndex];
      if (this._anchor + (note.time - this._offset) > horizon) break;
      midiOutputRouter.sendNoteAt(note, toMs(note.time));
      this._noteIndex++;
    }
    if (this._ticks) {
      for (; ; ) {
        const t = this._ticks.peek();
        if (t === null || this._anchor + (t - this._offset) > horizon) break;
        midiOutputRouter.sendClockTickAt(toMs(t));
        this._ticks.next();
      }
    }
    if (ctx.currentTime >= this._end) this.stop();
  }
};
function clockTicks(tempoMap, from) {
  const map = normalizeTempoMap(tempoMap);
  const tickLen = (i) => map[i].usPerBeat / 1e6 / CLOCK_PPQN;
  let seg = 0;
  let t = 0;
  const advance = () => {
    t += tickLen(seg);
    while (seg + 1 < map.length && t >= map[seg + 1].time - 1e-9) {
      seg++;
      t = map[seg].time;
    }
  };
  while (t < from) advance();
  return {
    peek: () => t,
    next: () => {
      advance();
    }
  };
}
var midiPlayback = new MidiPlayback();

// js/dsp/VideoRecorder.js
var CANDIDATES = [
  ['video/mp4;codecs="avc1.4d002a,mp4a.40.2"', "mp4"],
  ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "mp4"],
  ["video/mp4", "mp4"],
  ["video/webm;codecs=vp9,opus", "webm"],
  ["video/webm;codecs=vp8,opus", "webm"],
  ["video/webm", "webm"]
];
var BITS_PER_PIXEL = 0.1;
var MAX_BITRATE = 24e6;
var VideoRecorder = class _VideoRecorder {
  /** @returns {{mimeType: string, extension: string}|null} */
  static format() {
    if (typeof MediaRecorder === "undefined") return null;
    if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) return null;
    for (const [mimeType, extension] of CANDIDATES) {
      if (MediaRecorder.isTypeSupported?.(mimeType)) return { mimeType, extension };
    }
    return null;
  }
  static supported() {
    return _VideoRecorder.format() !== null;
  }
  /**
   * @param {HTMLCanvasElement} canvas - Filmed as it is drawn
   * @param {Object} opts
   * @param {AudioNode} opts.audioSource - Tapped for the video's audio track
   * @param {number} [opts.frameRate=60] - Only used to size the bitrate
   */
  constructor(canvas, { audioSource, frameRate = 60 }) {
    this.canvas = canvas;
    this.audioSource = audioSource;
    this.frameRate = frameRate;
    this.recorder = null;
    this.audioTap = null;
    this.chunks = [];
    this.format = _VideoRecorder.format();
  }
  /** Begin filming now. Throws if the runtime can't record video. */
  start() {
    if (this.recorder) throw new Error("VideoRecorder already recording");
    if (!this.format) throw new Error("video recording unsupported");
    const stream = this.canvas.captureStream();
    this.audioTap = this.audioSource.context.createMediaStreamDestination();
    this.audioSource.connect(this.audioTap);
    for (const track of this.audioTap.stream.getAudioTracks()) stream.addTrack(track);
    const pixels = this.canvas.width * this.canvas.height;
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.format.mimeType,
      videoBitsPerSecond: Math.min(MAX_BITRATE, Math.round(pixels * this.frameRate * BITS_PER_PIXEL))
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }
  /**
   * Stop and assemble the film. Null when nothing was encoded — filming
   * never started, or the window was too short for a single frame (a sync
   * loop can be a few milliseconds long).
   * @returns {Promise<{blob: Blob, mimeType: string, extension: string}|null>}
   */
  stop() {
    const recorder2 = this.recorder;
    if (!recorder2) return Promise.resolve(null);
    this.recorder = null;
    return new Promise((resolve) => {
      recorder2.onstop = () => {
        this._release();
        const blob = new Blob(this.chunks, { type: this.format.mimeType });
        this.chunks = [];
        resolve(blob.size > 0 ? { blob, mimeType: this.format.mimeType, extension: this.format.extension } : null);
      };
      recorder2.stop();
    });
  }
  _release() {
    if (!this.audioTap) return;
    try {
      this.audioSource.disconnect(this.audioTap);
    } catch {
    }
    for (const track of this.audioTap.stream.getAudioTracks()) track.stop();
    this.audioTap = null;
  }
};

// js/modules/recording/videoCapture.js
var VIDEO_SIZES = { small: 480, medium: 960, large: 1920 };
var TonewheelFilm = class {
  constructor() {
    this.film = null;
    this.recorder = null;
    this.timers = [];
    this.stopping = null;
  }
  /** The runtime can record video at all. */
  static available() {
    return VideoRecorder.supported();
  }
  /** The container the next film will be written in ('mp4' | 'webm'). */
  static extension() {
    return VideoRecorder.format()?.extension ?? null;
  }
  /**
   * Film the tonewheel over a take's capture window.
   * @param {Object} opts
   * @param {number} opts.pixels - Square export resolution
   * @param {number|null} [opts.atTime] - Audio-clock start (null = now)
   * @param {number|null} [opts.endTime] - Audio-clock stop; the film then
   *   ends itself, and stop() returns what it captured
   */
  start({ pixels, atTime = null, endTime = null }) {
    if (this.recorder) return;
    this.stopping = null;
    this.film = TonewheelActions.createFilmSketch(pixels);
    this.recorder = new VideoRecorder(this.film.canvas, { audioSource: audioEngine.master.limiter });
    this._at(atTime, () => this.recorder?.start());
    if (endTime != null) this._at(endTime, () => this.stop());
  }
  /**
   * Stop and assemble. Idempotent, and the result KEEPS: a sync loop's
   * film ends itself at the scheduled end time, and the recorder's
   * finalize — which runs later, when the audio thread reports the take —
   * asks again and must get the same film. Null when nothing was filmed.
   * @returns {Promise<{blob: Blob, mimeType: string, extension: string}|null>}
   */
  stop() {
    if (this.stopping) return this.stopping;
    const recorder2 = this.recorder;
    if (!recorder2) return Promise.resolve(null);
    const film = this.film;
    this._clearTimers();
    this.recorder = null;
    this.film = null;
    this.stopping = recorder2.stop().then((video) => {
      film.dispose();
      return video;
    });
    return this.stopping;
  }
  /** Run `fn` at an audio-clock time (immediately when it has passed). */
  _at(time, fn) {
    const delay = time == null ? 0 : (time - audioEngine.now()) * 1e3;
    if (delay <= 0) {
      fn();
      return;
    }
    this.timers.push(setTimeout(fn, delay));
  }
  _clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
};
var tonewheelFilm = new TonewheelFilm();

// js/modules/recording/recordingActions.js
var AUDIO_MODES = ["mono", "stereo", "multitrack"];
var MIDI_MODES = ["single", "multi"];
var TEMPO_MODES = ["fixed", "map"];
var LENGTH_MODES = ["manual", "loop"];
var VIDEO_SIZE_MODES = Object.keys(VIDEO_SIZES);
var ARM_TIMEOUT_MS = 3e3;
var PLAY_LEAD_S = 0.08;
var SYNC_MAX_SECONDS = 300;
var SYNC_MAX_PERIOD = 4096;
var SYNC_LEAD_S = 0.25;
var SYNC_WINDOW_MARGIN_S = 0.05;
var SYNC_SETTLE_MAX_S = 2;
var capture = new MidiCapture();
var recorder = null;
var takeStart = null;
var takeFrequencies = [];
var arm = null;
var player = null;
var playerKey = null;
function setRecorder(patch) {
  Object.assign(AppState.recorder, patch);
  document.dispatchEvent(new CustomEvent(RECORDER_CHANGED, { detail: { ...AppState.recorder } }));
}
function setConfig(patch) {
  Object.assign(recorderConfig, patch);
  persistAppConfig();
  document.dispatchEvent(new CustomEvent(RECORDER_CHANGED, { detail: { ...recorderConfig } }));
}
function clearArm() {
  if (!arm) return;
  arm.unsubscribe?.();
  clearTimeout(arm.timer);
  arm = null;
}
function syncLoopPlan() {
  const f0 = AppState.fundamentalFrequency;
  if (AppState.sourceMode !== "oscillators" || !(f0 > 0)) return null;
  const correction = getFrequencyCorrection(AppState.currentWaveform);
  const ratios = AppState.currentSystem.ratios.filter((r) => r > 0).map((r) => r * correction);
  if (ratios.length === 0) return null;
  const maxPeriod = Math.max(1, Math.min(SYNC_MAX_PERIOD, Math.floor(SYNC_MAX_SECONDS * f0)));
  const periods = choosePeriodMultiplier(ratios, maxPeriod);
  const duration = periods / f0;
  return { periods, duration: duration <= SYNC_MAX_SECONDS ? duration : null };
}
function clockWillBeat() {
  const index = AppState.midiClockVoice;
  return AppState.isPlaying && index != null && AppState.currentSystem.ratios[index] > 0;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatDuration(seconds2) {
  if (seconds2 < 9.95) return `${seconds2.toFixed(1)}s`;
  const s = Math.round(seconds2);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
function fileStamp(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}
async function finalizeTake(take) {
  const log = capture.stop();
  const film = tonewheelFilm.stop();
  recorder = null;
  setRecorder({ status: "idle" });
  const video = await film;
  if (!take || take.duration <= 0) return;
  const number = recordingStore.nextNumber();
  const base = `twig-rec-${pad2(number)}-${fileStamp(/* @__PURE__ */ new Date())}`;
  const midi = buildMidiDocument(log, take, { midiMode: recorderConfig.midiMode, name: base });
  const key = recordingStore.add({
    name: `rec ${number} (${formatDuration(take.duration)})`,
    base,
    audioMode: recorderConfig.audioMode,
    audio: { sampleRate: take.sampleRate, channels: take.channels },
    voiceFrequencies: takeFrequencies.slice(0, take.channels.length),
    midi,
    video,
    duration: take.duration
  });
  document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key } }));
  RecordingActions.select(key);
  showStatus(`Recorded ${formatDuration(take.duration)} \u2014 ${take.channels.length} ch audio, ${midi.tracks.reduce((n, t) => n + t.notes.length, 0)} MIDI notes` + (video ? `, ${VIDEO_SIZES[recorderConfig.videoSize]}px .${video.extension}` : ""), "success");
}
function startFilm(span) {
  if (!recorderConfig.videoEnabled) return;
  if (!TonewheelFilm.available()) {
    showStatus("This browser cannot record video \u2014 audio and MIDI only", "warning");
    return;
  }
  tonewheelFilm.start({ pixels: VIDEO_SIZES[recorderConfig.videoSize] ?? VIDEO_SIZES.medium, ...span });
}
function selectedRecording() {
  return recordingStore.get(AppState.recorder.selected);
}
function ensurePlayer(recording) {
  if (player && playerKey === recording.key) return player;
  player?.stop();
  const ctx = audioEngine.context;
  const take = recording.audioMode === "multitrack" ? { sampleRate: recording.audio.sampleRate, channels: [RecordingPlayer.mixdown(recording.audio.channels)] } : recording.audio;
  const destination = recording.audioMode === "multitrack" ? audioEngine.master.input : ctx.destination;
  player = new RecordingPlayer(ctx, destination, take);
  player.onEnded = () => {
    midiPlayback.stop();
    setRecorder({ transport: "stopped" });
  };
  playerKey = recording.key;
  return player;
}
function stemExportGain(channels) {
  let peak = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  return peak > 1 ? 1 / peak : 1;
}
function stemNames(frequencies, count) {
  const seen = /* @__PURE__ */ new Map();
  return Array.from({ length: count }, (_, i) => {
    const hz = frequencies[i];
    let stem = hz > 0 ? `${hz.toFixed(2).replace(/\.?0+$/, "")}Hz` : `overtone-${i + 1}`;
    const n = (seen.get(stem) || 0) + 1;
    seen.set(stem, n);
    if (n > 1) stem += `_${n}`;
    return `${stem}.wav`;
  });
}
var RecordingActions = {
  setAudioMode(mode) {
    if (AUDIO_MODES.includes(mode)) setConfig({ audioMode: mode });
  },
  setMidiMode(mode) {
    if (MIDI_MODES.includes(mode)) setConfig({ midiMode: mode });
  },
  /** Applies at export time, so an existing take can be re-downloaded either way. */
  setTempoMode(mode) {
    if (TEMPO_MODES.includes(mode)) setConfig({ tempoMode: mode });
  },
  setLengthMode(mode) {
    if (LENGTH_MODES.includes(mode)) setConfig({ lengthMode: mode });
  },
  /** Film the tonewheel alongside the next take. */
  setVideoEnabled(on) {
    setConfig({ videoEnabled: Boolean(on) });
  },
  setVideoSize(size) {
    if (VIDEO_SIZE_MODES.includes(size)) setConfig({ videoSize: size });
  },
  /** Record button: idle → arm/start; armed or recording → stop. */
  async toggleRecord() {
    if (AppState.recorder.status === "idle") await this.startRecording();
    else await this.stopRecording();
  },
  async startRecording() {
    if (AppState.recorder.status !== "idle") return;
    await initAudio();
    if (!audioEngine.recorderReady) {
      showStatus("Recording is unavailable in this browser", "error");
      return;
    }
    const { audioMode } = recorderConfig;
    const taps = audioEngine.master.recordingTaps(audioMode, AppState.currentSystem.ratios.length);
    recorder = new AudioRecorder(audioEngine.context);
    takeStart = null;
    capture.start();
    setRecorder({ status: "armed" });
    const begin = (atTime) => {
      if (!arm || arm.started) return;
      arm.started = true;
      clearArm();
      takeFrequencies = AppState.currentSystem.ratios.map((r) => calculateFrequency(r));
      startFilm({ atTime });
      recorder.start({ ...taps, atTime }).then((startTime) => {
        takeStart = startTime;
        if (AppState.recorder.status === "armed") setRecorder({ status: "recording" });
      });
    };
    arm = { started: false, unsubscribe: null, timer: null };
    if (recorderConfig.lengthMode === "loop") {
      const plan = syncLoopPlan();
      if (plan) {
        await this._startSyncLoop(recorder, taps, plan);
        return;
      }
      showStatus("Sync loop needs the oscillators source \u2014 recording until stopped", "warning");
    }
    if (clockWillBeat()) {
      arm.unsubscribe = pulseBus.addClockSink((index, message) => {
        if (!isClockVoice(index)) return;
        const beat = pulseLandingAudioTime(message);
        if (beat > audioEngine.now()) begin(beat);
      });
      arm.timer = setTimeout(() => begin(null), ARM_TIMEOUT_MS);
    } else {
      begin(null);
    }
  },
  /**
   * Sync loop: rebuild the voice bank so every oscillator starts at
   * phase 0 on one shared frame (t0), then capture exactly one
   * realignment period T. Short loops (≤ SYNC_SETTLE_MAX_S) capture the
   * SECOND period — t0+T .. t0+2T — keeping the master chain's restart
   * transient out; longer ones record the first, starting the moment
   * the bank restarts. No reachable T at all (stubborn irrational
   * stack): record open-ended from t0 until stopped — the phases were
   * still resynced at sample 0. Timed takes' end frames are enforced on
   * the audio thread (sample-exact) and land through onEnded.
   */
  async _startSyncLoop(active, taps, plan) {
    clearArm();
    if (AppState.isPlaying) stopTone();
    const t0 = audioEngine.now() + SYNC_LEAD_S;
    await startTone({ startAt: t0 });
    takeFrequencies = AppState.currentSystem.ratios.map((r) => calculateFrequency(r));
    active.onEnded = (take) => {
      if (recorder === active) finalizeTake(take);
    };
    let atTime = t0;
    let endTime = null;
    if (plan.duration == null) {
      showStatus(`Sync: phases restarted \u2014 no realignment within ${SYNC_MAX_SECONDS / 60} min, recording until stopped`, "warning");
    } else {
      const settle = plan.duration <= SYNC_SETTLE_MAX_S ? 1 : 0;
      atTime = t0 + settle * plan.duration;
      if (settle) {
        while (atTime < audioEngine.now() + SYNC_WINDOW_MARGIN_S) atTime += plan.duration;
      }
      endTime = atTime + plan.duration;
      showStatus(`Sync loop: ${plan.duration.toFixed(3)} s (${plan.periods} \xD7 fundamental period)`, "info");
    }
    startFilm({ atTime, endTime });
    active.start({ ...taps, atTime, endTime }).then((startTime) => {
      takeStart = startTime;
      if (recorder === active && AppState.recorder.status === "armed") setRecorder({ status: "recording" });
    });
  },
  async stopRecording() {
    const status = AppState.recorder.status;
    if (status === "idle" || !recorder) return;
    clearArm();
    const active = recorder;
    const take = active.recording ? await active.stop() : null;
    finalizeTake(take);
  },
  // ---- Transport ----------------------------------------------------
  select(key) {
    if (key === AppState.recorder.selected) return;
    this.reset();
    setRecorder({ selected: recordingStore.get(key) ? key : null });
  },
  selectStep(step) {
    const list = recordingStore.list();
    if (list.length === 0) return;
    const current = recordingStore.indexOf(AppState.recorder.selected);
    const next = ((current < 0 ? 0 : current + step) + list.length) % list.length;
    this.select(list[next].key);
  },
  async play() {
    const recording = selectedRecording();
    if (!recording || AppState.recorder.transport === "playing") return;
    await initAudio();
    const p = ensurePlayer(recording);
    const offset = p.offset;
    const at = audioEngine.now() + PLAY_LEAD_S;
    p.play(offset, at);
    midiPlayback.start(recording.midi, offset, at);
    setRecorder({ transport: "playing" });
  },
  pause() {
    if (AppState.recorder.transport !== "playing") return;
    player?.stop();
    midiPlayback.stop();
    setRecorder({ transport: "paused" });
  },
  togglePlay() {
    if (AppState.recorder.transport === "playing") this.pause();
    else this.play();
  },
  reset() {
    player?.stop();
    if (player) player.offset = 0;
    midiPlayback.stop();
    if (AppState.recorder.transport !== "stopped") setRecorder({ transport: "stopped" });
  },
  /**
   * Seconds recorded so far, on the audio clock (0 while idle or armed —
   * a sync loop's capture window may still lie ahead of "now").
   */
  recordingElapsed() {
    if (AppState.recorder.status !== "recording" || takeStart == null) return 0;
    return Math.max(0, audioEngine.now() - takeStart);
  },
  /** Playback position in seconds (0 when nothing is loaded). */
  position() {
    return player && playerKey === AppState.recorder.selected ? player.position() : 0;
  },
  // ---- Export -------------------------------------------------------
  downloadWav() {
    const recording = selectedRecording();
    if (!recording) return;
    const gain2 = recording.audioMode === "multitrack" ? stemExportGain(recording.audio.channels) : 1;
    const bytes = WAVExporter.createWAVBufferMulti(recording.audio.channels, recording.audio.sampleRate, { float: true, gain: gain2 });
    WAVExporter.downloadFile(bytes, `${recording.base}.wav`, "audio/wav");
  },
  /** The take's animation on its own (mp4 where the browser writes one). */
  downloadVideo() {
    const { video, base } = selectedRecording() || {};
    if (!video) return;
    WAVExporter.downloadFile(video.blob, `${base}.${video.extension}`, video.mimeType);
  },
  /**
   * The whole take as one .zip: its audio (one mono 32-bit-float .wav per
   * overtone for a multitrack take, each named by the voice's frequency at
   * recording start — otherwise the single master .wav), the .mid, and the
   * animation when one was filmed. Everything shares the take's file stem
   * so the bundle drops into a DAW whole.
   */
  async downloadBundle() {
    const recording = selectedRecording();
    if (!recording) return;
    const { base, audio } = recording;
    const entries = [];
    if (recording.audioMode === "multitrack") {
      const names = stemNames(recording.voiceFrequencies || [], audio.channels.length);
      const gain2 = stemExportGain(audio.channels);
      for (const [i, channel] of audio.channels.entries()) {
        entries.push({
          name: `${base}/${names[i]}`,
          data: new Uint8Array(WAVExporter.createWAVBufferMulti([channel], audio.sampleRate, { float: true, gain: gain2 }))
        });
      }
    } else {
      entries.push({
        name: `${base}/${base}.wav`,
        data: new Uint8Array(WAVExporter.createWAVBufferMulti(audio.channels, audio.sampleRate, { float: true }))
      });
    }
    entries.push({
      name: `${base}/${base}.mid`,
      data: encodeMidiFile(recording.midi, { fixedTempo: recorderConfig.tempoMode === "fixed" })
    });
    if (recording.video) {
      entries.push({
        name: `${base}/${base}.${recording.video.extension}`,
        data: new Uint8Array(await recording.video.blob.arrayBuffer())
      });
    }
    WAVExporter.downloadFile(buildZip(entries, /* @__PURE__ */ new Date()), `${base}.zip`, "application/zip");
  },
  downloadMidi() {
    const recording = selectedRecording();
    if (!recording) return;
    const bytes = encodeMidiFile(recording.midi, { fixedTempo: recorderConfig.tempoMode === "fixed" });
    WAVExporter.downloadFile(bytes, `${recording.base}.mid`, "audio/midi");
  }
};

// js/modules/midi/midiConfigActions.js
var midiConfigActions_exports = {};
__export(midiConfigActions_exports, {
  MIDI_SETTING_RANGES: () => MIDI_SETTING_RANGES,
  setPulseOutputEnabled: () => setPulseOutputEnabled,
  updateMidiClockOutputPort: () => updateMidiClockOutputPort,
  updateMidiInputPort: () => updateMidiInputPort,
  updateMidiOutputPort: () => updateMidiOutputPort,
  updateMidiSetting: () => updateMidiSetting
});

// js/modules/fundamental/fundamentalActions.js
var FundamentalActions = {
  updateFundamentalDisplay() {
    updateValue("fundamental-input", AppState.fundamentalFrequency.toFixed(2));
    updateText("current-octave-display", `Octave ${AppState.currentOctave}`);
  },
  changeOctave(direction) {
    const newMidiNote = AppState.currentMidiNote + direction * 12;
    this.setFundamentalByMidi(newMidiNote);
  },
  setFundamentalByFrequency(freq) {
    const midi = Math.round(freqToMidi(freq));
    this.setFundamentalByMidi(midi);
  },
  setFundamentalByNoteIndex(noteIndex) {
    const baseMidi = (AppState.currentOctave + 1) * 12;
    const newMidi = baseMidi + noteIndex;
    this.setFundamentalByMidi(newMidi);
  },
  handleFundamentalChange(val) {
    if (isNaN(val) || val < 1e-3 || val > 1e4) {
      showStatus("Frequency must be between 0.01 Hz and 10000 Hz.", "error");
      val = AppState.fundamentalFrequency;
    }
    FundamentalActions.setFundamentalByFrequency(val);
  },
  // TODO: move to component
  updateKeyboardUI() {
    const keys = document.querySelectorAll(".key");
    keys.forEach((key) => key.classList.remove("active"));
    let noteIndex = AppState.currentMidiNote % 12;
    if (noteIndex < 0) noteIndex += 12;
    const selectedKey = document.querySelector(`.key[data-note-index="${noteIndex}"]`);
    if (selectedKey) {
      selectedKey.classList.add("active");
    }
  },
  /**
   * Set the fundamental to an exact frequency without quantizing to the
   * nearest MIDI note — used by "set as fundamental" on a drawbar, where
   * microtonal partials must land exactly. The nearest MIDI note is still
   * stored for keyboard/octave display.
   */
  setFundamentalExact(freq) {
    if (!isFinite(freq) || freq < 1e-3 || freq > 1e4) return;
    const midi = Math.min(127, Math.round(freqToMidi(freq)));
    updateAppState({
      currentMidiNote: midi,
      fundamentalFrequency: freq,
      currentOctave: Math.floor(midi / 12) - 1
    });
    document.dispatchEvent(new CustomEvent(FUNDAMENTAL_CHANGED));
  },
  setFundamentalByMidi(midiNote) {
    const midi = Math.min(127, midiNote);
    const frequency = midiToFreq(midi);
    const octave = Math.floor(midi / 12) - 1;
    updateAppState({
      currentMidiNote: midi,
      fundamentalFrequency: frequency,
      currentOctave: octave
    });
    document.dispatchEvent(
      new CustomEvent(FUNDAMENTAL_CHANGED)
    );
  }
};
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

// js/modules/spectralSystem/spectralSystemActions.js
var SpectralSystemActions = {
  toggleSubharmonic() {
    const isSubharmonic = !AppState.isSubharmonic;
    updateAppState({ isSubharmonic });
    document.dispatchEvent(new CustomEvent(SUBHARMONIC_TOGGLED, { detail: { isSubharmonic } }));
  },
  setSystem(index) {
    setCurrentSystem(index);
    const numPartials = AppState.currentSystem.ratios.length;
    const amps = AppState.harmonicAmplitudes || [];
    for (let i = amps.length; i < numPartials; i++) {
      amps[i] = i === 0 ? 1 : 0;
    }
    AppState.harmonicAmplitudes = amps;
    smoothUpdateSystem(index);
    document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, {
      detail: { index, system: AppState.currentSystem }
    }));
  },
  /**
   * Shift generative systems to start their partial window at `value`
   * (1 = default). No effect on fixed-table systems beyond storing the
   * value for the next generative system selected.
   */
  setStartHarmonic(value) {
    const startHarmonic = Math.min(START_HARMONIC_MAX, Math.max(1, Math.round(value) || 1));
    if (startHarmonic === AppState.startHarmonic) return;
    updateAppState({ startHarmonic });
    this._regenerateSystem();
  },
  /**
   * Stiff-string inharmonicity coefficient B (0 = pure harmonic series).
   * Only the Stiff String system reads it; the value is kept so it's
   * there when that system is selected.
   */
  setStiffnessB(value) {
    const v = Number(value);
    if (!isFinite(v)) return;
    const stiffnessB = Math.min(STIFFNESS_B_MAX, Math.max(0, v));
    if (stiffnessB === AppState.stiffnessB) return;
    updateAppState({ stiffnessB });
    this._regenerateSystem();
  },
  /**
   * Acoustic-tube far-end boundary: 0 = open-open (all harmonics),
   * 1 = open-closed (odd harmonics). Only the Tube system reads it.
   */
  setTubeClosedness(value) {
    const v = Number(value);
    if (!isFinite(v)) return;
    const tubeClosedness = Math.min(1, Math.max(0, v));
    if (tubeClosedness === AppState.tubeClosedness) return;
    updateAppState({ tubeClosedness });
    this._regenerateSystem();
  },
  /** Sethares pseudo-octave for the Stretched system (2..3). */
  setStretchA(value) {
    this._setClampedParam("stretchA", value, STRETCH_A_MIN, STRETCH_A_MAX);
  },
  /** Sethares pseudo-octave for the Compressed system (1.5..2). */
  setCompressA(value) {
    this._setClampedParam("compressA", value, COMPRESS_A_MIN, COMPRESS_A_MAX);
  },
  _setClampedParam(key, value, min, max) {
    const v = Number(value);
    if (!isFinite(v)) return;
    const clamped = Math.min(max, Math.max(min, v));
    if (clamped === AppState[key]) return;
    updateAppState({ [key]: clamped });
    this._regenerateSystem();
  },
  /** Rebuild the current system's ratios after a tunable-param change. */
  _regenerateSystem() {
    const index = AppState.currentSystemIndex;
    setCurrentSystem(index);
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

// js/modules/drawbars/drawbarsActions.js
var DrawbarsActions = {
  setDrawbar(index, value) {
    const amps = AppState.harmonicAmplitudes;
    if (!amps || !(index >= 0)) return;
    while (amps.length <= index) amps.push(0);
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
  },
  /**
   * Promote drawbar `index` (0-based) to be the fundamental: set the
   * exact partial frequency (no MIDI quantization) and flip the
   * overtone/subharmonic mode so the previous spectrum mirrors around
   * the promoted partial. Out-of-range indices are a silent no-op.
   */
  setDrawbarAsFundamental(index) {
    const ratio = AppState.currentSystem.ratios[index];
    if (!(ratio > 0)) return;
    FundamentalActions.setFundamentalExact(calculateFrequency(ratio));
    SpectralSystemActions.toggleSubharmonic();
  },
  randomize() {
    const count = AppState.currentSystem.ratios.length;
    const newAmps = AppState.harmonicAmplitudes.map((v, i) => {
      if (i >= count) return v;
      return i === 0 ? 0.5 + Math.random() * 0.5 : Math.random();
    });
    updateAppState({ harmonicAmplitudes: newAmps });
    newAmps.forEach((value, i) => {
      smoothUpdateHarmonicAmplitude(i, value);
    });
    document.dispatchEvent(new Event(DRAWBARS_RANDOMIZED));
  },
  /**
   * TODO: this function should happen the first time you click reset. the second time you click reset, it should fully clear all drawbars.
   * toggle between them
   */
  reset() {
    const count = AppState.currentSystem.ratios.length;
    const oldAmps = AppState.harmonicAmplitudes || [];
    const newAmps = oldAmps.map((v, i) => i >= count ? v : i === 0 ? 1 : 0);
    updateAppState({ harmonicAmplitudes: newAmps });
    newAmps.forEach((v, i) => {
      smoothUpdateHarmonicAmplitude(i, v, true);
    });
    document.dispatchEvent(new Event(DRAWBARS_RESET));
  }
};

// js/modules/drawbars/drawbarParams.js
var pct = (v) => `${Math.round(v * 100)}%`;
var seconds = (v) => v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1e3)} ms`;
function partialLabel(n) {
  return seriesStepAt(n).label;
}
var gain = {
  key: "gain",
  label: "gain",
  min: 0,
  max: 1,
  step: 0.01,
  get: (i) => AppState.harmonicAmplitudes?.[i] ?? 0,
  set: (i, v) => DrawbarsActions.setDrawbar(i, v),
  format: (i, v) => pct(v)
};
var pan = {
  key: "pan",
  label: "pan",
  min: -1,
  max: 1,
  step: 0.01,
  get: (i) => getVoicePan(i),
  set: (i, v) => OvertoneSignalActions.setPan(i, v),
  format: (i, v) => Math.abs(v) < 5e-3 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
};
var cutoff = {
  key: "cutoff",
  label: "cutoff",
  min: 0,
  max: MAX_FILTER_PARTIALS,
  step: 1,
  // Two-line readout (partial over Hz) — reserved for every column of
  // the row, so an `open` one doesn't ride up and take its dials with it
  lines: 2,
  get: (i) => OvertoneSignalActions.getFilter(i).multiplier,
  set: (i, v) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), multiplier: Math.round(v) }),
  // Two lines: the series partial it sits on, then where that lands in
  // Hz for THIS voice (a readout renders them stacked, a dial joins them
  // with a separator)
  format: (i, v) => {
    const step = Math.round(v);
    if (step === 0) return "open";
    const voiceHz = calculateFrequency(AppState.currentSystem.ratios[i]);
    return `${partialLabel(step)}
${formatHz(filterCutoffHz(voiceHz, step))}`;
  }
};
var FILTER_TYPE_LABELS = { lowpass: "LP", bandpass: "BP", highpass: "HP" };
var resonance = {
  key: "resonance",
  label: "res",
  min: 0.1,
  max: Q_MAX,
  step: 0.05,
  color: "--accent-negative",
  get: (i) => OvertoneSignalActions.getFilter(i).q,
  set: (i, v) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), q: v }),
  format: (i, v) => `Q ${v.toFixed(2)}`
};
var overdrive = {
  key: "overdrive",
  label: "drive",
  min: 0,
  max: DRIVE_MAX,
  step: 0.05,
  color: "--accent-positive",
  get: (i) => OvertoneSignalActions.getDrive(i),
  set: (i, v) => OvertoneSignalActions.setDrive(i, v),
  format: (i, v) => v > 0 ? pct(v) : "clean"
};
var wet = {
  key: "wet",
  label: "wet",
  min: 0,
  max: 1,
  step: 0.01,
  get: (i) => OvertoneSignalActions.getConvolution(i).wet,
  set: (i, v) => OvertoneSignalActions.setConvolution(i, { wet: v }),
  format: (i, v) => pct(v)
};
var feedback = {
  key: "feedback",
  label: "feedback",
  min: -CONV_FEEDBACK_MAX,
  max: CONV_FEEDBACK_MAX,
  step: 0.01,
  color: "--accent-negative",
  get: (i) => OvertoneSignalActions.getConvolution(i).feedback,
  set: (i, v) => OvertoneSignalActions.setConvolution(i, { feedback: v }),
  format: (i, v) => `fb ${v < 0 ? "\u2212" : ""}${Math.round(Math.abs(v) * 100)}`
};
var convGain = {
  key: "convGain",
  label: "gain",
  min: 0,
  max: 1,
  step: 0.01,
  color: "--accent-positive",
  get: (i) => OvertoneSignalActions.getConvolution(i).gain,
  set: (i, v) => OvertoneSignalActions.setConvolution(i, { gain: v }),
  format: (i, v) => pct(v)
};
var tune = {
  key: "tune",
  label: "tune",
  min: 0,
  max: MAX_FILTER_PARTIALS,
  step: 1,
  get: (i) => OvertoneSignalActions.getConvolution(i).tune,
  set: (i, v) => OvertoneSignalActions.setConvolution(i, { tune: Math.round(v) }),
  format: (i, v) => Math.round(v) === 0 ? "period" : partialLabel(Math.round(v))
};
var envTime = (key, label, max) => ({
  key,
  label,
  min: 1e-3,
  max,
  step: 1e-3,
  get: (i) => OvertoneSignalActions.getEnvelope(i)[key],
  set: (i, v) => OvertoneSignalActions.setEnvelope(i, { [key]: v }),
  format: (i, v) => seconds(v)
});
var sustain = {
  key: "s",
  label: "sustain",
  min: 0,
  max: 1,
  step: 0.01,
  color: "--accent-primary",
  get: (i) => OvertoneSignalActions.getEnvelope(i).s,
  set: (i, v) => OvertoneSignalActions.setEnvelope(i, { s: v }),
  format: (i, v) => pct(v)
};
var FAMILIES = {
  gain: {
    label: "Gain",
    params: [gain, pan],
    reset: () => DrawbarsActions.reset(),
    randomize: () => DrawbarsActions.randomize()
  },
  filter: {
    label: "Filter",
    params: [cutoff, resonance, overdrive],
    // Per-column filter shape. It stays live while the cutoff is open
    // (the column reads "open" and the engine bypasses): picking the
    // shape before sweeping the cutoff up is the natural order, and a
    // disabled control there would only be in the way.
    stepper: {
      className: "filter-type-stepper",
      options: () => FILTER_TYPES,
      get: (i) => OvertoneSignalActions.getFilter(i).type,
      set: (i, type) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), type }),
      render: (el, type) => {
        el.textContent = FILTER_TYPE_LABELS[type] || FILTER_TYPE_LABELS[DEFAULT_FILTER_TYPE];
        el.title = `${type} \u2014 the shape this voice's filter takes once its cutoff is set`;
      }
    },
    reset: () => OvertoneSignalActions.resetFilters(),
    randomize: () => OvertoneSignalActions.randomizeFilters()
  },
  convolution: {
    label: "Convolution",
    params: [wet, feedback, convGain, tune],
    // Per-column IR picker; a column without an IR is bypassed by the
    // engine, so its controls read as inert
    stepper: {
      className: "conv-ir-stepper",
      options: () => [null, ...irManager.list().map((ir) => ir.key)],
      get: (i) => OvertoneSignalActions.getConvolution(i).ir,
      set: (i, ir) => OvertoneSignalActions.setConvolution(i, { ir }),
      render: (el, key) => {
        const i = irManager.indexOf(key);
        el.textContent = i < 0 ? "\u2014" : `IR${i + 1}`;
        el.title = i < 0 ? "no IR" : irManager.list()[i].name;
      }
    },
    enabled: (i) => Boolean(OvertoneSignalActions.getConvolution(i).ir),
    reset: () => OvertoneSignalActions.resetConvolutions(),
    randomize: () => OvertoneSignalActions.randomizeConvolutions()
  },
  adsr: {
    label: "ADSR",
    params: [sustain, envTime("a", "attack", ENV_TIME_MAX.a), envTime("d", "decay", ENV_TIME_MAX.d), envTime("r", "release", ENV_TIME_MAX.r)],
    reset: () => OvertoneSignalActions.resetEnvelopes(),
    randomize: () => OvertoneSignalActions.randomizeEnvelopes()
  }
};
function findParam(family, key) {
  return FAMILIES[family].params.find((param) => param.key === key);
}
function quantize(param, v) {
  const clamped = Math.max(param.min, Math.min(param.max, v));
  return Number((Math.round(clamped / param.step) * param.step).toFixed(6));
}

// js/modules/midi/midiInputRouter.js
var STALE_EVENT_MS = 250;
var THROTTLE_WARN_INTERVAL_MS = 3e4;
var CC_TARGETS = [
  { startKey: "gainCCStart", param: findParam("gain", "gain") },
  { startKey: "cutoffCCStart", param: findParam("filter", "cutoff") },
  { startKey: "convWetCCStart", param: findParam("convolution", "wet") }
];
function rangeIndex(number, start) {
  const index = number - start;
  return index >= 0 && index < MIDI_RANGE_SPAN ? index : -1;
}
var MidiInputRouter = class {
  constructor() {
    this.lastCC = {};
    this._staleCC = /* @__PURE__ */ new Map();
    this._staleFlushScheduled = false;
    this._lastThrottleWarning = -Infinity;
  }
  async init() {
    try {
      this.midi = await navigator.requestMIDIAccess();
    } catch (err) {
      console.info(`[midi] Web MIDI unavailable (${err.name}) \u2014 OSC/WebSocket control unaffected`);
      return;
    }
    const portsChanged = () => {
      this._bind();
      document.dispatchEvent(new CustomEvent(MIDI_PORTS_CHANGED));
    };
    portsChanged();
    this.midi.onstatechange = portsChanged;
  }
  /** Attach the handler to the selected input port, or all when unset. */
  _bind() {
    if (!this.midi) return;
    if (this._selector != null && !this.inputPorts().some((i) => i.id === midiConfig.inputId)) {
      const id = resolvePortSelector(this.inputPorts(), this._selector);
      if (id) midiConfig.inputId = id;
    }
    for (const input of this.midi.inputs.values()) {
      const active = midiConfig.inputId == null || input.id === midiConfig.inputId;
      input.onmidimessage = active ? (msg) => this.route(msg) : null;
    }
  }
  /** Available system input ports, for the settings panel's selector. */
  inputPorts() {
    return this.midi ? [...this.midi.inputs.values()].map((i) => ({ id: i.id, name: i.name })) : [];
  }
  /**
   * Listen on a specific input port — by id, 0-based index, or name
   * (see resolvePortSelector). null/'' clears to all inputs.
   */
  selectInput(selector) {
    const cleared = selector == null || selector === "";
    this._selector = cleared ? null : selector;
    midiConfig.inputId = cleared ? null : resolvePortSelector(this.inputPorts(), selector);
    this._bind();
  }
  /**
   * Each inbound concern listens on its own channel: CCs on the CC
   * channel, trigger notes on the trigger channel, every other note on
   * the fundamental channel. Where the trigger and fundamental channels
   * coincide, the trigger range wins — a pad hit must not also retune.
   */
  route(msg) {
    const [status, data1, data2] = msg.data;
    const kind = status & 240;
    const channel = (status & 15) + 1;
    if (kind === 176) {
      if (channel !== midiConfig.ccChannel) return;
      return this.handleCC(data1, data2, performance.now() - msg.timeStamp);
    }
    if (kind !== 144 && kind !== 128) return;
    const isNoteOn = kind === 144 && data2 > 0;
    if (channel === midiConfig.triggerChannel) {
      const index = rangeIndex(data1, midiConfig.triggerNoteStart);
      if (index !== -1) {
        return isNoteOn ? triggerHarmonicAttack(index) : triggerHarmonicRelease(index);
      }
    }
    if (isNoteOn && channel === midiConfig.fundamentalChannel) {
      const note = data1 + 12 * midiConfig.fundamentalTranspose;
      FundamentalActions.setFundamentalByMidi(Math.max(0, Math.min(127, note)));
    }
  }
  handleCC(cc, val, age = 0) {
    if (age > STALE_EVENT_MS) {
      this._staleCC.set(cc, val);
      this.warnThrottled(age);
      if (!this._staleFlushScheduled) {
        this._staleFlushScheduled = true;
        setTimeout(() => {
          this._staleFlushScheduled = false;
          const pending = this._staleCC;
          this._staleCC = /* @__PURE__ */ new Map();
          for (const [pendingCC, pendingVal] of pending) {
            this.applyCC(pendingCC, pendingVal);
          }
        }, 0);
      }
      return;
    }
    this.applyCC(cc, val);
  }
  applyCC(cc, val) {
    const norm = val / 127;
    if (cc === 7) {
      smoothUpdateMasterGain(norm);
    }
    if (this.lastCC[cc] === val) return;
    this.lastCC[cc] = val;
    if (cc === midiConfig.crossfaderCC) PresetActions.setCrossfade(val);
    for (const { startKey, param } of CC_TARGETS) {
      const index = rangeIndex(cc, midiConfig[startKey]);
      if (index === -1) continue;
      param.set(index, quantize(param, param.min + norm * (param.max - param.min)));
    }
  }
  warnThrottled(age) {
    const now = performance.now();
    if (now - this._lastThrottleWarning < THROTTLE_WARN_INTERVAL_MS) return;
    this._lastThrottleWarning = now;
    const seconds2 = (age / 1e3).toFixed(1);
    console.warn(
      `[MIDI] Events arriving ${seconds2}s late \u2014 the browser/jweb suspends this page while it is hidden. Keep the window visible, or launch the browser with --disable-backgrounding-occluded-windows --disable-renderer-backgrounding.`
    );
    showStatus(`MIDI arriving ${seconds2}s late \u2014 window is throttled while hidden`, "warning");
  }
};
var midiInputRouter = new MidiInputRouter();

// js/modules/midi/midiConfigActions.js
var clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
var MIDI_RANGE_START_MAX = 128 - MIDI_RANGE_SPAN;
var TRANSPOSE_MAX = 5;
var MIDI_SETTING_RANGES = {
  fundamentalChannel: [1, 16],
  fundamentalTranspose: [-TRANSPOSE_MAX, TRANSPOSE_MAX],
  triggerChannel: [1, 16],
  triggerNoteStart: [0, MIDI_RANGE_START_MAX],
  ccChannel: [1, 16],
  gainCCStart: [0, MIDI_RANGE_START_MAX],
  cutoffCCStart: [0, MIDI_RANGE_START_MAX],
  convWetCCStart: [0, MIDI_RANGE_START_MAX],
  crossfaderCC: [0, 127],
  pulseChannel: [1, 16],
  pulseNoteStart: [0, MIDI_RANGE_START_MAX]
};
function updateMidiSetting(key, value) {
  const range = MIDI_SETTING_RANGES[key];
  if (!range || !Number.isFinite(value)) return;
  midiConfig[key] = clampInt(value, range[0], range[1]);
  persistAppConfig();
}
function setPulseOutputEnabled(kind, enabled) {
  const on = Boolean(enabled);
  const flag = kind === "midi" ? "midi" : "osc";
  if (kind === "midi") midiConfig.pulseMidiEnabled = on;
  if (kind === "osc") midiConfig.pulseOscEnabled = on;
  const count = AppState.currentSystem.ratios.length;
  for (let i = 0; i < count; i++) {
    OvertoneSignalActions.setPulseOut(i, { [flag]: on });
  }
  persistAppConfig();
}
function updateMidiOutputPort(selector) {
  midiOutputRouter.selectOutput(selector);
  persistAppConfig();
  document.dispatchEvent(new CustomEvent(MIDI_OUTPUT_CHANGED));
}
function updateMidiClockOutputPort(selector) {
  midiOutputRouter.selectClockOutput(selector);
  persistAppConfig();
}
function updateMidiInputPort(selector) {
  midiInputRouter.selectInput(selector);
  persistAppConfig();
}

// js/modules/waveform/waveformDraw.js
function drawWaveformFrame(ctx, width, height, { background, grid }) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}
function drawOverview(ctx, overview, width, height, color) {
  const ampScale = height * 0.4;
  const bin = (x) => Math.floor(x / width * overview.max.length);
  const envelope = [];
  for (let x = 0; x < width; x++) envelope.push(x, height / 2 - overview.max[bin(x)] * ampScale);
  for (let x = width - 1; x >= 0; x--) envelope.push(x, height / 2 - overview.min[bin(x)] * ampScale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(envelope[0], envelope[1]);
  for (let i = 2; i < envelope.length; i += 2) ctx.lineTo(envelope[i], envelope[i + 1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  const mid = [];
  for (let x = 0; x < width; x++) mid.push(x, height / 2 - (overview.max[bin(x)] + overview.min[bin(x)]) / 2 * ampScale);
  strokePath(ctx, mid);
}
function drawCycle(ctx, table, width, height, color, cycles = 1) {
  const ampScale = height * 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const points = [];
  for (let x = 0; x < width; x++) {
    const at = x / width * cycles * table.length % table.length;
    const i0 = Math.floor(at);
    const i1 = (i0 + 1) % table.length;
    const frac = at - i0;
    points.push(x, height / 2 - (table[i0] * (1 - frac) + table[i1] * frac) * ampScale);
  }
  strokePath(ctx, points);
}

// js/dsp/aiff.js
var FLOAT32 = /* @__PURE__ */ new Set(["fl32", "FL32"]);
var FLOAT64 = /* @__PURE__ */ new Set(["fl64", "FL64"]);
function isAiff(arrayBuffer) {
  if (arrayBuffer.byteLength < 12) return false;
  const tag = (o) => String.fromCharCode(...new Uint8Array(arrayBuffer, o, 4));
  return tag(0) === "FORM" && (tag(8) === "AIFF" || tag(8) === "AIFC");
}
function decodeAiff(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (!isAiff(arrayBuffer)) throw new Error("Not an AIFF file");
  const aifc = tag(8) === "AIFC";
  let comm = null;
  let ssnd = null;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4);
    const body = offset + 8;
    if (id === "COMM") {
      comm = {
        channels: view.getInt16(body),
        frames: view.getUint32(body + 2),
        bits: view.getInt16(body + 6),
        sampleRate: readExtended(view, body + 8),
        compression: aifc && size >= 22 ? tag(body + 18) : "NONE"
      };
    } else if (id === "SSND") {
      const dataOffset = view.getUint32(body);
      ssnd = { start: body + 8 + dataOffset, end: Math.min(view.byteLength, body + size) };
    }
    offset = body + size + size % 2;
  }
  if (!comm || !ssnd) throw new Error("AIFF is missing its COMM or SSND chunk");
  const { channels, frames, bits, sampleRate, compression } = comm;
  const float32 = FLOAT32.has(compression);
  const float64 = FLOAT64.has(compression);
  const little = compression === "sowt";
  if (!(compression === "NONE" || little || float32 || float64)) {
    throw new Error(`Compressed AIFF-C (${compression.trim()}) is not supported \u2014 export as PCM or WAV`);
  }
  if (!(channels > 0) || !(sampleRate > 0)) throw new Error("AIFF has an invalid COMM chunk");
  const bytes = bits / 8;
  if (![1, 2, 3, 4, 8].includes(bytes)) throw new Error(`Unsupported AIFF bit depth: ${bits}`);
  const available = Math.floor((ssnd.end - ssnd.start) / (bytes * channels));
  const count = Math.min(frames, available);
  const out = Array.from({ length: channels }, () => new Float32Array(count));
  let p = ssnd.start;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < channels; c++) {
      out[c][i] = readSample(view, p, bytes, little, float32, float64);
      p += bytes;
    }
  }
  return { sampleRate, channels: out };
}
function readSample(view, p, bytes, little, float32, float64) {
  if (float32) return view.getFloat32(p, little);
  if (float64) return view.getFloat64(p, little);
  switch (bytes) {
    case 1:
      return view.getInt8(p) / 128;
    case 2:
      return view.getInt16(p, little) / 32768;
    case 3: {
      const b0 = view.getUint8(p), b1 = view.getUint8(p + 1), b2 = view.getUint8(p + 2);
      const raw = little ? b2 << 16 | b1 << 8 | b0 : b0 << 16 | b1 << 8 | b2;
      return (raw << 8 >> 8) / 8388608;
    }
    default:
      return view.getInt32(p, little) / 2147483648;
  }
}
function readExtended(view, p) {
  const se = view.getUint16(p);
  const exponent = (se & 32767) - 16383;
  const hi = view.getUint32(p + 2);
  const lo = view.getUint32(p + 6);
  const mantissa = hi / 2147483648 + lo / 2147483648 / 4294967296;
  const value = mantissa * Math.pow(2, exponent);
  return se & 32768 ? -value : value;
}

// js/dsp/decodeAudio.js
async function decodeAudioFile(ctx, arrayBuffer) {
  if (!isAiff(arrayBuffer)) return ctx.decodeAudioData(arrayBuffer);
  const { sampleRate, channels } = decodeAiff(arrayBuffer);
  const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
  channels.forEach((data, c) => buffer.copyToChannel(data, c));
  return buffer;
}

// js/modules/source/sourceLibrary.js
var SAMPLER_SECTIONS = [
  { kind: ASSET.soundfile.kind, label: "Uploaded files" },
  { kind: ASSET.wave.kind, label: "Exported waves" },
  { kind: ASSET.ir.kind, label: "Impulse responses" },
  { kind: "recording", label: "Recordings" }
];
var MAX_RENDER_SECONDS = 10;
async function samplerLibrary() {
  return Promise.all(SAMPLER_SECTIONS.map(async (section) => ({
    ...section,
    items: section.kind === "recording" ? recordingStore.list().map(({ key, name }) => ({ id: key, name })) : (await assetStore.summaries(section.kind)).map((asset, i) => ({ id: asset.id, name: asset.name || `${section.label} ${i + 1}` }))
  })));
}
async function samplerBuffer(ctx, kind, id) {
  if (kind === "recording") {
    const take = recordingStore.get(id);
    return take ? bufferOf(ctx, take.audio.channels, take.audio.sampleRate) : null;
  }
  const record = await assetRecord(id);
  if (!record) return null;
  if (kind === ASSET.soundfile.kind) return decodeAudioFile(ctx, record.bytes.slice(0));
  if (kind === ASSET.ir.kind) return bufferOf(ctx, [record.pcm], record.meta?.sampleRate || 48e3);
  return renderWave(ctx, record);
}
async function renderWave(ctx, record) {
  const period = record.meta?.periodMultiplier || 1;
  const loopHz = Math.max(0.1, AppState.fundamentalFrequency / period);
  const length = Math.min(
    Math.round(ctx.sampleRate * MAX_RENDER_SECONDS),
    Math.max(2, Math.round(ctx.sampleRate / loopHz))
  );
  const offline = new OfflineAudioContext(1, length, ctx.sampleRate);
  const oscillator = offline.createOscillator();
  oscillator.setPeriodicWave(offline.createPeriodicWave(record.real, record.imag));
  oscillator.frequency.value = loopHz;
  oscillator.connect(offline.destination);
  oscillator.start();
  return offline.startRendering();
}
function bufferOf(ctx, channels, sampleRate) {
  const data = channels.length > 2 ? [mixdown(channels)] : channels;
  const buffer = ctx.createBuffer(data.length, data[0].length, sampleRate);
  data.forEach((channel, i) => buffer.copyToChannel(channel, i));
  return buffer;
}
function mixdown(channels) {
  const out = new Float32Array(channels[0].length);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  }
  return out;
}

// js/modules/source/sourceActions.js
var SourceActions = {
  /**
   * Switch the signal source. Accepts a mode name or its SOURCE_MODES
   * index (the bridge address form). Entering any external mode tunes
   * every overtone's lowpass to its own pitch at high resonance so the
   * voice bank acts as a resonant filter bank; leaving restores nothing —
   * the filters stay as the user last set them.
   */
  setSourceMode(mode) {
    const name = typeof mode === "number" ? SOURCE_MODES[Math.round(mode)] : mode;
    if (!SOURCE_MODES.includes(name) || name === AppState.sourceMode) return;
    updateAppState({ sourceMode: name });
    if (name !== "oscillators") {
      this._applyFilterBankDefaults();
    }
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { sourceMode: name } }));
    restartAudio();
  },
  /** Every voice: cutoff at its own pitch (multiplier 1), resonant Q. */
  _applyFilterBankDefaults() {
    const count = AppState.currentSystem.ratios.length;
    for (let i = 0; i < count; i++) {
      OvertoneSignalActions.setFilter(i, { multiplier: 1, q: FILTER_BANK_Q });
    }
  },
  /** ADC input device — exact id, 0-based index, or label substring. */
  async setAdcDevice(selector) {
    const devices = await sourceManager.inputDevices();
    let id = null;
    if (selector != null && selector !== "") {
      if (typeof selector === "number") {
        id = devices[Math.round(selector)]?.id ?? null;
      } else {
        const s = String(selector).trim();
        const dev = devices.find((d) => d.id === s) || devices.find((d) => d.label === s) || devices.find((d) => d.label.toLowerCase().includes(s.toLowerCase()));
        id = dev ? dev.id : s;
      }
    }
    if (id === AppState.adcDeviceId) return;
    updateAppState({ adcDeviceId: id });
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { adcDeviceId: id } }));
    if (AppState.sourceMode === "adc") restartAudio();
  },
  setAdcChannel(channel) {
    const ch = Math.max(0, Math.round(Number(channel) || 0));
    if (ch === AppState.adcChannel) return;
    updateAppState({ adcChannel: ch });
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { adcChannel: ch } }));
    if (AppState.sourceMode === "adc") restartAudio();
  },
  // --- sound file ---
  /**
   * 'mono' (one player for the bank) | 'poly' (a player per voice). App
   * config (soundfileConfig, persisted), not synth state.
   */
  setSoundfileMode(mode) {
    if (!SOUNDFILE_MODES.includes(mode) || mode === soundfileConfig.mode) return;
    soundfileConfig.mode = mode;
    persistAppConfig();
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileMode: mode } }));
    if (AppState.sourceMode === "soundfile") restartAudio();
  },
  /** Poly: play the file at each overtone's pitch (from its fundamental) or as is. App config. */
  setSoundfileTune(on) {
    const tune2 = Boolean(on);
    if (tune2 === soundfileConfig.tune) return;
    soundfileConfig.tune = tune2;
    persistAppConfig();
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileTune: tune2 } }));
    updateAllHarmonicSamples();
  },
  /** The file's fundamental in Hz for tuning; null/0 = the detected one. */
  setSoundfileFundamental(hz) {
    const v = Number(hz);
    const fundamental = v > 0 ? Math.min(2e4, v) : null;
    if (fundamental === AppState.soundfileFundamental) return;
    updateAppState({ soundfileFundamental: fundamental });
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileFundamental: fundamental } }));
    updateAllHarmonicSamples();
  },
  /** Loop the file, or play it once per trigger (the ADSR panel's Loop). */
  setSoundfileLoop(on) {
    const loop = Boolean(on);
    if (loop === AppState.soundfileLoop) return;
    updateAppState({ soundfileLoop: loop });
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileLoop: loop } }));
    if (AppState.sourceMode !== "soundfile") return;
    if (polySampleMode()) {
      updateAllHarmonicSamples();
    } else {
      sourceManager.setLoop(loop);
      updateAllHarmonicClocks();
    }
  },
  /**
   * The part of the file that plays and loops: [start, end] as 0-1
   * fractions (at least 1 % apart), or null for the whole file.
   */
  async setSoundfileRange(range) {
    let next = null;
    if (Array.isArray(range)) {
      const a = Math.max(0, Math.min(1, Number(range[0]) || 0));
      const b = Math.max(0, Math.min(1, Number(range[1]) || 0));
      const [start, end] = a <= b ? [a, b] : [b, a];
      if (end - start >= 0.01 && !(start === 0 && end === 1)) next = [start, end];
    }
    const cur = AppState.soundfileRange;
    if ((cur?.[0] ?? null) === (next?.[0] ?? null) && (cur?.[1] ?? null) === (next?.[1] ?? null)) return;
    updateAppState({ soundfileRange: next });
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileRange: next } }));
    if (AppState.sourceMode === "soundfile") {
      if (polySampleMode()) {
        updateAllHarmonicSamples();
      } else {
        sourceManager.setRange(next);
        updateAllHarmonicClocks();
      }
    }
    if (!sourceManager.hasFile) return;
    const hz = await sourceManager.detectFundamental(next);
    if (!next && AppState.soundfileRange !== null) return;
    if (next && AppState.soundfileRange !== next) return;
    updateAppState({ soundfileFundamental: null });
    if (hz) FundamentalActions.setFundamentalExact(hz);
    updateAllHarmonicSamples();
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileFundamental: null } }));
  },
  /**
   * Decode a dropped/picked audio file, keep it in the machine's library,
   * and switch to soundfile mode.
   */
  async loadSoundFile(file) {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const id = await saveSoundFile({ bytes: arrayBuffer.slice(0), name: file.name });
      document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
      const ctx = await audioContext();
      const buffer = await decodeAudioFile(ctx, arrayBuffer.slice(0));
      await applySoundFile({ buffer, name: file.name, source: { kind: "soundfile", id }, mode: this });
    } catch (error) {
      showStatus(`Could not load ${file?.name || "file"}: ${error.message}`, "error");
    }
  },
  /**
   * Play something the library already holds through the sampler — an
   * imported file, but also a baked wave, an IR or a take (see
   * sourceLibrary.js). The Source panel's menu and the file manager's
   * Use both come here.
   */
  async loadLibraryEntry({ kind, id, name }) {
    try {
      const ctx = await audioContext();
      const buffer = await samplerBuffer(ctx, kind, id);
      if (!buffer) throw new Error("the library no longer has it");
      await applySoundFile({ buffer, name, source: { kind, id }, mode: this });
    } catch (error) {
      showStatus(`Could not load ${name || "file"}: ${error.message}`, "error");
    }
  }
};
async function audioContext() {
  const { initAudio: initAudio2 } = await import("./audio-PDEMFJXY.js");
  await initAudio2();
  return audioEngine.context;
}
async function applySoundFile({ buffer, name, source, mode }) {
  const hz = await sourceManager.setFileBuffer(buffer, name, source);
  updateAppState({ soundfileName: name, soundfileFundamental: null, soundfileRange: null });
  if (hz) FundamentalActions.setFundamentalExact(hz);
  if (AppState.sourceMode === "soundfile") {
    updateAllHarmonicSamples();
    updateAllHarmonicClocks();
    document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileName: name } }));
  } else {
    mode.setSourceMode("soundfile");
  }
  showStatus(`Loaded ${name}${hz ? ` \xB7 ${hz.toFixed(hz >= 100 ? 1 : 2)} Hz` : ""}`, "success");
}

// js/modules/playToggle/playToggleActions.js
var PlayToggleActions = {
  async toggle() {
    if (AppState.isPlaying) {
      stopTone();
    } else {
      try {
        await startTone();
      } catch (error) {
        console.error("Failed to start tone:", error);
        showStatus("Failed to start audio. Please check browser permissions.", "error");
      }
    }
  }
};

// js/KeyboardShortcuts.js
var NOTE_KEYS = [
  "Backquote",
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
var TRIGGER_KEYS = [
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "BracketLeft",
  "BracketRight"
];
var TRIGGER_KEY_LABELS = TRIGGER_KEYS.map((code) => code.replace("Key", "").replace("BracketLeft", "[").replace("BracketRight", "]"));
var SHORTCUTS = [
  {
    group: "Transport",
    items: [{ keys: ["Space"], what: "Start and stop the sound" }]
  },
  {
    group: "Fundamental",
    items: [
      { keys: ["`", "1", "\u2026", "="], what: "Set the fundamental to a semitone of the current octave" },
      { keys: ["\u2318/Ctrl", "\u2191 \u2193 \u2190 \u2192"], what: "Octave up or down" }
    ]
  },
  {
    group: "Overtones",
    items: [
      { keys: ["Q", "W", "\u2026", "]"], what: "Play an overtone \u2014 hold to sustain (Trigger mode only)" },
      { keys: ["Shift", "Q \u2026 ]"], what: "Make that overtone the new fundamental" }
    ]
  },
  {
    group: "A focused drawbar",
    items: [
      { keys: ["Tab"], what: "Move focus onto the drawbars" },
      { keys: ["\u2190 \u2192"], what: "Move to the previous or next overtone" },
      { keys: ["\u2191 \u2193"], what: "Adjust by 1%" },
      { keys: ["\u2318/Ctrl", "\u2191 \u2193"], what: "Adjust by 10%" },
      { keys: ["Shift", "\u2191 \u2193"], what: "Jump to the maximum or minimum" }
    ]
  },
  {
    group: "Held while editing",
    items: [
      { keys: ["\u2318/Ctrl"], what: "Link \u2014 the edit writes every overtone at once" },
      { keys: ["Shift"], what: "Shape \u2014 the edit sculpts every overtone along a contour" }
    ]
  }
];
var KeyboardShortcuts = class {
  constructor() {
    this.heldTriggers = /* @__PURE__ */ new Set();
  }
  init() {
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
    document.addEventListener("keyup", (e) => this.handleKeyUp(e));
    window.addEventListener("blur", () => this.releaseAll());
  }
  /** True when keystrokes belong to a focused editable field. */
  editableFocused(t) {
    return Boolean(t && (t.tagName === "INPUT" && t.type !== "range" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
  }
  handleKeyDown(e) {
    if (this.editableFocused(e.target)) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) PlayToggleActions.toggle();
      return;
    }
    const noteIndex = NOTE_KEYS.indexOf(e.code);
    if (noteIndex !== -1) {
      FundamentalActions.setFundamentalByNoteIndex(noteIndex);
      return;
    }
    const voice = TRIGGER_KEYS.indexOf(e.code);
    if (voice !== -1) {
      if (e.shiftKey) {
        if (!e.repeat) DrawbarsActions.setDrawbarAsFundamental(voice);
        return;
      }
      if (!e.repeat && !this.heldTriggers.has(voice)) {
        this.heldTriggers.add(voice);
        triggerHarmonicAttack(voice);
      }
      return;
    }
    const active = document.activeElement;
    if (active && active.matches?.("#drawbars .drawbar-slider")) {
      this.handleDrawbarArrows(e, active);
      if (e.defaultPrevented) return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.code === "ArrowUp" || e.code === "ArrowRight") {
        e.preventDefault();
        FundamentalActions.changeOctave(1);
      } else if (e.code === "ArrowDown" || e.code === "ArrowLeft") {
        e.preventDefault();
        FundamentalActions.changeOctave(-1);
      }
    }
  }
  handleKeyUp(e) {
    const voice = TRIGGER_KEYS.indexOf(e.code);
    if (voice !== -1 && this.heldTriggers.delete(voice)) {
      triggerHarmonicRelease(voice);
    }
  }
  releaseAll() {
    for (const voice of this.heldTriggers) {
      triggerHarmonicRelease(voice);
    }
    this.heldTriggers.clear();
  }
  handleDrawbarArrows(e, slider) {
    const drawbars = document.querySelectorAll("#drawbars .drawbar-slider");
    const currentIndex = parseInt(slider.dataset.index);
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      e.preventDefault();
      const delta = e.code === "ArrowLeft" ? -1 : 1;
      const nextIndex = (currentIndex + delta + drawbars.length) % drawbars.length;
      drawbars[nextIndex].focus();
      return;
    }
    if (e.code !== "ArrowUp" && e.code !== "ArrowDown") return;
    e.preventDefault();
    let value;
    if (e.shiftKey) {
      value = e.code === "ArrowUp" ? 1 : 0;
    } else {
      const step = e.metaKey || e.ctrlKey ? 0.1 : 0.01;
      value = parseFloat(slider.value) + (e.code === "ArrowUp" ? step : -step);
      value = Math.max(0, Math.min(1, value));
    }
    slider.value = value.toFixed(2);
    DrawbarsActions.setDrawbar(currentIndex, value);
  }
};

export {
  FundamentalActions,
  SpectralSystemActions,
  DrawbarsActions,
  FAMILIES,
  quantize,
  recordingStore,
  VIDEO_SIZES,
  TonewheelFilm,
  AUDIO_MODES,
  MIDI_MODES,
  TEMPO_MODES,
  LENGTH_MODES,
  VIDEO_SIZE_MODES,
  RecordingActions,
  drawWaveformFrame,
  drawOverview,
  drawCycle,
  decodeAudioFile,
  samplerLibrary,
  SourceActions,
  PlayToggleActions,
  TRIGGER_KEY_LABELS,
  SHORTCUTS,
  KeyboardShortcuts,
  midiInputRouter,
  MIDI_SETTING_RANGES,
  updateMidiSetting,
  setPulseOutputEnabled,
  updateMidiOutputPort,
  updateMidiClockOutputPort,
  updateMidiInputPort,
  midiConfigActions_exports
};
