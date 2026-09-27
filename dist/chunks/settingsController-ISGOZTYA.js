import {
  AUDIO_MODES,
  LENGTH_MODES,
  MIDI_MODES,
  MIDI_SETTING_RANGES,
  RecordingActions,
  SHORTCUTS,
  SourceActions,
  TEMPO_MODES,
  TonewheelFilm,
  VIDEO_SIZES,
  VIDEO_SIZE_MODES,
  decodeAudioFile,
  drawCycle,
  drawOverview,
  drawWaveformFrame,
  midiInputRouter,
  recordingStore,
  setPulseOutputEnabled,
  updateMidiClockOutputPort,
  updateMidiInputPort,
  updateMidiOutputPort,
  updateMidiSetting
} from "./chunk-3CXT2YX5.js";
import {
  BaseComponent
} from "./chunk-VX6I3QE2.js";
import {
  OvertoneSignalActions,
  Sketch,
  TonewheelActions,
  setCurrentWaveform,
  syncWaveformOptions,
  themeColor
} from "./chunk-IXPH2EMF.js";
import {
  ASSET,
  CONVOLUTION_IRS_CHANGED,
  LIBRARY_CHANGED,
  MIDI_OUTPUT_CHANGED,
  MIDI_PORTS_CHANGED,
  MIDI_RANGE_SPAN,
  RECORDER_CHANGED,
  RECORDINGS_CHANGED,
  WAVExporter,
  assetRecord,
  assetStore,
  audioEngine,
  forgetAsset,
  forgetCustomWaveTable,
  getWavetableManager,
  initAudio,
  irManager,
  listAssets,
  midiConfig,
  midiOutputRouter,
  overviewOfData,
  precomputeWavetableFromCoefficients,
  recorderConfig,
  renameAsset,
  showStatus,
  sourceManager
} from "./chunk-YSWKRLK7.js";
import {
  AppState
} from "./chunk-ZE2D7APW.js";

// js/modules/settings/MidiSettingsComponent.js
var MidiSettingsComponent = class extends BaseComponent {
  /** Number input bound to one midiConfig key (MIDI_SETTING_RANGES). */
  settingInput(key, onChange = null) {
    const [min, max] = MIDI_SETTING_RANGES[key];
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = midiConfig[key];
    input.className = "midi-num-input";
    input.addEventListener("change", () => {
      const val = parseInt(input.value, 10);
      if (Number.isFinite(val)) updateMidiSetting(key, val);
      input.value = midiConfig[key];
      onChange?.();
    });
    return input;
  }
  /**
   * Start-of-range input with its span read out beside it
   * ("13 – 24"): the 12 numbers the overtones take from there.
   */
  rangeInput(key) {
    const wrap = document.createElement("div");
    wrap.className = "midi-range-input";
    const span = document.createElement("output");
    span.className = "midi-range-span";
    const sync = () => {
      span.textContent = `\u2013 ${midiConfig[key] + MIDI_RANGE_SPAN - 1}`;
    };
    sync();
    wrap.append(this.settingInput(key, sync), span);
    return wrap;
  }
  hint(text) {
    const p = document.createElement("p");
    p.className = "settings-hint";
    p.textContent = text;
    return p;
  }
  /** "label ........ [control]" row inside a section. */
  settingRow(text, control) {
    const row = document.createElement("label");
    row.className = "settings-row";
    const span = document.createElement("span");
    span.textContent = text;
    row.append(span, control);
    return row;
  }
  /** Raised card with an uppercase title. */
  section(title) {
    const sec = document.createElement("section");
    sec.className = "settings-section";
    const heading = document.createElement("div");
    heading.className = "settings-section-title";
    heading.textContent = title;
    sec.appendChild(heading);
    return sec;
  }
  toggleRow(text, key, kind) {
    const toggle = document.createElement("div");
    toggle.className = "toggle-switch midi-pulse-toggle";
    toggle.setAttribute("role", "switch");
    toggle.classList.toggle("active", Boolean(midiConfig[key]));
    toggle.setAttribute("aria-checked", String(Boolean(midiConfig[key])));
    toggle.setAttribute("aria-label", text);
    this.bindEvent(toggle, "click", () => {
      const on = !toggle.classList.contains("active");
      toggle.classList.toggle("active", on);
      toggle.setAttribute("aria-checked", String(on));
      setPulseOutputEnabled(kind, on);
    });
    return this.settingRow(text, toggle);
  }
  /**
   * Port selector over a {id, name} port list. `selectedId` marks the
   * current choice; `noneLabel` (optional) adds a first option with value
   * '' for the role's default routing ("All inputs", "Same as note out").
   */
  portSelect(ports, selectedId, onChange, { noneLabel = null, unavailable = false } = {}) {
    const select = document.createElement("select");
    select.className = "control-select midi-port-select";
    if (ports.length === 0 && !noneLabel) {
      const opt = document.createElement("option");
      opt.textContent = unavailable ? "MIDI unavailable" : "no ports found";
      opt.disabled = true;
      opt.selected = true;
      select.appendChild(opt);
      select.disabled = true;
      return select;
    }
    if (noneLabel) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = noneLabel;
      opt.selected = selectedId == null || !ports.some((p) => p.id === selectedId);
      select.appendChild(opt);
    }
    for (const port of ports) {
      const opt = document.createElement("option");
      opt.value = port.id;
      opt.textContent = port.name;
      if (port.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }
  render() {
    this.teardown();
    this.el.innerHTML = "";
    const cards = document.createElement("div");
    cards.className = "settings-sections";
    const midiUp = Boolean(midiOutputRouter.midi || midiInputRouter.midi);
    const ports = this.section("MIDI Ports");
    ports.append(
      this.settingRow("In", this.portSelect(
        midiInputRouter.inputPorts(),
        midiConfig.inputId,
        updateMidiInputPort,
        { noneLabel: "All inputs", unavailable: !midiUp }
      )),
      this.settingRow("Out", this.portSelect(
        midiOutputRouter.outputPorts(),
        midiOutputRouter.output?.id ?? null,
        updateMidiOutputPort,
        { unavailable: !midiUp }
      )),
      this.hint("Every note and CC input shares the one port in; pulse notes leave on the port out. Each section below has its own channel.")
    );
    const fundamental = this.section("Fundamental Note In");
    fundamental.append(
      this.settingRow("Channel", this.settingInput("fundamentalChannel")),
      this.settingRow("Transpose octave", this.settingInput("fundamentalTranspose")),
      this.hint("Any note on this channel sets the fundamental.")
    );
    const trigger = this.section("ADSR Trigger Note In");
    trigger.append(
      this.settingRow("Channel", this.settingInput("triggerChannel")),
      this.settingRow("First note", this.rangeInput("triggerNoteStart")),
      this.hint("Twelve notes from the first gate overtones 1\u201312 in Trigger mode: note on attacks, note off releases. On a channel shared with the fundamental, these notes only trigger.")
    );
    const cc = this.section("CC In");
    cc.append(
      this.settingRow("Channel", this.settingInput("ccChannel")),
      this.settingRow("Gain", this.rangeInput("gainCCStart")),
      this.settingRow("Filter cutoff", this.rangeInput("cutoffCCStart")),
      this.settingRow("Conv wet/dry", this.rangeInput("convWetCCStart")),
      this.settingRow("Preset crossfader", this.settingInput("crossfaderCC")),
      this.hint("Set each parameter\u2019s first CC: it takes the twelve from there, one per overtone. CC 7 is the master gain; the crossfader CC sweeps presets A \u2192 B.")
    );
    const pulse = this.section("Note Out: Overtone LF Pulse");
    pulse.append(
      this.settingRow("Channel", this.settingInput("pulseChannel")),
      this.settingRow("First note", this.rangeInput("pulseNoteStart")),
      this.toggleRow("MIDI pulse out", "pulseMidiEnabled", "midi"),
      this.toggleRow("OSC pulse out", "pulseOscEnabled", "osc"),
      this.hint("Overtones 1\u201312 send twelve notes from the first. Keep them clear of the trigger notes when in and out share a port.")
    );
    const clock = this.section("Clock / Transport Out");
    clock.append(
      this.settingRow("Port", this.portSelect(
        midiOutputRouter.outputPorts(),
        midiConfig.clockOutputId,
        updateMidiClockOutputPort,
        { noneLabel: "Same as MIDI out", unavailable: !midiUp }
      )),
      this.hint("Carries the overtone clock (24 ticks per cycle of the assigned voice) and transport start/stop on play. Clock messages are system-realtime \u2014 the MIDI spec gives them no channel.")
    );
    cards.append(ports, fundamental, trigger, cc, pulse, clock);
    this.el.appendChild(cards);
  }
};

// js/modules/settings/RecorderSettingsComponent.js
var AUDIO_LABELS = { mono: "Mono", stereo: "Stereo", multitrack: "Multitrack (one channel per overtone)" };
var MIDI_LABELS = { single: "Single channel", multi: "Multi-channel (a track + channel per overtone)" };
var LENGTH_LABELS = {
  manual: "Manual \u2014 record until stopped",
  loop: "Sync loop \u2014 restart oscillator phases together, stop when they all realign (seamless loop; exact for rational systems, best-effort for irrational)"
};
var VIDEO_SIZE_LABELS = {
  small: `Small \u2014 ${VIDEO_SIZES.small} \xD7 ${VIDEO_SIZES.small}`,
  medium: `Medium \u2014 ${VIDEO_SIZES.medium} \xD7 ${VIDEO_SIZES.medium}`,
  large: `Large \u2014 ${VIDEO_SIZES.large} \xD7 ${VIDEO_SIZES.large}`
};
var TEMPO_LABELS = {
  fixed: "Fixed \u2014 initial clock tempo only; notes at their recorded time (works in any DAW / Session view)",
  map: 'Tempo map \u2014 every clock change as recorded (Ableton: Arrangement-view import, say yes to "import tempo")'
};
var RecorderSettingsComponent = class extends BaseComponent {
  radioGroup(name, options, labels, current, onChange, disabled = false) {
    const group = document.createElement("div");
    group.className = "rec-radio-group";
    for (const value of options) {
      const row = document.createElement("label");
      row.className = "rec-radio-row";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      input.checked = value === current;
      input.disabled = disabled;
      input.addEventListener("change", () => input.checked && onChange(value));
      const text = document.createElement("span");
      text.textContent = labels[value];
      row.append(input, text);
      group.appendChild(row);
    }
    return group;
  }
  /**
   * "label ........ [switch]" row. The switch is the app-wide
   * `.toggle-switch`, not a checkbox, so it reads like the navbar's.
   */
  toggleRow(text, on, onChange) {
    const row = document.createElement("label");
    row.className = "settings-row";
    const label = document.createElement("span");
    label.textContent = text;
    const toggle = document.createElement("div");
    toggle.className = "toggle-switch rec-video-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", text);
    toggle.classList.toggle("active", on);
    toggle.setAttribute("aria-checked", String(on));
    this.bindEvent(toggle, "click", () => onChange(!toggle.classList.contains("active")));
    row.append(label, toggle);
    return row;
  }
  section(title, body, wide = false) {
    const sec = document.createElement("section");
    sec.className = "settings-section" + (wide ? " settings-section-wide" : "");
    const heading = document.createElement("div");
    heading.className = "settings-section-title";
    heading.textContent = title;
    sec.append(heading, body);
    return sec;
  }
  /**
   * Record Animation + its export resolution. The sizes stay visible and
   * disabled while filming is off, and the whole section is disabled
   * where the runtime has no MediaRecorder (jweb, old webviews).
   */
  videoBody(enabled, size, filmExtension) {
    const body = document.createElement("div");
    body.className = "rec-video-body";
    const available = filmExtension !== null;
    body.append(
      this.toggleRow(
        "Record Animation",
        available && enabled,
        (on) => available && RecordingActions.setVideoEnabled(on)
      ),
      this.radioGroup(
        "rec-video-size",
        VIDEO_SIZE_MODES,
        VIDEO_SIZE_LABELS,
        size,
        (v) => RecordingActions.setVideoSize(v),
        !available || !enabled
      )
    );
    const hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent = available ? `The tonewheel over the take, written as .${filmExtension}. Larger sizes render the same drawing at more pixels \u2014 the on-page wheel is unaffected.` : "This browser cannot record video.";
    body.appendChild(hint);
    return body;
  }
  render() {
    this.teardown();
    this.el.innerHTML = "";
    const { audioMode, midiMode, tempoMode, lengthMode, videoEnabled, videoSize } = recorderConfig;
    const filmExtension = TonewheelFilm.extension();
    const row = document.createElement("div");
    row.className = "settings-sections";
    row.append(
      this.section("Audio (.wav)", this.radioGroup(
        "rec-audio-mode",
        AUDIO_MODES,
        AUDIO_LABELS,
        audioMode,
        (v) => RecordingActions.setAudioMode(v)
      )),
      this.section("MIDI (.mid)", this.radioGroup(
        "rec-midi-mode",
        MIDI_MODES,
        MIDI_LABELS,
        midiMode,
        (v) => RecordingActions.setMidiMode(v)
      )),
      this.section("Animation", this.videoBody(videoEnabled, videoSize, filmExtension)),
      this.section("Take length", this.radioGroup(
        "rec-length-mode",
        LENGTH_MODES,
        LENGTH_LABELS,
        lengthMode,
        (v) => RecordingActions.setLengthMode(v)
      ), true),
      this.section("Tempo in the .mid", this.radioGroup(
        "rec-tempo-mode",
        TEMPO_MODES,
        TEMPO_LABELS,
        tempoMode,
        (v) => RecordingActions.setTempoMode(v)
      ), true)
    );
    const note = document.createElement("p");
    note.className = "settings-hint";
    note.textContent = "One .wav and one .mid per take, sharing a timeline. The beat comes from the overtone set as MIDI clock; the tempo setting applies when you download. An animation is filmed as its own file, with the master audio in it.";
    this.el.append(row, note);
  }
  /** Reflect a mode changed elsewhere without rebuilding. */
  syncChecked() {
    const { audioMode, midiMode, tempoMode, lengthMode, videoEnabled, videoSize } = recorderConfig;
    for (const input of this.qAll('input[name="rec-audio-mode"]')) input.checked = input.value === audioMode;
    for (const input of this.qAll('input[name="rec-midi-mode"]')) input.checked = input.value === midiMode;
    for (const input of this.qAll('input[name="rec-tempo-mode"]')) input.checked = input.value === tempoMode;
    for (const input of this.qAll('input[name="rec-length-mode"]')) input.checked = input.value === lengthMode;
    const filming = TonewheelFilm.extension() !== null && videoEnabled;
    const toggle = this.q(".rec-video-toggle");
    if (toggle) {
      toggle.classList.toggle("active", filming);
      toggle.setAttribute("aria-checked", String(filming));
    }
    for (const input of this.qAll('input[name="rec-video-size"]')) {
      input.checked = input.value === videoSize;
      input.disabled = !filming;
    }
  }
};

// js/modules/files/audition.js
var FADE_SECONDS = 0.01;
var WAVE_SECONDS = 1.5;
var WAVE_LEVEL = 0.25;
var active = null;
var audition = {
  /** The entry id sounding right now, or null. */
  get playing() {
    return active?.id ?? null;
  },
  /** Called whenever `playing` changes. */
  onChange: null,
  /** Play a decoded buffer (a sound file or a take's first channel). */
  async playBuffer(id, buffer) {
    const ctx = await context();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    start(id, node, ctx, buffer.duration, 1);
  },
  /** Play raw samples at the rate they were made at (an IR). */
  async playSamples(id, samples, sampleRate) {
    const ctx = await context();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    return this.playBuffer(id, buffer);
  },
  /**
   * Sound a baked waveform as a note. Its table spans `periodMultiplier`
   * fundamental periods, so the oscillator runs that much slower to play
   * the pitch asked for — the same correction the voices make.
   */
  async playWave(id, periodicWave, frequency, periodMultiplier = 1) {
    const ctx = await context();
    const node = ctx.createOscillator();
    node.setPeriodicWave(periodicWave);
    node.frequency.value = Math.max(0.01, frequency / (periodMultiplier || 1));
    start(id, node, ctx, WAVE_SECONDS, WAVE_LEVEL);
  },
  stop() {
    if (!active) return;
    const { node, gain } = active;
    const ctx = audioEngine.context;
    active = null;
    const end = ctx.currentTime + FADE_SECONDS;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, end);
    try {
      node.stop(end);
    } catch {
    }
    node.onended = null;
    setTimeout(() => {
      node.disconnect();
      gain.disconnect();
    }, FADE_SECONDS * 2e3);
    audition.onChange?.();
  }
};
async function context() {
  await initAudio();
  audition.stop();
  return audioEngine.context;
}
function start(id, node, ctx, seconds, level) {
  const gain = ctx.createGain();
  const at = ctx.currentTime;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + FADE_SECONDS);
  gain.gain.setValueAtTime(level, at + Math.max(FADE_SECONDS, seconds - FADE_SECONDS));
  gain.gain.linearRampToValueAtTime(0, at + seconds);
  node.connect(gain).connect(ctx.destination);
  node.start(at);
  node.stop(at + seconds);
  node.onended = () => {
    if (active?.node !== node) return;
    active = null;
    gain.disconnect();
    audition.onChange?.();
  };
  active = { id, node, gain };
  audition.onChange?.();
}

// js/modules/files/filesActions.js
var LIBRARY_KINDS = [
  { kind: "wave", title: "Waveforms", use: "Play this oscillator", empty: "Bake one with Create Oscillator." },
  { kind: "ir", title: "Impulse responses", use: "Ring every overtone through it", empty: "Bake one with Create IR." },
  { kind: "soundfile", title: "Sound files", use: "Load it into the sampler", empty: "Choose a file in the Source panel." },
  {
    kind: "recording",
    title: "Recordings",
    use: "Select this take",
    empty: "Record a performance with the \u25CF button.",
    note: "This session only \u2014 takes are not saved to the machine. The .mid and multitrack stems download from the recorder strip."
  }
];
var WAVE_TABLE_SIZE = 4096;
async function libraryEntries() {
  const [waves, irs, soundfiles] = await Promise.all([
    listAssets(ASSET.wave.kind),
    listAssets(ASSET.ir.kind),
    listAssets(ASSET.soundfile.kind)
  ]);
  return {
    wave: waves.map((asset, i) => ({
      ...base(asset),
      name: asset.name || `Custom ${i + 1}`,
      detail: `table spans ${asset.meta.periodMultiplier || 1} period${(asset.meta.periodMultiplier || 1) === 1 ? "" : "s"}`,
      inUse: AppState.currentWaveform === asset.id
    })),
    ir: irs.map((asset) => ({
      ...base(asset),
      detail: [
        formatSeconds(irSeconds(asset)),
        asset.meta.bakeFrequency ? `baked at ${asset.meta.bakeFrequency.toFixed(1)} Hz` : null
      ].filter(Boolean).join(" \xB7 "),
      inUse: usesIR(asset.id)
    })),
    soundfile: soundfiles.map((asset) => ({
      ...base(asset),
      detail: "as imported",
      inUse: sourceManager.fileSource?.id === asset.id
    })),
    recording: recordingStore.list().map(({ key }) => {
      const take = recordingStore.get(key);
      return {
        id: key,
        kind: "recording",
        name: take.name,
        bytes: take.audio.channels.reduce((sum, channel) => sum + channel.length * 4, 0) + (take.video?.blob.size ?? 0),
        savedAt: null,
        detail: `${take.audio.channels.length} ch \xB7 ${formatSeconds(take.duration)}` + (take.video ? ` \xB7 .${take.video.extension}` : ""),
        inUse: AppState.recorder.selected === key
      };
    })
  };
}
function base(asset) {
  return { id: asset.id, kind: asset.kind, name: asset.name || asset.id, bytes: asset.bytes, savedAt: asset.savedAt };
}
function irSeconds(asset) {
  const rate = asset.meta.sampleRate || 48e3;
  return asset.bytes / 4 / rate;
}
function formatSeconds(seconds) {
  if (seconds < 10) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function usesIR(key) {
  const count = AppState.currentSystem.ratios.length;
  for (let i = 0; i < count; i++) {
    if (OvertoneSignalActions.getConvolution(i).ir === key) return true;
  }
  return false;
}
async function storageReport() {
  const [usage, quota] = await Promise.all([assetStore.usage(), assetStore.quota()]);
  const libraryBytes = Object.values(usage).reduce((sum, kind) => sum + kind.bytes, 0);
  return { usage, libraryBytes, quota, ephemeral: assetStore.ephemeral };
}
async function useEntry(entry) {
  switch (entry.kind) {
    case "wave":
      setCurrentWaveform(entry.id);
      break;
    case "ir": {
      const count = AppState.currentSystem.ratios.length;
      for (let i = 0; i < count; i++) OvertoneSignalActions.setConvolution(i, { ir: entry.id });
      break;
    }
    case "soundfile":
      await SourceActions.loadLibraryEntry(entry);
      break;
    case "recording":
      RecordingActions.select(entry.id);
      break;
  }
  changed();
}
async function renameEntry(entry, name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === entry.name) return;
  if (entry.kind === "recording") {
    recordingStore.rename(entry.id, trimmed);
    document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key: entry.id } }));
  } else {
    await renameAsset(entry.id, trimmed);
    if (entry.kind === "wave") {
      getWavetableManager().setName(entry.id, trimmed);
      syncWaveformOptions();
    } else if (entry.kind === "ir") {
      irManager.setName(entry.id, trimmed);
      document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
    }
  }
  changed();
}
async function removeEntry(entry) {
  switch (entry.kind) {
    case "wave": {
      const manager = getWavetableManager();
      if (AppState.currentWaveform === entry.id) setCurrentWaveform("sine");
      manager.remove(entry.id);
      delete AppState.customWaveCoefficients?.[entry.id];
      delete AppState.customWavePeriodMultipliers?.[entry.id];
      forgetCustomWaveTable(entry.id);
      TonewheelActions.clearCustomWaveCache();
      await forgetAsset(entry.id);
      syncWaveformOptions(manager);
      break;
    }
    case "ir": {
      const count = AppState.currentSystem.ratios.length;
      for (let i = 0; i < count; i++) {
        if (OvertoneSignalActions.getConvolution(i).ir === entry.id) {
          OvertoneSignalActions.setConvolution(i, { ir: null });
        }
      }
      irManager.remove(entry.id);
      await forgetAsset(entry.id);
      document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
      break;
    }
    case "soundfile":
      await forgetAsset(entry.id);
      break;
    case "recording":
      if (AppState.recorder.selected === entry.id) {
        RecordingActions.reset();
        RecordingActions.select(recordingStore.list().find((r) => r.key !== entry.id)?.key ?? null);
      }
      recordingStore.remove(entry.id);
      document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key: entry.id } }));
      break;
  }
  showStatus(`Deleted ${entry.name}`, "success");
  changed();
}
async function downloadEntry(entry) {
  if (entry.kind === "recording") {
    RecordingActions.select(entry.id);
    RecordingActions.downloadWav();
    return;
  }
  const record = await assetRecord(entry.id);
  if (!record) {
    showStatus(`${entry.name} is no longer in the library`, "error");
    return;
  }
  if (entry.kind === "soundfile") {
    WAVExporter.downloadFile(record.bytes, fileName(entry.name, ""), "application/octet-stream");
    return;
  }
  if (entry.kind === "ir") {
    const bytes = WAVExporter.createWAVBufferMulti([record.pcm], record.meta?.sampleRate || 48e3, { float: true });
    WAVExporter.downloadFile(bytes, fileName(entry.name, ".wav"), "audio/wav");
    return;
  }
  const table = precomputeWavetableFromCoefficients(record, WAVE_TABLE_SIZE);
  WAVExporter.downloadFile(
    WAVExporter.createWAVBufferMulti([table], 44100, { float: true }),
    fileName(entry.name, ".wav"),
    "audio/wav"
  );
}
function fileName(name, extension) {
  const clean = name.replace(/[/\\:*?"<>|]/g, "-").trim() || "twig-file";
  return clean.toLowerCase().endsWith(extension.toLowerCase()) ? clean : clean + extension;
}
async function previewOf(entry) {
  if (entry.kind === "recording") {
    const take = recordingStore.get(entry.id);
    if (!take) return null;
    return {
      overview: overviewOfData(take.audio.channels[0], take.duration),
      duration: take.duration,
      sampleRate: take.audio.sampleRate
    };
  }
  const record = await assetRecord(entry.id);
  if (!record) return null;
  if (entry.kind === "wave") {
    return { table: precomputeWavetableFromCoefficients(record, WAVE_TABLE_SIZE), duration: 0, sampleRate: 0 };
  }
  if (entry.kind === "ir") {
    const sampleRate = record.meta?.sampleRate || 48e3;
    return {
      overview: overviewOfData(record.pcm, record.pcm.length / sampleRate),
      duration: record.pcm.length / sampleRate,
      sampleRate
    };
  }
  const buffer = await decodeStored(record.bytes);
  return {
    overview: overviewOfData(buffer.getChannelData(0), buffer.duration),
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    buffer
  };
}
async function playEntry(entry, preview = null) {
  if (isPlaying(entry)) {
    if (entry.kind === "recording") RecordingActions.pause();
    else audition.stop();
    return;
  }
  switch (entry.kind) {
    case "wave": {
      await initAudio();
      const manager = getWavetableManager();
      const wave = manager.getWaveform(entry.id);
      if (wave) {
        await audition.playWave(entry.id, wave, AppState.fundamentalFrequency, manager.getPeriodMultiplier(entry.id));
      }
      break;
    }
    case "ir": {
      const record = await assetRecord(entry.id);
      if (record?.pcm) await audition.playSamples(entry.id, record.pcm, record.meta?.sampleRate || 48e3);
      break;
    }
    case "soundfile": {
      const buffer = preview?.buffer || await decodeStored((await assetRecord(entry.id))?.bytes);
      if (buffer) await audition.playBuffer(entry.id, buffer);
      break;
    }
    case "recording":
      RecordingActions.select(entry.id);
      RecordingActions.play();
      break;
  }
}
function isPlaying(entry) {
  if (entry.kind === "recording") {
    return AppState.recorder.selected === entry.id && AppState.recorder.transport === "playing";
  }
  return audition.playing === entry.id;
}
async function decodeStored(bytes) {
  const offline = new OfflineAudioContext(1, 1, 44100);
  return decodeAudioFile(offline, bytes.slice(0));
}
function changed() {
  document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
}

// js/modules/files/FilesSettingsComponent.js
var ICONS = {
  use: '<path d="M3 8.5l3.5 3.5L13 4.5"/>',
  play: '<path d="M5.5 3.5l7 4.5-7 4.5z" fill="currentColor"/>',
  stop: '<path d="M4.5 4.5h7v7h-7z" fill="currentColor"/>',
  rename: '<path d="M3 13h3l7-7-3-3-7 7zM9.5 3.5l3 3"/>',
  download: '<path d="M8 2.5v7m0 0L5 6.5M8 9.5l3-3M3 13h10"/>',
  remove: '<path d="M3 4.5h10M6.5 4.5V2.5h3v2M4.5 4.5l.8 8.5h5.4l.8-8.5"/>'
};
var PREVIEW_HEIGHT = 96;
var ARM_MS = 4e3;
var FilesSettingsComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.entries = {};
    this.selected = null;
    this.preview = null;
    this.armed = null;
    this.armTimer = null;
    this.renaming = null;
    this.sketch = null;
  }
  render() {
    this.teardown();
    this.el.innerHTML = "";
    const sections = document.createElement("div");
    sections.className = "settings-sections";
    sections.append(this.storageCard(), this.previewCard());
    for (const kind of LIBRARY_KINDS) sections.appendChild(this.tableCard(kind));
    this.el.appendChild(sections);
    this.sketch = new Sketch(this.q(".files-preview-canvas"), {
      draw: (ctx, sk) => this.drawPreview(ctx, sk),
      loop: false,
      fallbackSize: PREVIEW_HEIGHT
    });
    this.bindDelegates();
    audition.onChange = () => this.syncPlayButtons();
    this.refresh();
  }
  teardown() {
    super.teardown();
    clearTimeout(this.armTimer);
    audition.onChange = null;
    this.sketch?.destroy();
    this.sketch = null;
  }
  // ---- Structure ----------------------------------------------------
  section(title, className, wide = false) {
    const sec = document.createElement("section");
    sec.className = `settings-section ${className}${wide ? " settings-section-wide" : ""}`;
    const heading = document.createElement("div");
    heading.className = "settings-section-title";
    heading.textContent = title;
    sec.appendChild(heading);
    return sec;
  }
  storageCard() {
    const card = this.section("On this machine", "files-storage");
    card.insertAdjacentHTML("beforeend", `
            <div class="files-bar"><span class="files-bar-fill"></span></div>
            <div class="files-figures"></div>
            <div class="settings-row files-location">
                <span class="files-location-text"></span>
                <button type="button" class="action-btn" disabled
                    title="Choosing a folder needs the desktop app">Choose folder\u2026</button>
            </div>
            <p class="settings-hint">Your waveforms, impulse responses and sound files are kept on this
                computer, in this browser's own storage. Nothing is uploaded anywhere.</p>`);
    return card;
  }
  previewCard() {
    const card = this.section("Preview", "files-preview");
    card.insertAdjacentHTML("beforeend", `
            <div class="files-preview-canvas"></div>
            <div class="files-preview-meta">Select a file to see it here.</div>`);
    return card;
  }
  tableCard({ kind, title, empty, note }) {
    const card = this.section(title, "files-kind", true);
    card.dataset.kind = kind;
    const table = document.createElement("table");
    table.className = "files-table";
    table.innerHTML = "<tbody></tbody>";
    const none = document.createElement("p");
    none.className = "settings-hint files-empty";
    none.textContent = empty;
    card.append(table, none);
    if (note) {
      const hint = document.createElement("p");
      hint.className = "settings-hint";
      hint.textContent = note;
      card.appendChild(hint);
    }
    return card;
  }
  // ---- Filling ------------------------------------------------------
  /** Re-read the library and redraw every table. */
  async refresh() {
    const [entries, storage] = await Promise.all([libraryEntries(), storageReport()]);
    this.entries = entries;
    this.renderStorage(storage);
    for (const { kind } of LIBRARY_KINDS) this.renderTable(kind);
    if (this.selected && !this.entryOf(this.selected)) this.select(null);
    else this.markSelection();
  }
  renderStorage({ usage, libraryBytes, quota, ephemeral }) {
    const share = quota?.quota ? Math.min(1, libraryBytes / quota.quota) : 0;
    this.q(".files-bar-fill").style.width = `${Math.max(share * 100, libraryBytes ? 0.5 : 0)}%`;
    const counts = LIBRARY_KINDS.filter(({ kind }) => usage[kind]).map(({ kind, title }) => `${title} ${usage[kind].count}`).join(" \xB7 ");
    this.q(".files-figures").textContent = `${formatBytes(libraryBytes)} stored${quota?.quota ? ` of ${formatBytes(quota.quota)} this browser allows` : ""} \u2014 ${counts}`;
    this.q(".files-location-text").textContent = ephemeral ? "No storage available \u2014 this session only" : "Folder \xB7 this browser's storage";
  }
  renderTable(kind) {
    const card = this.q(`.files-kind[data-kind="${kind}"]`);
    const body = card.querySelector("tbody");
    const entries = this.entries[kind] || [];
    body.innerHTML = "";
    card.querySelector(".files-empty").hidden = entries.length > 0;
    for (const entry of entries) body.appendChild(this.row(entry));
    this.markSelection();
  }
  row(entry) {
    const tr = document.createElement("tr");
    tr.className = "files-row";
    tr.dataset.id = entry.id;
    tr.dataset.kind = entry.kind;
    const name = document.createElement("td");
    name.className = "files-name";
    name.appendChild(this.nameCell(entry));
    if (entry.inUse) {
      const tag = document.createElement("span");
      tag.className = "files-inuse";
      tag.textContent = "in use";
      name.appendChild(tag);
    }
    const detail = document.createElement("td");
    detail.className = "files-detail";
    detail.textContent = entry.detail;
    const size = document.createElement("td");
    size.className = "files-size";
    size.textContent = formatBytes(entry.bytes);
    tr.append(name, detail, size, this.actionsCell(entry));
    return tr;
  }
  nameCell(entry) {
    if (this.sameEntry(this.renaming, entry)) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "files-name-input";
      input.value = entry.name;
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
      return input;
    }
    const span = document.createElement("span");
    span.className = "files-name-text";
    span.textContent = entry.name;
    span.title = entry.name;
    return span;
  }
  actionsCell(entry) {
    const cell = document.createElement("td");
    cell.className = "files-actions";
    const playing = isPlaying(entry);
    const armed = this.sameEntry(this.armed, entry);
    cell.append(
      this.iconButton("use", LIBRARY_KINDS.find((k) => k.kind === entry.kind).use),
      this.iconButton(playing ? "stop" : "play", playing ? "Stop" : "Play"),
      this.iconButton("rename", "Rename"),
      this.iconButton("download", "Download"),
      this.iconButton("remove", armed ? "Delete for good?" : "Delete", armed ? "files-armed" : "")
    );
    return cell;
  }
  iconButton(icon, label, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn files-icon-btn ${className}`.trim();
    button.dataset.action = icon === "stop" ? "play" : icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = svg(icon);
    return button;
  }
  // ---- Events (delegated from the panel root) ------------------------
  bindDelegates() {
    this.bindEvent(this.el, "click", (e) => {
      const button = e.target.closest(".files-icon-btn");
      const row = e.target.closest(".files-row");
      if (!row) return;
      const entry = this.entryOf(row.dataset);
      if (!entry) return;
      if (!button) {
        this.select(entry);
        return;
      }
      this.act(button.dataset.action, entry);
    });
    this.bindEvent(this.el, "focusout", (e) => {
      if (e.target.classList?.contains("files-name-input")) this.commitRename(e.target.value);
    });
    this.bindEvent(this.el, "keydown", (e) => {
      if (!e.target.classList?.contains("files-name-input")) return;
      if (e.key === "Enter") e.target.blur();
      else if (e.key === "Escape") {
        const renaming = this.renaming;
        this.renaming = null;
        if (renaming) this.renderTable(renaming.kind);
      }
    });
  }
  async act(action, entry) {
    switch (action) {
      case "use":
        await useEntry(entry);
        this.refresh();
        break;
      case "play":
        await playEntry(entry, this.sameEntry(this.selected, entry) ? this.preview : null);
        this.syncPlayButtons();
        break;
      case "rename":
        this.renaming = { kind: entry.kind, id: entry.id };
        this.renderTable(entry.kind);
        break;
      case "download":
        await downloadEntry(entry);
        break;
      case "remove":
        await this.remove(entry);
        break;
    }
  }
  /** First click arms, second deletes; the arming lapses on its own. */
  async remove(entry) {
    if (this.sameEntry(this.armed, entry)) {
      this.armed = null;
      clearTimeout(this.armTimer);
      await removeEntry(entry);
      this.refresh();
      return;
    }
    const previous = this.armed;
    this.armed = { kind: entry.kind, id: entry.id };
    clearTimeout(this.armTimer);
    if (previous && previous.kind !== entry.kind) this.renderTable(previous.kind);
    this.renderTable(entry.kind);
    this.armTimer = setTimeout(() => {
      const armed = this.armed;
      this.armed = null;
      if (armed) this.renderTable(armed.kind);
    }, ARM_MS);
  }
  async commitRename(value) {
    const renaming = this.renaming;
    if (!renaming) return;
    this.renaming = null;
    const entry = this.entryOf(renaming);
    if (!entry) return;
    await renameEntry(entry, value);
    this.refresh();
  }
  /** Only the play/stop faces changed — don't rebuild rows under a pointer. */
  syncPlayButtons() {
    for (const row of this.qAll(".files-row")) {
      const entry = this.entryOf(row.dataset);
      const button = row.querySelector('[data-action="play"]');
      if (!entry || !button) continue;
      const playing = isPlaying(entry);
      button.title = playing ? "Stop" : "Play";
      button.innerHTML = svg(playing ? "stop" : "play");
    }
  }
  // ---- Selection and preview ----------------------------------------
  async select(entry) {
    this.selected = entry ? { kind: entry.kind, id: entry.id } : null;
    this.markSelection();
    if (!entry) {
      this.preview = null;
      this.q(".files-preview-meta").textContent = "Select a file to see it here.";
      this.sketch?.redraw();
      return;
    }
    this.q(".files-preview-meta").textContent = `${entry.name} \u2014 reading\u2026`;
    const preview = await previewOf(entry);
    if (!this.sameEntry(this.selected, entry)) return;
    this.preview = preview;
    this.q(".files-preview-meta").textContent = preview ? `${entry.name} \u2014 ${entry.detail}${preview.sampleRate ? ` \xB7 ${(preview.sampleRate / 1e3).toFixed(1)} kHz` : ""}` : `${entry.name} \u2014 nothing to draw`;
    this.sketch?.redraw();
  }
  markSelection() {
    for (const row of this.qAll(".files-row")) {
      const on = this.sameEntry(this.selected, row.dataset);
      row.classList.toggle("selected", on);
      row.setAttribute("aria-selected", String(on));
    }
  }
  drawPreview(ctx, sk) {
    drawWaveformFrame(ctx, sk.width, sk.height, {
      background: themeColor("--viz-bg"),
      grid: themeColor("--viz-grid")
    });
    if (!this.preview) return;
    const trace = themeColor("--viz-trace");
    if (this.preview.table) drawCycle(ctx, this.preview.table, sk.width, sk.height, trace, 2);
    else if (this.preview.overview) drawOverview(ctx, this.preview.overview, sk.width, sk.height, trace);
  }
  // ---- Lookups ------------------------------------------------------
  /** The live entry behind a row's dataset (or a remembered selection). */
  entryOf(ref) {
    return ref ? (this.entries[ref.kind] || []).find((e) => e.id === ref.id) || null : null;
  }
  sameEntry(a, b) {
    return Boolean(a && b) && a.kind === b.kind && a.id === b.id;
  }
};
function svg(icon) {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
        stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
}
var UNITS = ["B", "kB", "MB", "GB"];
function formatBytes(bytes) {
  let value = bytes || 0;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

// js/modules/settings/KeyboardSettingsComponent.js
var KeyboardSettingsComponent = class extends BaseComponent {
  render() {
    this.teardown();
    this.el.innerHTML = "";
    const sections = document.createElement("div");
    sections.className = "settings-sections";
    for (const { group, items } of SHORTCUTS) sections.appendChild(this.section(group, items));
    const note = document.createElement("p");
    note.className = "settings-hint";
    note.textContent = "Keys do nothing while a text field has focus \u2014 typing belongs to the field. Letting go of a held overtone releases its envelope, and leaving the window releases them all.";
    this.el.append(sections, note);
  }
  section(group, items) {
    const sec = document.createElement("section");
    sec.className = "settings-section";
    const heading = document.createElement("div");
    heading.className = "settings-section-title";
    heading.textContent = group;
    const list = document.createElement("dl");
    list.className = "shortcut-list";
    for (const { keys, what } of items) {
      const term = document.createElement("dt");
      for (const key of keys) {
        const el = document.createElement(key === "\u2026" ? "span" : "kbd");
        el.textContent = key;
        term.appendChild(el);
      }
      const description = document.createElement("dd");
      description.textContent = what;
      list.append(term, description);
    }
    sec.append(heading, list);
    return sec;
  }
};

// js/modules/settings/settingsController.js
var TABS = {
  midi: "#midi-settings",
  recorder: "#recorder-settings",
  files: "#files-settings",
  keyboard: "#keyboard-settings"
};
var SettingsController = class {
  constructor(rootSelector) {
    this.root = document.querySelector(rootSelector);
    if (!this.root) throw new Error(`SettingsController: missing ${rootSelector}`);
    this.midi = new MidiSettingsComponent(this.root.querySelector(TABS.midi));
    this.recorder = new RecorderSettingsComponent(this.root.querySelector(TABS.recorder));
    this.files = new FilesSettingsComponent(this.root.querySelector(TABS.files));
    this.keyboard = new KeyboardSettingsComponent(this.root.querySelector(TABS.keyboard));
  }
  init() {
    this.midi.render();
    this.recorder.render();
    this.files.render();
    this.keyboard.render();
    document.addEventListener(MIDI_PORTS_CHANGED, () => this.midi.render());
    document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.midi.render());
    document.addEventListener(RECORDER_CHANGED, () => this.recorder.syncChecked());
    document.addEventListener(LIBRARY_CHANGED, () => this.files.refresh());
    document.addEventListener(RECORDINGS_CHANGED, () => this.files.refresh());
    this.root.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.addEventListener("click", () => this.selectTab(btn.dataset.tab));
    });
  }
  /** One tab at a time. */
  selectTab(tab) {
    this.tab = TABS[tab] ? tab : "midi";
    for (const [name, selector] of Object.entries(TABS)) {
      this.root.querySelector(selector).hidden = name !== this.tab;
    }
    if (this.tab === "files") this.files.refresh();
    this.root.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.tab === this.tab));
    });
    this.root.scrollTop = 0;
  }
};
export {
  SettingsController
};
