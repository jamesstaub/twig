import {
  DrawbarsActions,
  FAMILIES,
  FundamentalActions,
  KeyboardShortcuts,
  PlayToggleActions,
  RecordingActions,
  SourceActions,
  SpectralSystemActions,
  TRIGGER_KEY_LABELS,
  drawOverview,
  drawWaveformFrame,
  midiConfigActions_exports,
  midiInputRouter,
  quantize,
  recordingStore,
  samplerLibrary,
  updateMidiOutputPort
} from "./chunks/chunk-3CXT2YX5.js";
import {
  initPresets
} from "./chunks/chunk-XLPHZK5Z.js";
import {
  cycleStepper
} from "./chunks/chunk-MFGZ25DX.js";
import {
  BaseComponent
} from "./chunks/chunk-VX6I3QE2.js";
import {
  CURRENT_WAVEFORM_CHANGED,
  DRIVE_MAX,
  MANAGE_FILES_OPTION,
  OvertoneSignalActions,
  PATTERNS,
  PresetActions,
  Q_MAX,
  SURFACES,
  Sketch,
  TonewheelActions,
  getWaveValue,
  handleAddToWaveforms,
  handleWaveformChange,
  layoutMode,
  mountSettings,
  openSettings,
  partialColor,
  patternById,
  patternIdFromName,
  patternParams,
  patternPeriod,
  restoreWaveformOptions,
  setCurrentWaveform,
  strokePath,
  surfaceState,
  themeColor,
  waveformMenuNames,
  withAlpha
} from "./chunks/chunk-IXPH2EMF.js";
import {
  CONVOLUTION_IRS_CHANGED,
  DRAWBARS_RANDOMIZED,
  DRAWBARS_RESET,
  DRAWBAR_CHANGE,
  ENVELOPE_MODE_CHANGED,
  FUNDAMENTAL_CHANGED,
  INSPECTOR_CHANGED,
  IR_RING_CHANGED,
  LAYOUT_MODE_CHANGED,
  LIBRARY_CHANGED,
  LINK_ALL_CHANGED,
  MASTER_GAIN_CHANGED,
  MASTER_SLEW_CHANGED,
  MIDI_OUTPUT_CHANGED,
  MIDI_PORTS_CHANGED,
  OVERTONE_SIGNAL_CHANGED,
  PLAY_STATE_CHANGED,
  PRESETS_CHANGED,
  RECORDER_CHANGED,
  RECORDINGS_CHANGED,
  ROUTING_MODE_CHANGED,
  SHAPE_MODE_CHANGED,
  SOURCE_CHANGED,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED,
  SURFACE_CHANGED,
  assetStore,
  audioEngine,
  calculateFrequency,
  clockFold,
  contourFn,
  exportAsWAV,
  formatFrequency,
  formatHz,
  generateFilenameParts,
  getFrequencyCorrection,
  getOutputAnalyser,
  getVoiceLevel,
  getVoicePan,
  getWavetableManager,
  harmonicCyclePosition,
  irManager,
  loadAppConfig,
  midiConfig,
  midiOutputRouter,
  momentumSmoother,
  noteForVoice,
  pulseBus,
  pulseChannel,
  recorderConfig,
  restore,
  sampleCurrentWaveform,
  saveIR,
  setPulseHandler,
  showStatus,
  smoothUpdateMasterGain,
  soundfileConfig,
  sourceManager,
  triggerHarmonicAttack,
  triggerHarmonicRelease,
  updateAudioProperties,
  updateHarmonicPulse,
  updateValue
} from "./chunks/chunk-YSWKRLK7.js";
import {
  AppState,
  COMPRESS_A_MAX,
  COMPRESS_A_MIN,
  DEFAULT_COMPRESS_A,
  DEFAULT_FILTER_TYPE,
  DEFAULT_STIFFNESS_B,
  DEFAULT_STRETCH_A,
  DEFAULT_TUBE_CLOSEDNESS,
  FILTER_TYPES,
  IR_RING_MAX_SECONDS,
  SOURCE_MODES,
  STIFFNESS_B_MAX,
  STRETCH_A_MAX,
  STRETCH_A_MIN,
  spectralSystems,
  updateAppState
} from "./chunks/chunk-ZE2D7APW.js";

// js/dsp/gate/modTargets.js
function audioGain(s, depthGain) {
  return 1 - depthGain * (1 - s);
}

// js/modules/overtoneSignal/sequencePreview.js
function shapeSampler(shapeName, resolution = 256) {
  const builtIn = contourFn(shapeName);
  if (builtIn) return builtIn;
  const coeffs = AppState.customWaveCoefficients?.[shapeName];
  if (!coeffs) return () => 1;
  const raw = [];
  for (let i = 0; i < resolution; i++) {
    raw.push(getWaveValue(shapeName, i / resolution * 2 * Math.PI, coeffs));
  }
  const min = Math.min(...raw);
  const span = Math.max(...raw) - min || 1;
  const table = raw.map((v) => (v - min) / span);
  return (phase) => {
    const pos = phase * table.length;
    const i0 = Math.floor(pos) % table.length;
    const i1 = (i0 + 1) % table.length;
    return table[i0] + (table[i1] - table[i0]) * (pos - i0);
  };
}
function patternContext(gate) {
  return { x: gate.x, y: gate.y, steps: gate.seq || null, cache: {} };
}
function previewPattern(gate, cycles2) {
  const pattern = patternById(gate.mode);
  if (pattern.bypass || pattern.random) return Array.from({ length: cycles2 }, () => true);
  const ctx = patternContext(gate);
  return Array.from({ length: cycles2 }, (_, c) => Boolean(pattern.active(c, ctx)));
}
function previewCycleCount(gate, stretch) {
  const period = patternPeriod(gate.mode, patternContext(gate));
  return Math.min(32, Math.max(period, Math.ceil(stretch), 1));
}
var MOD_LAYERS = [
  { target: "gain", color: "--mod-gain", curve: (s, a) => audioGain(s, a) },
  { target: "freq", color: "--mod-freq", curve: (s, a) => 0.5 + 0.5 * a * s },
  { target: "res", color: "--mod-res", curve: (s, a) => a * s },
  { target: "wet", color: "--mod-wet", curve: (s, a) => a * s },
  { target: "fb", color: "--mod-fb", curve: (s, a) => a * s }
];
function drawSequencePreview(ctx, index, w, h) {
  const gate = OvertoneSignalActions.getGate(index);
  const seq = OvertoneSignalActions.getSequencer(index);
  const pad = 4;
  ctx.fillStyle = themeColor("--viz-bg");
  ctx.fillRect(0, 0, w, h);
  const cycles2 = previewCycleCount(gate, seq.stretch);
  const active = previewPattern(gate, cycles2);
  ctx.strokeStyle = themeColor("--viz-grid");
  ctx.lineWidth = 1;
  for (let c = 1; c < cycles2; c++) {
    const x = Math.round(c / cycles2 * w) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  const shapeAt = shapeSampler(seq.shape);
  const signal = new Float32Array(w + 1);
  for (let i = 0; i <= w; i++) {
    const t = i / w * cycles2;
    const c = Math.min(cycles2 - 1, Math.floor(t));
    const phase = t - c;
    signal[i] = gate.mode === 0 ? 1 : active[c] ? shapeAt((c + phase) / seq.stretch % 1) : 0;
  }
  const plot = (valueAt, color, width) => {
    ctx.strokeStyle = themeColor(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const y = pad + (1 - Math.max(0, Math.min(1, valueAt(i)))) * (h - 2 * pad);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  };
  plot((i) => signal[i], "--viz-trace", 2);
  for (const { target, color, curve } of MOD_LAYERS) {
    const amount = seq.amounts[target] || 0;
    if (amount === 0) continue;
    plot((i) => curve(signal[i], amount), color, 1.25);
  }
}
var iconCache = /* @__PURE__ */ new Map();
function drawShapeContour(canvas, shapeName, cycles2 = 1) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.fillStyle = themeColor("--viz-bg");
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = themeColor("--viz-grid");
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  const sample = shapeSampler(shapeName);
  ctx.strokeStyle = themeColor("--viz-trace");
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= w; i++) {
    const s = sample(i / w * cycles2 % 1);
    const y = 3 + (1 - s) * (h - 6);
    if (i === 0) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  }
  ctx.stroke();
}
function shapeIconDataURL(shapeName, { width = 16, height = 10, color = "--text-secondary" } = {}) {
  const key = `${shapeName}|${width}x${height}|${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const shapeAt = shapeSampler(shapeName, 128);
  ctx.strokeStyle = themeColor(color);
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= width; i++) {
    const s = shapeAt(i / width);
    const y = 1 + (1 - s) * (height - 2);
    if (i === 0) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  }
  ctx.stroke();
  const url = canvas.toDataURL("image/png");
  iconCache.set(key, url);
  return url;
}

// js/modules/shape/rowShape.js
function shapedRow({ count, index, t, cycles: cycles2 = 1, shapeName }) {
  const sample = shapeSampler(shapeName);
  let maxPhase = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < 128; i++) {
    const s = sample(i / 128);
    if (s > maxVal) {
      maxVal = s;
      maxPhase = i / 128;
    }
  }
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const phase = ((maxPhase + (i - index) / count * cycles2) % 1 + 1) % 1;
    const s = sample(phase);
    out[i] = s * t + (1 - s) * (1 - t);
  }
  return out;
}
function stepShapeCycles(cycles2, factor) {
  return Math.max(0.25, Math.min(8, cycles2 * factor));
}

// js/modules/shape/shapeMode.js
var locked = false;
var held = false;
var cycles = 1;
var contour = null;
var last = null;
function emit() {
  document.dispatchEvent(new CustomEvent(SHAPE_MODE_CHANGED, { detail: { on: locked, held } }));
}
function setHeld(on) {
  if (on === held) return;
  held = on;
  emit();
}
function initShapeMode() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Shift") setHeld(true);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") setHeld(e.shiftKey);
  });
  window.addEventListener("blur", () => setHeld(false));
}
var shapeMode = {
  get on() {
    return locked;
  },
  /** Shift is down right now (desktop). */
  get held() {
    return held;
  },
  get cycles() {
    return cycles;
  },
  /** The contour's waveform name. */
  get contour() {
    return contour || AppState.currentWaveform;
  },
  /** Does this gesture sculpt the row? The lock, or shift (the event's, else the tracked key). */
  isGesture(e) {
    if (locked) return true;
    if (e && typeof e.shiftKey === "boolean") return e.shiftKey;
    return held;
  },
  set(on) {
    on = Boolean(on);
    if (on === locked) return;
    locked = on;
    emit();
  },
  /**
   * Sculpt a row: `t` is the edited control's 0-1 position within its
   * range; `setNorm(i, ti)` maps each voice's shaped position back into
   * the caller's parameter. Remembered for re-application.
   */
  applyRow(index, t, setNorm) {
    const positions = shapedRow({
      count: AppState.currentSystem.ratios.length,
      index,
      t,
      cycles,
      shapeName: this.contour
    });
    positions.forEach((ti, i) => setNorm(i, ti));
    last = { index, t, setNorm };
  },
  /** `applyRow` for a parameter with a range: `set(i, value)` gets values, not positions. */
  applyParam(index, { min, max }, value, set) {
    const span = max - min || 1;
    this.applyRow(index, (value - min) / span, (i, ti) => set(i, min + ti * span));
  },
  setContour(name) {
    contour = name;
    this._reapply();
  },
  stepCycles(factor) {
    cycles = stepShapeCycles(cycles, factor);
    this._reapply();
  },
  _reapply() {
    if (last) this.applyRow(last.index, last.t, last.setNorm);
    emit();
  },
  /** Off, and back to defaults (one cycle, the oscillator's own contour). */
  reset() {
    cycles = 1;
    contour = null;
    last = null;
    locked = false;
    emit();
  }
};

// js/modules/generic/dial/Dial.js
var Dial = class {
  constructor({
    min = 0,
    max = 1,
    step = 0.01,
    value = min,
    size = 20,
    label = "",
    color = "--accent-primary",
    format = null,
    onChange = null,
    fineOnShift = true,
    resetValue = null
  } = {}) {
    this.min = min;
    this.max = max;
    this.step = step;
    this.value = this._quantize(value);
    this.initialValue = resetValue === null ? this.value : this._quantize(resetValue);
    this.size = size;
    this.label = label;
    this.color = color;
    this.format = format;
    this.onChange = onChange;
    this.fineOnShift = fineOnShift;
    this.el = document.createElement("div");
    this.el.className = "mini-dial";
    this.labelEl = document.createElement("span");
    this.labelEl.className = "mini-dial-label";
    this.labelEl.textContent = label;
    this.el.appendChild(this.labelEl);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.canvas.style.setProperty("width", `${size}px`, "important");
    this.canvas.style.setProperty("height", `${size}px`, "important");
    this.el.appendChild(this.canvas);
    this.valueEl = document.createElement("span");
    this.valueEl.className = "mini-dial-value";
    this.el.appendChild(this.valueEl);
    this._bindDrag();
    this.draw();
  }
  _quantize(v) {
    const clamped = Math.max(this.min, Math.min(this.max, v));
    return Math.round(clamped / this.step) * this.step;
  }
  _bindDrag() {
    let startY = 0;
    let startValue = 0;
    const onMove = (e) => {
      const range = this.max - this.min;
      const scale = range / (e.shiftKey && this.fineOnShift ? 1024 : 128);
      const next = this._quantize(startValue + (startY - e.clientY) * scale);
      if (next !== this.value) {
        this.value = next;
        this.onChange?.(this.value, e);
        this.draw();
      }
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.disabled) return;
      e.preventDefault();
      startY = e.clientY;
      startValue = this.value;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
      }
      this.canvas.addEventListener("pointermove", onMove);
      this.canvas.addEventListener("pointerup", () => {
        this.canvas.removeEventListener("pointermove", onMove);
      }, { once: true });
    });
    this.canvas.addEventListener("dblclick", (e) => {
      if (this.disabled) return;
      this.value = this._quantize(this.initialValue);
      this.onChange?.(this.value, e);
      this.draw();
    });
  }
  /** Rename the control (e.g. mode-specific sequencer param names). */
  setLabel(text) {
    this.label = text;
    this.labelEl.textContent = text;
    this.draw();
  }
  /** Disabled dials ignore interaction and render dimmed. */
  setDisabled(disabled) {
    this.disabled = Boolean(disabled);
    this.el.classList.toggle("mini-dial-disabled", this.disabled);
  }
  _display(v) {
    if (this.format) return String(this.format(v)).replace("\n", " \xB7 ");
    const decimals = this.step >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(this.step)));
    return v.toFixed(decimals);
  }
  /** External state sync — updates the needle without firing onChange. */
  setValue(v) {
    this.value = this._quantize(v);
    this.draw();
  }
  draw() {
    const ctx = this.canvas.getContext("2d");
    const s = this.size;
    const c = s / 2;
    const r = s / 2 - 1.5;
    const start = 0.75 * Math.PI;
    const end = 2.25 * Math.PI;
    const t = (this.value - this.min) / (this.max - this.min || 1);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.lineCap = "round";
    ctx.strokeStyle = themeColor("--viz-grid");
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.arc(c, c, r, start, end);
    ctx.stroke();
    ctx.strokeStyle = themeColor(this.color);
    ctx.beginPath();
    ctx.arc(c, c, r, start, start + (end - start) * t);
    ctx.stroke();
    const angle = start + (end - start) * t;
    ctx.strokeStyle = themeColor("--text-primary");
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(angle) * (r - 4), c + Math.sin(angle) * (r - 4));
    ctx.lineTo(c + Math.cos(angle) * r, c + Math.sin(angle) * r);
    ctx.stroke();
    const text = this._display(this.value);
    this.valueEl.textContent = text;
    this.canvas.title = text;
  }
};

// js/modules/generic/linkAll.js
var held2 = false;
var locked2 = false;
function sync() {
  document.body.classList.toggle("link-all", held2 || locked2);
}
function emit2() {
  document.dispatchEvent(new CustomEvent(LINK_ALL_CHANGED, { detail: { locked: locked2, held: held2 } }));
}
function setHeld2(on) {
  if (on === held2) return;
  held2 = on;
  sync();
  emit2();
}
function initLinkAll() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Meta" || e.key === "Control") setHeld2(true);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Meta" || e.key === "Control") setHeld2(e.metaKey || e.ctrlKey);
  });
  window.addEventListener("blur", () => setHeld2(false));
}
function isLinkAll(e) {
  if (locked2) return true;
  if (e && typeof e.metaKey === "boolean") return e.metaKey || e.ctrlKey;
  return held2;
}
function voiceTargets(index, e) {
  if (!isLinkAll(e)) return [index];
  return Array.from({ length: AppState.currentSystem.ratios.length }, (_, i) => i);
}
var linkLock = {
  get on() {
    return locked2;
  },
  /** The modifier key is down right now (desktop). */
  get held() {
    return held2;
  },
  set(on) {
    on = Boolean(on);
    if (on === locked2) return;
    locked2 = on;
    sync();
    emit2();
  },
  toggle() {
    this.set(!locked2);
  }
};

// js/modules/generic/overtoneMenu.js
var LONG_PRESS_MS = 500;
var LONG_PRESS_SLOP_PX = 10;
var menu = null;
var onDismiss = null;
var onEsc = null;
async function copyFrequency(freq) {
  const text = freq.toFixed(4).replace(/\.?0+$/, "");
  try {
    await navigator.clipboard.writeText(text);
    showStatus(`Copied ${text} Hz`, "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    showStatus(ok ? `Copied ${text} Hz` : "Copy failed", ok ? "success" : "error");
  }
}
function closeOvertoneMenu() {
  if (menu) {
    menu.remove();
    menu = null;
  }
  if (onDismiss) {
    document.removeEventListener("pointerdown", onDismiss);
    onDismiss = null;
  }
  if (onEsc) {
    document.removeEventListener("keydown", onEsc);
    onEsc = null;
  }
}
function openOvertoneMenu(index, x, y) {
  closeOvertoneMenu();
  const ratio = AppState.currentSystem.ratios[index];
  if (!(ratio > 0)) return;
  const freq = calculateFrequency(ratio);
  const freqLabel = `${freq.toFixed(freq >= 100 ? 2 : 3)} Hz`;
  menu = document.createElement("div");
  menu.className = "drawbar-context-menu";
  const addItem = (label, action, enabled = true) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drawbar-context-menu-item";
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.addEventListener("click", () => {
      closeOvertoneMenu();
      action();
    });
    menu.appendChild(btn);
  };
  addItem(`Copy Frequency (${freqLabel})`, () => copyFrequency(freq));
  addItem("Set as Fundamental", () => DrawbarsActions.setDrawbarAsFundamental(index));
  const isClock = AppState.midiClockVoice === index;
  addItem(
    isClock ? "MIDI Clock \u2713" : "Set as MIDI Clock",
    () => OvertoneSignalActions.setMidiClockVoice(index),
    midiOutputRouter.available && !isClock
  );
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - rect.height - 4))}px`;
  onDismiss = (e) => {
    if (!menu.contains(e.target)) closeOvertoneMenu();
  };
  onEsc = (e) => {
    if (e.key === "Escape") closeOvertoneMenu();
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onDismiss);
    document.addEventListener("keydown", onEsc);
  }, 0);
}
function isTouchContextMenu(e) {
  return Boolean(e.pointerType) && e.pointerType !== "mouse";
}
function armLongPress(el, e, fire) {
  if (e.pointerType === "mouse") return () => {
  };
  const x = e.clientX;
  const y = e.clientY;
  let timer = null;
  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", cancel);
    el.removeEventListener("pointercancel", cancel);
  };
  const onMove = (ev) => {
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > LONG_PRESS_SLOP_PX) cancel();
  };
  timer = setTimeout(() => {
    cancel();
    fire(x, y);
  }, LONG_PRESS_MS);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  return cancel;
}

// js/modules/drawbars/DrawbarsComponent.js
var DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";
var DrawbarsComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this.family = "gain";
    this.paramIndex = 0;
    this.compact = false;
    this.sliders = [];
    this._dials = [];
    this._steppers = [];
    this._dots = [];
    this._dotLevels = [];
    this._meterRaf = null;
    this._trackResizeObserver = null;
  }
  get familyDef() {
    return FAMILIES[this.family];
  }
  /** The parameter on the bars. */
  get barParam() {
    return this.familyDef.params[this.paramIndex] || this.familyDef.params[0];
  }
  /** The family's other parameters — the dials under the bars when there's room. */
  get dialParams() {
    return this.compact ? [] : this.familyDef.params.filter((p) => p !== this.barParam);
  }
  render({ family = this.family, paramIndex = this.paramIndex, compact = this.compact, isSubharmonic } = {}) {
    this.teardown();
    this.family = FAMILIES[family] ? family : "gain";
    this.paramIndex = paramIndex;
    this.compact = Boolean(compact);
    this.el.innerHTML = "";
    this.sliders = [];
    this._dials = [];
    this._steppers = [];
    this._dots = [];
    this.setupDrawbars();
    this.updateDrawbarLabels(isSubharmonic);
    this.syncShapeMarker();
  }
  /** Marks the strip while the shape lock is on, so CSS can flag the bars as row-linked. */
  syncShapeMarker() {
    this.el.classList.toggle("shape-mode", shapeMode.on);
  }
  /**
   * Called by BaseComponent AFTER render().
   */
  bindRenderedEvents() {
    this.sliders = this.qAll(DRAWBAR_SLIDER_SELECTOR);
    this.bindEvent(this.el, "contextmenu", (e) => {
      const drawbar = e.target.closest(".drawbar");
      if (!drawbar || drawbar.dataset.index === void 0) return;
      e.preventDefault();
      this.showContextMenu(Number(drawbar.dataset.index), e.clientX, e.clientY);
    });
    this.bindEvent(this.el, "touchstart", (e) => {
      if (e.target.closest(".drawbar-input-wrapper")) e.preventDefault();
    }, { passive: false });
    this.sliders.forEach((slider) => {
      this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));
    });
    this.bindEvent(this.el, "pointerdown", (e) => {
      if (e.button !== 0) return;
      const startWrapper = e.target.closest(".drawbar-input-wrapper");
      if (!startWrapper || !this.el.contains(startWrapper)) return;
      e.preventDefault();
      startWrapper.querySelector(DRAWBAR_SLIDER_SELECTOR)?.focus({ preventScroll: true });
      const columns = this.qAll(".drawbar-input-wrapper").map((wrapper) => ({ wrapper, slider: wrapper.querySelector(DRAWBAR_SLIDER_SELECTOR), rect: wrapper.getBoundingClientRect() })).filter((c) => c.slider && !c.slider.disabled);
      if (!columns.length) return;
      const apply = (ev) => {
        const col = this.columnAt(columns, ev.clientX);
        if (col) this.applyPointerToColumn(col, ev);
      };
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
      }
      const onMove = (ev) => apply(ev);
      let cancelPress = () => {
      };
      const end = () => {
        cancelPress();
        this.el.removeEventListener("pointermove", onMove);
        this.el.removeEventListener("pointerup", end);
        this.el.removeEventListener("pointercancel", end);
      };
      const before = columns.map((c) => c.slider.value);
      const pressIndex = Number(startWrapper.querySelector(DRAWBAR_SLIDER_SELECTOR)?.dataset.index);
      cancelPress = armLongPress(this.el, e, (px, py) => {
        end();
        this.restoreColumns(columns, before);
        if (Number.isFinite(pressIndex)) this.showContextMenu(pressIndex, px, py);
      });
      apply(e);
      this.el.addEventListener("pointermove", onMove);
      this.el.addEventListener("pointerup", end);
      this.el.addEventListener("pointercancel", end);
    });
    this.startMeterLoop();
    this.syncTrackLengths();
    if (window.ResizeObserver) {
      this._trackResizeObserver?.disconnect();
      this._trackResizeObserver = new ResizeObserver(() => this.syncTrackLengths());
      this.qAll(".drawbar-input-wrapper").forEach((wrapper) => {
        this._trackResizeObserver.observe(wrapper);
      });
    } else {
      this.bindEvent(window, "resize", () => this.syncTrackLengths());
    }
  }
  /**
   * The column under x during a strip gesture: nearest column center,
   * within one column pitch of the row (so a pointer wandering off the
   * strip's ends stops drawing rather than pinning the last column).
   */
  columnAt(columns, x) {
    let best = null;
    let bestDist = Infinity;
    for (const c of columns) {
      const d = Math.abs(x - (c.rect.left + c.rect.width / 2));
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    const pitch = columns.length > 1 ? Math.abs(columns[1].rect.left - columns[0].rect.left) : columns[0].rect.width * 2;
    return bestDist <= pitch ? best : null;
  }
  /**
   * Put a snapshot of the row's slider values back (an aborted gesture —
   * see the long press above). Routed through handleDrawbarChange so the
   * bar parameter writes through its own setter.
   */
  restoreColumns(columns, values) {
    columns.forEach((col, i) => {
      if (col.slider.value === values[i]) return;
      col.slider.value = values[i];
      this.handleDrawbarChange({ target: col.slider });
    });
  }
  /**
   * Apply a pointer position to one column's slider. Maps pointer Y to
   * the thumb CENTER's travel range [thumb/2, height - thumb/2], so
   * grabbing the handle never jumps the value.
   */
  applyPointerToColumn({ wrapper, slider }, e) {
    const rect = wrapper.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(slider).getPropertyValue("--drawbar-thumb-length")) || 32;
    const travel = Math.max(1, rect.height - thumb);
    const offset = e.clientY - rect.top - thumb / 2;
    const t = 1 - Math.max(0, Math.min(1, offset / travel));
    const param = this.barParam;
    const newValue = quantize(param, param.min + t * (param.max - param.min));
    if (String(newValue) === slider.value) return;
    slider.value = newValue;
    if (shapeMode.isGesture(e)) {
      this.shapeParamRow(Number(slider.dataset.index), param, newValue);
      slider.setAttribute("aria-valuenow", slider.value);
    } else {
      this.handleDrawbarChange({ target: slider }, e);
    }
  }
  /**
   * Publishes each column's actual rendered track length as
   * --drawbar-track-length, a CSS custom property on the wrapper
   * (inherited by its slider child) — the same JS↔CSS contract as
   * --drawbar-thumb-length, read by both the desktop and embed
   * `.drawbar-slider` rules. A rotated slider's pre-rotation width
   * becomes its visual length after the -90deg transform — CSS alone
   * can't derive that from a flex/grid-stretched wrapper's height
   * (percentages resolve against the same axis, not the transposed
   * one), so this measures post-layout instead.
   */
  syncTrackLengths() {
    this.qAll(".drawbar-input-wrapper").forEach((wrapper) => {
      wrapper.style.setProperty("--drawbar-track-length", `${wrapper.clientHeight}px`);
    });
  }
  /**
   * Live amplitude dots: per-frame peak from each voice's meter tap, with
   * a decay envelope so subaudible clicks stay visible. rAF-driven —
   * visuals freeze when the page is hidden, audio is unaffected.
   */
  startMeterLoop() {
    if (this._meterRaf) cancelAnimationFrame(this._meterRaf);
    const tick = () => {
      for (let i = 0; i < this._dots.length; i++) {
        const dot = this._dots[i];
        if (!dot) continue;
        const level = Math.max(getVoiceLevel(i), (this._dotLevels[i] || 0) * 0.88);
        this._dotLevels[i] = level;
        dot.style.opacity = 0.12 + 0.88 * Math.min(1, level * 2.5);
      }
      this._meterRaf = requestAnimationFrame(tick);
    };
    this._meterRaf = requestAnimationFrame(tick);
  }
  /**
   * A column's controls are inert while the family says the voice is
   * bypassed (convolution without an IR); its IR stepper stays live so
   * the column can be enabled.
   */
  applyEnabled(index, column = null) {
    const enabledFor = this.familyDef.enabled;
    const enabled = enabledFor ? enabledFor(index) : true;
    const col = column || this.el.querySelector(`.drawbar[data-index="${index}"]`);
    const slider = col?.querySelector(DRAWBAR_SLIDER_SELECTOR);
    if (slider) slider.disabled = !enabled;
    col?.querySelector(".drawbar-input-wrapper")?.classList.toggle("drawbar-disabled", !enabled);
    for (const dial of Object.values(this._dials[index] || {})) dial.setDisabled(!enabled);
  }
  /**
   * External updates (inspector edits, OSC/Max, bulk ops) → one column's
   * visible controls, whatever changed: the bar, every dial, the IR
   * stepper and the enabled state all re-read their parameters.
   */
  refreshColumn(index) {
    const slider = this.sliders[index];
    if (slider) {
      slider.value = this.barParam.get(index);
      this.syncFill(slider);
    }
    for (const [key, dial] of Object.entries(this._dials[index] || {})) {
      const param = this.familyDef.params.find((p) => p.key === key);
      if (param) dial.setValue(param.get(index));
    }
    this._steppers[index]?._refresh();
    this.applyEnabled(index);
  }
  setupDrawbars() {
    const numPartials = AppState.currentSystem.ratios.length;
    if (!Array.isArray(AppState.harmonicAmplitudes)) {
      AppState.harmonicAmplitudes = [];
    }
    for (let i = AppState.harmonicAmplitudes.length; i < numPartials; i++) {
      AppState.harmonicAmplitudes[i] = i === 0 ? 1 : 0;
    }
    for (let i = 0; i < numPartials; i++) {
      this.el.appendChild(this.createDrawbar(i));
    }
  }
  updateDrawbarLabels(isSubharmonic) {
    const labels = isSubharmonic && AppState.currentSystem.subharmonicLabels ? AppState.currentSystem.subharmonicLabels : AppState.currentSystem.labels;
    labels.forEach((txt, idx) => {
      const el = this.q(`#drawbar-label-${idx}`);
      this.updateContent(el, txt);
    });
  }
  createDrawbar(index) {
    const wrapper = document.createElement("div");
    wrapper.className = "drawbar";
    wrapper.dataset.index = index;
    wrapper.style.setProperty("--drawbar-color", partialColor(AppState.currentSystem.ratios[index]));
    wrapper.style.touchAction = "pan-x";
    const label = document.createElement("span");
    label.className = "drawbar-label";
    label.id = `drawbar-label-${index}`;
    this.updateContent(label, AppState.currentSystem.labels[index] || "");
    wrapper.appendChild(label);
    const param = this.barParam;
    const value = param.get(index);
    wrapper.appendChild(this.createSliderWrap(index, param, value));
    wrapper.style.setProperty("--drawbar-fill", (value - param.min) / (param.max - param.min || 1));
    const readout = document.createElement("span");
    readout.className = "drawbar-value";
    if (param.lines === 2) readout.classList.add("drawbar-value-two-line");
    this.setReadout(readout, param.format(index, value));
    wrapper.appendChild(readout);
    wrapper.appendChild(this.createAux(index));
    this.applyEnabled(index, wrapper);
    return wrapper;
  }
  createSliderWrap(index, param, value) {
    const { min, max, step } = param;
    const track = document.createElement("div");
    track.className = "drawbar-track";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "drawbar-slider";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = value;
    slider.dataset.index = index;
    slider.setAttribute("aria-label", `Overtone ${index + 1} ${param.label.toLowerCase()}`);
    const wrap = document.createElement("div");
    wrap.className = "drawbar-input-wrapper";
    wrap.append(track, slider);
    return wrap;
  }
  /**
   * Below every column: the live amplitude dot, the ADSR trigger pad,
   * the family's CHOICE stepper (the convolution's IR, the filter's
   * type), and — when the strip has the height — the family's other
   * parameters as dials.
   */
  createAux(index) {
    const aux = document.createElement("div");
    aux.className = "drawbar-aux";
    const dot = document.createElement("span");
    dot.className = "drawbar-amp";
    this._dots[index] = dot;
    aux.appendChild(dot);
    aux.appendChild(this.createTriggerPad(index));
    const choice = this.familyDef.stepper;
    if (choice) {
      const stepper = cycleStepper({
        options: choice.options,
        get: () => choice.get(index),
        set: (value, e) => {
          voiceTargets(index, e).forEach((i) => choice.set(i, value));
          this._steppers.forEach((st) => st?._refresh());
        },
        className: choice.className,
        render: (el, value) => choice.render(el, value)
      });
      this._steppers[index] = stepper;
      aux.appendChild(stepper);
    }
    const dialParams = this.dialParams;
    if (dialParams.length) {
      const dials = document.createElement("div");
      dials.className = "drawbar-aux-dials";
      this._dials[index] = {};
      for (const param of dialParams) {
        const dial = new Dial({
          min: param.min,
          max: param.max,
          step: param.step,
          value: param.get(index),
          size: 28,
          label: param.label,
          ...param.color ? { color: param.color } : {},
          format: (v) => param.format(index, v),
          fineOnShift: false,
          // shift = shaped row
          onChange: (v, e) => {
            if (shapeMode.isGesture(e)) this.shapeParamRow(index, param, v);
            else voiceTargets(index, e).forEach((i) => param.set(i, v));
          }
        });
        this._dials[index][param.key] = dial;
        dials.appendChild(dial.el);
      }
      aux.appendChild(dials);
    }
    return aux;
  }
  /**
   * Shape gesture: the gestured control's value anchors the contour;
   * every voice gets its shaped value, snapped to the parameter's step.
   */
  shapeParamRow(index, param, value) {
    shapeMode.applyParam(index, param, value, (i, v) => param.set(i, quantize(param, v)));
  }
  /**
   * ADSR trigger pad: pointer down gates the voice's envelope on
   * (attack → sustain), pointer up releases it. Pointer capture keeps the
   * release firing even when the pointer leaves the pad mid-hold.
   */
  createTriggerPad(index) {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "drawbar-trigger";
    pad.title = "hold to trigger envelope";
    pad.setAttribute("aria-label", `Trigger overtone ${index + 1} envelope`);
    const release = () => {
      pad.classList.remove("held");
      triggerHarmonicRelease(index);
    };
    pad.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
      }
      pad.classList.add("held");
      triggerHarmonicAttack(index);
      pad.addEventListener("pointerup", release, { once: true });
      pad.addEventListener("pointercancel", release, { once: true });
    });
    pad.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (isTouchContextMenu(e)) {
        e.stopPropagation();
        return;
      }
      release();
      this.showContextMenu(index, e.clientX, e.clientY);
    });
    return pad;
  }
  /** Keep the track's meter fill and the under-bar readout in sync with a slider's value. */
  syncFill(slider) {
    const param = this.barParam;
    const value = parseFloat(slider.value);
    const bar = slider.closest(".drawbar");
    if (!bar) return;
    bar.style.setProperty("--drawbar-fill", (value - param.min) / (param.max - param.min || 1));
    const readout = bar.querySelector(".drawbar-value");
    if (readout) this.setReadout(readout, param.format(Number(slider.dataset.index), value));
  }
  /**
   * Write a formatted value into a column's readout. A two-line format
   * (the cutoff's "partial\nHz") becomes two spans, told apart the way
   * the system's frequency list does it: the label muted above, the
   * frequency in full contrast below.
   */
  setReadout(el, text) {
    const [label, hz] = String(text).split("\n");
    if (hz === void 0 && !el.classList.contains("drawbar-value-two-line")) {
      el.textContent = text;
      return;
    }
    el.textContent = "";
    const top = document.createElement("span");
    top.className = "drawbar-value-label";
    top.textContent = label;
    const bottom = document.createElement("span");
    bottom.className = "drawbar-value-hz";
    bottom.textContent = hz ?? "";
    el.append(top, bottom);
  }
  /**
   * `modEvent` (the driving pointer event, when there is one) carries the
   * cmd/ctrl link modifier — held, the value lands on every voice. The
   * keyboard path passes none: cmd+arrow already means "big step" there.
   */
  handleDrawbarChange(e, modEvent) {
    const index = Number(e.target.dataset.index);
    const value = Number(e.target.value);
    const targets = modEvent ? voiceTargets(index, modEvent) : [index];
    for (const i of targets) this.barParam.set(i, value);
    e.target.setAttribute("aria-valuenow", value);
    this.syncFill(e.target);
  }
  /** The shared overtone menu, wherever it was summoned from. */
  showContextMenu(index, x, y) {
    openOvertoneMenu(index, x, y);
  }
  teardown() {
    closeOvertoneMenu();
    if (this._meterRaf) {
      cancelAnimationFrame(this._meterRaf);
      this._meterRaf = null;
    }
    if (this._trackResizeObserver) {
      this._trackResizeObserver.disconnect();
      this._trackResizeObserver = null;
    }
    super.teardown();
  }
};

// js/modules/base/BaseController.js
var BaseController = class _BaseController {
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
    _BaseController.mounted.add(this);
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
   * Coalesced update: any number of calls within one frame produce a
   * single render on the next animation frame. Use for events that can
   * arrive in floods (drawbar streams from OSC/MIDI) where re-rendering
   * per event would saturate the main thread. Audio must NOT wait on
   * this — it renders visuals only, and rAF may be throttled or stopped
   * entirely while the page is hidden (background tab, occluded jweb).
   *
   * A panel that is NOT ON SCREEN (its surface isn't showing) is not
   * rendered at all: the work is remembered and done once, when the
   * surface appears. Most controllers listen to app-wide events — a
   * fundamental sweep used to re-render every overtone of the hidden
   * Trigger pads on every step. Anything that must run while hidden
   * should call update() directly.
   */
  scheduleUpdate() {
    if (this.hidden()) {
      this._updateDeferred = true;
      return;
    }
    if (this._updatePending) return;
    this._updatePending = true;
    requestAnimationFrame(() => {
      this._updatePending = false;
      this.update();
    });
  }
  /**
   * Is the component's root off screen? Only asked on the coalesced
   * path, and only of a mounted element: `offsetParent` is null for a
   * `display:none` subtree, which is how the surface shell hides panels.
   */
  hidden() {
    const el = this.component?.el;
    return Boolean(el && !el.offsetParent && el !== document.body);
  }
  /**
   * Render now if an update was skipped while this panel was hidden.
   * The surfaces controller calls this on every surface change.
   */
  flushDeferredUpdate() {
    if (!this._updateDeferred || this.hidden()) return;
    this._updateDeferred = false;
    this.update();
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
    _BaseController.mounted.delete(this);
    if (this.component.teardown) {
      this.component.teardown();
    }
  }
};
BaseController.mounted = /* @__PURE__ */ new Set();
function flushHiddenControllers() {
  for (const controller of BaseController.mounted) controller.flushDeferredUpdate();
}

// js/modules/drawbars/drawbarsController.js
var ROOT_ID = "drawbars-control-root";
var TITLE_ID = "drawbars-title";
var PARAM_TABS_ID = "drawbars-tabs";
var NOTE_ID = "drawbars-note";
var PAGER_ID = "drawbars-pager";
var COMPACT_STRIP_HEIGHT = 420;
var DrawbarsController = class extends BaseController {
  constructor(selector) {
    super(selector);
    this.family = "gain";
    this.paramIndex = 0;
    this.compact = false;
  }
  createComponent(selector) {
    return new DrawbarsComponent(selector);
  }
  getProps() {
    return {
      isSubharmonic: AppState.isSubharmonic,
      family: this.family,
      paramIndex: this.paramIndex,
      compact: this.compact
    };
  }
  /** Switch the strip to a parameter family (its first parameter on the bars). */
  setFamily(name) {
    if (!FAMILIES[name] || name === this.family) return;
    this.family = name;
    this.paramIndex = 0;
    this.renderHeader();
    this.update();
    this.refreshNote();
  }
  setParamIndex(i) {
    if (i === this.paramIndex) return;
    this.paramIndex = i;
    this.renderHeader();
    this.update();
  }
  /**
   * Compact when the panel can't fit dials under the bars. Measured, not
   * assumed: the strip's height comes from the flex chain, and it differs
   * per surface layout, viewport and the embed band.
   */
  syncCompact() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.hidden) return;
    const compact = root.clientHeight > 0 && root.clientHeight < COMPACT_STRIP_HEIGHT;
    if (compact === this.compact) return;
    this.compact = compact;
    if (!compact) this.paramIndex = 0;
    this.renderHeader();
    this.update();
  }
  /** Both measured things the strip's own size decides. */
  syncSize() {
    this.syncCompact();
    this.syncPager();
  }
  /**
   * The ‹ › pager: shown only while the strip actually overflows (a
   * phone, mostly portrait, where columns keep a usable width instead of
   * squeezing every voice on screen). Each press scrolls one screenful.
   */
  bindPager() {
    const pager = document.getElementById(PAGER_ID);
    const strip = document.getElementById("drawbars");
    if (!pager || !strip) return;
    pager.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = Math.max(strip.clientWidth - 40, 80);
        strip.scrollBy({ left: page * Number(btn.dataset.page), behavior: "smooth" });
      });
    });
    strip.addEventListener("scroll", () => this.syncPager(), { passive: true });
  }
  /** Show/hide the pager and grey out whichever end the strip is at. */
  syncPager() {
    const pager = document.getElementById(PAGER_ID);
    const strip = document.getElementById("drawbars");
    if (!pager || !strip) return;
    const overflow = strip.scrollWidth - strip.clientWidth;
    pager.hidden = overflow <= 2;
    const prev = pager.querySelector('[data-page="-1"]');
    const next = pager.querySelector('[data-page="1"]');
    if (prev) prev.disabled = strip.scrollLeft <= 1;
    if (next) next.disabled = strip.scrollLeft >= overflow - 1;
  }
  /** Re-render, then re-measure: new columns, new scroll width. */
  update() {
    const done = super.update();
    this.syncPager();
    return done;
  }
  updateDrawbar({ index }) {
    this.component.refreshColumn(index);
  }
  reset() {
    FAMILIES[this.family].reset();
  }
  randomize() {
    FAMILIES[this.family].randomize();
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
    document.addEventListener(SHAPE_MODE_CHANGED, () => this.component.syncShapeMarker());
    document.addEventListener(SURFACE_CHANGED, () => {
      const family = SURFACES.find((s) => s.id === surfaceState.active)?.family;
      if (family) this.setFamily(family);
    });
    const initial = SURFACES.find((s) => s.id === surfaceState.active)?.family;
    if (initial) this.family = initial;
    document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
      const { index } = e.detail || {};
      if (index !== void 0) this.component.refreshColumn(index);
    });
    document.addEventListener(CONVOLUTION_IRS_CHANGED, () => {
      if (this.family === "convolution") this.update();
      this.refreshNote();
    });
    const root = document.getElementById(ROOT_ID);
    if (root && window.ResizeObserver) {
      new ResizeObserver(() => this.syncSize()).observe(root);
    }
    window.addEventListener("resize", () => this.syncSize());
    this.renderHeader();
    this.refreshNote();
  }
  /** First render: the measurements need the panel laid out. */
  init() {
    super.init();
    this.bindPager();
    this.syncSize();
  }
  /**
   * The header: the family's name and the parameter tabs (only while
   * compact).
   */
  renderHeader() {
    const title = document.getElementById(TITLE_ID);
    if (title) title.textContent = FAMILIES[this.family].label;
    const paramTabs = document.getElementById(PARAM_TABS_ID);
    if (paramTabs) {
      paramTabs.innerHTML = "";
      paramTabs.hidden = !this.compact;
      FAMILIES[this.family].params.forEach((param, i) => {
        paramTabs.appendChild(this.tab(param.label, i === this.paramIndex, () => this.setParamIndex(i)));
      });
    }
  }
  tab(text, active, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drawbars-tab" + (active ? " active" : "");
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }
  /** Hint beside the tabs: the convolution family is inert until an IR exists. */
  refreshNote() {
    const note = document.getElementById(NOTE_ID);
    if (!note) return;
    const show = this.family === "convolution" && irManager.list().length === 0;
    note.textContent = show ? "create IR to use convolution" : "";
    note.classList.toggle("hidden", !show);
  }
};

// js/modules/spectralSystem/SpectralSystemComponent.js
var RATIO_SYSTEM_SELECT_ID = "#ratio-system-select";
var SYSTEM_PARAM_DIALS = {
  stiffnessB: {
    label: "stiffness",
    // Cubic taper: real pianos live at B ≈ 0.0001–0.001, a fraction of
    // the 0–0.1 range — linear travel would bury them in the first 2%
    toValue: (t) => STIFFNESS_B_MAX * t * t * t,
    toPosition: (v) => Math.cbrt((v ?? DEFAULT_STIFFNESS_B) / STIFFNESS_B_MAX),
    format: (t) => {
      const b = STIFFNESS_B_MAX * t * t * t;
      return b < 1e-6 ? "B 0" : `B ${b.toPrecision(2)}`;
    }
  },
  tubeClosedness: {
    label: "closed end",
    // Linear — the whole open→closed sweep is equally musical
    toValue: (t) => t,
    toPosition: (v) => v ?? DEFAULT_TUBE_CLOSEDNESS,
    format: (t) => t <= 25e-4 ? "open" : t >= 0.9975 ? "closed" : `${Math.round(t * 100)}%`
  },
  stretchA: linearParamDial("stretch", STRETCH_A_MIN, STRETCH_A_MAX, DEFAULT_STRETCH_A),
  compressA: linearParamDial("compress", COMPRESS_A_MIN, COMPRESS_A_MAX, DEFAULT_COMPRESS_A)
};
function linearParamDial(label, min, max, fallback) {
  return {
    label,
    toValue: (t) => min + t * (max - min),
    toPosition: (v) => ((v ?? fallback) - min) / (max - min),
    format: (t) => `A ${(min + t * (max - min)).toFixed(2)}`
  };
}
var SpectralSystemComponent = class extends BaseComponent {
  // Store reference to the click handler for proper removal
  _subharmonicToggleHandler = null;
  constructor(elementId) {
    super(elementId);
    this.onChange = null;
    this.onSubharmonicToggle = null;
    this.onStartHarmonicChange = null;
    this.onParamChange = null;
    this._description = "";
  }
  /**
   * Main render cycle: receives fresh props from BaseController.
   */
  render({ systems, currentSystem, currentSystemIndex, isSubharmonic, startHarmonic, systemParams, voices }) {
    const selectEl = this.q("#ratio-system-select");
    if (!selectEl) return;
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
    systems.forEach((system, index) => {
      const option = document.createElement("option");
      option.textContent = system.name;
      option.value = index;
      if (index === currentSystemIndex) option.selected = true;
      selectEl.appendChild(option);
    });
    const interpolated = document.createElement("option");
    interpolated.textContent = "Interpolated";
    interpolated.value = -1;
    interpolated.disabled = true;
    interpolated.hidden = true;
    interpolated.selected = currentSystemIndex < 0;
    selectEl.appendChild(interpolated);
    this.setDescription(currentSystem?.description || "");
    this.renderDials({ currentSystem, startHarmonic, systemParams });
    this.renderFrequencies({ voices });
    this.renderSubharmonicToggle({ isSubharmonic });
  }
  updateSelector({ currentSystemIndex, currentSystem, startHarmonic, systemParams }) {
    const selectEl = this.q("#ratio-system-select");
    if (!selectEl) return;
    selectEl.value = currentSystemIndex >= 0 ? currentSystemIndex : -1;
    this.setDescription(currentSystem?.description || "");
    this.renderDials({ currentSystem, startHarmonic, systemParams });
  }
  /**
   * The overtone frequencies as one horizontal list, each entry tinted
   * like its drawbar. Entries are rebuilt only when the voice count
   * changes; a fundamental sweep just rewrites the text.
   */
  renderFrequencies({ voices }) {
    const list = this.q("#system-frequencies");
    if (!list) return;
    if (list.children.length !== voices.length) {
      list.replaceChildren(...voices.map(() => {
        const item = document.createElement("li");
        item.className = "system-frequency";
        const label = document.createElement("span");
        label.className = "system-frequency-label";
        const hz = document.createElement("span");
        hz.className = "system-frequency-hz";
        label.appendChild(document.createTextNode(""));
        hz.appendChild(document.createTextNode(""));
        item.append(label, hz);
        return item;
      }));
    }
    voices.forEach((voice, i) => {
      const item = list.children[i];
      item.style.setProperty("--partial-color", partialColor(voice.ratio));
      setText(item.children[0], voice.label);
      setText(item.children[1], voice.hz);
    });
  }
  /**
   * Start harmonic (generative systems only) and the current system's
   * tunable params (stiffness, stretch, …) as one inline row of dials
   * (each Dial carries its own caption and readout). Dial instances are
   * rebuilt only when the set of visible dials changes (system switch) —
   * external updates (bridge, reload) sync through setValue, which
   * doesn't echo, so an in-progress drag is never torn down under the
   * pointer.
   */
  renderDials({ currentSystem, startHarmonic, systemParams }) {
    const row = this.q("#system-dials-row");
    if (!row) return;
    const hasStartHarmonic = Boolean(currentSystem?.generate);
    const paramKeys = (currentSystem?.params || []).filter((k) => SYSTEM_PARAM_DIALS[k]);
    row.classList.toggle("hidden", !hasStartHarmonic && paramKeys.length === 0);
    const signature = `${hasStartHarmonic}|${paramKeys.join(",")}`;
    if (this._dialSignature !== signature) {
      this._dialSignature = signature;
      this._startHarmonicDial = null;
      this._paramDials = {};
      row.innerHTML = "";
      if (hasStartHarmonic) {
        const dial = new Dial({
          min: 1,
          max: 64,
          step: 1,
          size: 26,
          value: startHarmonic ?? 1,
          label: "start harmonic",
          format: (v) => String(Math.round(v)),
          onChange: (v) => this.onStartHarmonicChange?.(Math.round(v))
        });
        this._startHarmonicDial = dial;
        row.appendChild(dial.el);
      }
      for (const key of paramKeys) {
        const def = SYSTEM_PARAM_DIALS[key];
        const dial = new Dial({
          min: 0,
          max: 1,
          step: 5e-3,
          size: 26,
          value: def.toPosition(systemParams?.[key]),
          label: def.label,
          format: def.format,
          onChange: (t) => this.onParamChange?.(key, def.toValue(t))
        });
        this._paramDials[key] = dial;
        row.appendChild(dial.el);
      }
      return;
    }
    if (this._startHarmonicDial && this._startHarmonicDial.value !== (startHarmonic ?? 1)) {
      this._startHarmonicDial.setValue(startHarmonic ?? 1);
    }
    for (const [key, dial] of Object.entries(this._paramDials || {})) {
      const pos = SYSTEM_PARAM_DIALS[key].toPosition(systemParams?.[key]);
      if (Math.abs(pos - dial.value) > 4e-3) dial.setValue(pos);
    }
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
    this.bindInfoButton();
  }
  /** The current system's description into the disclosure block (trusted config.js HTML). */
  setDescription(html) {
    this._description = html;
    const desc = this.q("#system-description");
    if (desc) desc.innerHTML = html || "No description.";
  }
  /**
   * "?" button: click-toggles the description (#system-description),
   * which overlays the panel's body — everything under the menu — and
   * turns the button into the "×" that closes it. Click-to-toggle rather
   * than hover, since jweb/touch contexts have no reliable hover; inside
   * the panel rather than a floating popover so it can't land under a
   * finger or off-screen.
   */
  bindInfoButton() {
    const btn = this.q("#system-info-btn");
    const desc = this.q("#system-description");
    if (!btn || !desc) return;
    if (this._infoBtnHandler) {
      btn.removeEventListener("click", this._infoBtnHandler);
    }
    const sync2 = () => {
      const open = !desc.hidden;
      btn.textContent = open ? "\xD7" : "?";
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close the description" : "About this overtone system");
      btn.classList.toggle("active", open);
    };
    this._infoBtnHandler = () => {
      desc.hidden = !desc.hidden;
      sync2();
    };
    sync2();
    btn.addEventListener("click", this._infoBtnHandler);
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
    this._subharmonicToggleHandler = () => {
      this.onSubharmonicToggle?.();
    };
    subharmonicToggle.addEventListener("click", this._subharmonicToggleHandler);
  }
};
function setText(el, value) {
  const node = el.firstChild;
  if (node) {
    if (node.nodeValue !== value) node.nodeValue = value;
  } else {
    el.textContent = value;
  }
}

// js/modules/spectralSystem/spectralSystemController.js
var SpectralSystemController = class extends BaseController {
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
    const sys = AppState.currentSystem;
    const labels = AppState.isSubharmonic && sys.subharmonicLabels ? sys.subharmonicLabels : sys.labels;
    return {
      voices: sys.ratios.map((ratio, i) => ({
        ratio,
        label: labels[i] || `#${i + 1}`,
        hz: formatFrequency(calculateFrequency(ratio))
      })),
      systems: spectralSystems,
      currentSystem: AppState.currentSystem,
      currentSystemIndex: AppState.currentSystemIndex,
      startHarmonic: AppState.startHarmonic,
      systemParams: {
        stiffnessB: AppState.stiffnessB,
        tubeClosedness: AppState.tubeClosedness,
        stretchA: AppState.stretchA,
        compressA: AppState.compressA
      },
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
    this.component.onStartHarmonicChange = (startHarmonic) => {
      SpectralSystemActions.setStartHarmonic(startHarmonic);
    };
    const paramActions = {
      stiffnessB: (v) => SpectralSystemActions.setStiffnessB(v),
      tubeClosedness: (v) => SpectralSystemActions.setTubeClosedness(v),
      stretchA: (v) => SpectralSystemActions.setStretchA(v),
      compressA: (v) => SpectralSystemActions.setCompressA(v)
    };
    this.component.onParamChange = (key, value) => paramActions[key]?.(value);
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
    document.addEventListener(FUNDAMENTAL_CHANGED, () => {
      this.component.renderFrequencies(this.getProps());
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
var DEFAULT_HEIGHT = 150;
function createWaveformSketch(component) {
  return function(ctx, sk) {
    {
      const props = component.props;
      if (!props?.harmonicAmplitudes?.length) return;
      const width = sk.width;
      const height = sk.height;
      const ampScale = height * 0.4;
      drawWaveformFrame(ctx, width, height, {
        background: themeColor("--viz-bg"),
        grid: themeColor("--viz-grid")
      });
      const morph = props.waveformMorph;
      const value = (name, phase) => getWaveValue(name, phase, props.customWaveCoefficients?.[name]);
      const trace = themeColor("--viz-trace");
      ctx.lineWidth = 2;
      if (props.mode === "single" && props.sourceMode === "soundfile") {
        if (!props.sample) return;
        drawOverview(ctx, props.sample, width, height, trace);
        return;
      }
      if (props.mode === "single") {
        const ratio = props.currentSystem.ratios[0];
        const layers = morph ? [[morph.a, 1 - morph.t], [morph.b, morph.t]] : [[props.currentWaveform, 1]];
        for (const [name, share] of layers) {
          ctx.strokeStyle = withAlpha(trace, Math.round(255 * Math.max(0.08, share)) / 255);
          const wave = [];
          for (let x = 0; x < width; x++) {
            const theta = x / width * (Math.PI * 2) * 2;
            wave.push(x, height / 2 - value(name, ratio * theta) * ampScale);
          }
          strokePath(ctx, wave);
        }
        return;
      }
      ctx.strokeStyle = trace;
      const summed = [];
      {
        let fullPeriodMultiplier = 2;
        if (props.isSubharmonic) {
          const denominators = props.currentSystem.ratios.map((r, h) => props.harmonicAmplitudes[h] > 1e-3 ? Math.round(r) : null).filter(Boolean);
          if (denominators.length > 0) {
            fullPeriodMultiplier = lcmArray(denominators);
            fullPeriodMultiplier = Math.min(fullPeriodMultiplier, 32);
          }
        }
        const thetaScale = Math.PI * 2 * fullPeriodMultiplier / width;
        for (let x = 0; x < width; x++) {
          const theta = x * thetaScale;
          let sum = 0;
          let totalAmp = 0;
          for (let h = 0; h < props.harmonicAmplitudes.length; h++) {
            const amp = props.harmonicAmplitudes[h] || 0;
            if (amp > 1e-3 && props.currentSystem.ratios[h] > 0) {
              const ratio = props.currentSystem.ratios[h];
              const harmonicPhase = props.isSubharmonic ? theta / ratio : ratio * theta;
              const wave = morph ? value(morph.a, harmonicPhase) * (1 - morph.t) + value(morph.b, harmonicPhase) * morph.t : value(props.currentWaveform, harmonicPhase);
              sum += wave * amp;
              totalAmp += amp;
            }
          }
          const y = height / 2 - sum / (totalAmp || 1) * ampScale;
          summed.push(x, y);
        }
      }
      strokePath(ctx, summed);
    }
  };
}
var WaveformComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this._sketch = null;
    this.props = {};
  }
  /**
   * Render waveform with new props
   * @param {object} props - Includes currentWaveform, harmonicAmplitudes, currentSystem
   */
  render(props) {
    this.props = props;
    if (!this._sketch) {
      this._sketch = new Sketch(this.el, {
        draw: createWaveformSketch(this),
        loop: false,
        // repainted on demand, not animated
        fallbackSize: DEFAULT_HEIGHT
      });
    } else {
      this._sketch.redraw();
    }
  }
  /**
   * Unbind tracked events; the sketch survives updates.
   */
  teardown() {
    super.teardown?.();
  }
  /**
   * Full cleanup — only for actually discarding the component.
   */
  destroy() {
    this._sketch?.destroy();
    this._sketch = null;
    this.teardown();
  }
};

// js/modules/waveform/waveformController.js
var WaveformController = class extends BaseController {
  constructor(selector, options = {}) {
    super(selector);
    this.mode = options.mode || "sum";
  }
  createComponent(selector) {
    return new WaveformComponent(selector);
  }
  getProps() {
    const { harmonicAmplitudes, currentSystem, currentWaveform, waveformMorph, customWaveCoefficients, isSubharmonic, sourceMode } = AppState;
    return {
      harmonicAmplitudes,
      currentSystem,
      currentWaveform,
      waveformMorph,
      sourceMode,
      // The Source preview shows the loaded sound file in that mode
      sample: sourceManager.fileOverview,
      customWaveCoefficients,
      isSubharmonic,
      mode: this.mode
    };
  }
  bindExternalEvents() {
    document.addEventListener(DRAWBARS_RESET, () => this.scheduleUpdate());
    document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(SUBHARMONIC_TOGGLED, () => this.scheduleUpdate());
    document.addEventListener(DRAWBAR_CHANGE, () => this.scheduleUpdate());
    document.addEventListener(DRAWBARS_RANDOMIZED, () => this.scheduleUpdate());
    document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(PRESETS_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(SOURCE_CHANGED, () => this.scheduleUpdate());
  }
};

// js/modules/downloadControl/DownloadControlComponent.js
var DownloadControlComponent = class extends BaseComponent {
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

// js/modules/downloadControl/downloadControlActions.js
var DownloadControlActions = {
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

// js/modules/convolution/convolutionActions.js
var ConvolutionActions = {
  /**
   * Bake the current timbre into a convolution IR: the same snapped
   * single-cycle render as the wavetable bake, resampled to real time at
   * the current fundamental (the buffer spans periodMultiplier periods of
   * f0), so the IR's resonances sit exactly on the sounding partials.
   * The new IR joins the per-overtone menus and is assigned to every
   * overtone (each can then pick its own).
   */
  async createIRFromCurrent() {
    const { buffer, periodMultiplier } = await sampleCurrentWaveform("mono", AppState.isSubharmonic);
    if (!buffer || buffer.length === 0) {
      showStatus("Nothing to capture \u2014 no active drawbars.", "warning");
      return;
    }
    const ctx = audioEngine.context;
    const f0 = AppState.fundamentalFrequency;
    const loopSeconds = periodMultiplier / f0;
    const loopLength = Math.max(32, Math.round(loopSeconds * ctx.sampleRate));
    const ring = AppState.irRingSeconds;
    const loops = ring > 0 ? Math.max(1, Math.ceil(ring * ctx.sampleRate / loopLength)) : 1;
    const length = loopLength * loops;
    const decayPerSample = ring > 0 ? Math.log(1e3) / (ring * ctx.sampleRate) : 0;
    const audioBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = audioBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const pos = i % loopLength / loopLength * buffer.length;
      const i0 = Math.floor(pos);
      const i1 = (i0 + 1) % buffer.length;
      const frac = pos - i0;
      const sample = buffer[i0] * (1 - frac) + buffer[i1] * frac;
      data[i] = decayPerSample ? sample * Math.exp(-decayPerSample * i) : sample;
    }
    const parts = generateFilenameParts();
    const ringTag = ring > 0 ? `-ring${ring.toFixed(1)}s` : "";
    const name = `${parts.noteLetter}-${parts.systemName}-${parts.levels}${ringTag}`;
    const key = await saveIR({ buffer: audioBuffer, name, bakeFrequency: f0 });
    irManager.add(audioBuffer, name, f0, key);
    document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
    document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
    const count = AppState.currentSystem.ratios.length;
    for (let i = 0; i < count; i++) {
      OvertoneSignalActions.setConvolution(i, { ir: key });
    }
    showStatus(`Created IR: ${name}`, "success");
  },
  /** Ring time for subsequent Create IR bakes (0..IR_RING_MAX_SECONDS). */
  setRingSeconds(value) {
    const v = Number(value);
    if (!isFinite(v)) return;
    const irRingSeconds = Math.max(0, Math.min(IR_RING_MAX_SECONDS, v));
    if (irRingSeconds === AppState.irRingSeconds) return;
    updateAppState({ irRingSeconds });
    document.dispatchEvent(new CustomEvent(IR_RING_CHANGED));
  },
  /** Select one overtone's IR by key, or by creation index (bridge form). */
  selectIR(index, selector) {
    const key = typeof selector === "number" ? irManager.keyAt(Math.round(selector)) : selector || null;
    if (key !== null && !irManager.has(key)) return;
    OvertoneSignalActions.setConvolution(index, { ir: key });
  }
};

// js/modules/downloadControl/downloadControlController.js
var DownloadControlController = class extends BaseController {
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
      handleAddToWaveforms(this.getProps().isSubharmonic);
    };
    document.getElementById("create-ir-button")?.addEventListener("click", () => {
      ConvolutionActions.createIRFromCurrent();
    });
    const manage = document.getElementById("manage-ir-button");
    if (manage) {
      manage.addEventListener("click", () => openSettings("files"));
      const syncManage = () => {
        manage.hidden = irManager.list().length === 0;
      };
      document.addEventListener(CONVOLUTION_IRS_CHANGED, syncManage);
      document.addEventListener(LIBRARY_CHANGED, syncManage);
      syncManage();
    }
    const ringRoot = document.getElementById("ir-ring-root");
    if (ringRoot) {
      this._ringDial = new Dial({
        min: 0,
        max: IR_RING_MAX_SECONDS,
        step: 0.1,
        value: AppState.irRingSeconds,
        size: 22,
        label: "ring",
        format: (v) => v === 0 ? "one loop" : `ring ${v.toFixed(1)}s`,
        onChange: (v) => ConvolutionActions.setRingSeconds(v)
      });
      ringRoot.appendChild(this._ringDial.el);
      document.addEventListener(IR_RING_CHANGED, () => this._ringDial.setValue(AppState.irRingSeconds));
    }
  }
  bindExternalEvents() {
    document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());
    const applySourceGating = () => {
      const external = AppState.sourceMode !== "oscillators";
      for (const id of ["wavetable-actions", "ir-actions"]) {
        const row = document.getElementById(id);
        if (!row) continue;
        row.classList.toggle("is-disabled", external);
        row.title = external ? "Available with the Oscillators source" : "";
        for (const control of row.querySelectorAll("button:not(.files-link), select")) {
          control.disabled = external;
        }
      }
    };
    document.addEventListener(SOURCE_CHANGED, applySourceGating);
    applySourceGating();
  }
};

// js/modules/generic/slider/SliderComponent.js
var SliderComponent = class extends BaseComponent {
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
      this.labelEl.className = "slider-label";
      this.el.appendChild(this.labelEl);
    }
    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.min = props.min ?? 0;
    this.input.max = props.max ?? 1;
    this.input.step = props.step ?? 0.01;
    this.input.value = props.value ?? 0;
    this.input.className = "slider-input";
    if (props.label) this.input.setAttribute("aria-label", props.ariaLabel || props.label);
    this.el.appendChild(this.input);
    this.valueDisplay = document.createElement("span");
    this.valueDisplay.className = "slider-value";
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

// js/modules/generic/slider/sliderActions.js
var SliderActions = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

// js/modules/generic/slider/sliderController.js
var SliderController = class {
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

// js/modules/tonewheel/TonewheelComponent.js
var TonewheelComponent = class extends BaseComponent {
  constructor(selector) {
    super(selector);
    this.canvasId = "tonewheel-canvas";
  }
  render(props) {
    const container = this.el;
    if (!container) return;
    this._sketch?.destroy();
    this._sketch = null;
    container.querySelector(`#${this.canvasId}`)?.remove();
    const box = document.createElement("div");
    box.id = this.canvasId;
    container.appendChild(box);
    this._sketch = props?.createSketch?.() ?? null;
  }
  teardown() {
    this._sketch?.destroy();
    this._sketch = null;
    this.el.querySelector(`#${this.canvasId}`)?.remove();
    super.teardown?.();
  }
};

// js/modules/tonewheel/tonewheelController.js
var spreadSliderController;
var vizFreqSliderController;
var TonewheelController = class extends BaseController {
  init() {
    super.init();
    spreadSliderController = new SliderController("#spread-slider-root", {
      min: 0,
      max: 1,
      step: 0.01,
      value: AppState.spreadFactor ?? 0.2,
      label: "Gain",
      // The caption reads "Gain" beside the wheel, but the navbar's
      // master gain says the same word: spoken aloud they must differ
      ariaLabel: "Tonewheel ring spread",
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
      ariaLabel: "Tonewheel rotation rate",
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
    return { createSketch: () => TonewheelActions.initVisualization() };
  }
  bindComponentEvents() {
  }
  bindExternalEvents() {
    const vizControls = document.getElementById("tonewheel-viz-controls");
    if (!vizControls) return;
    let fadeTimeout;
    const show = () => {
      vizControls.classList.add("visible");
      clearTimeout(fadeTimeout);
      fadeTimeout = setTimeout(hide, 3e3);
    };
    const hide = () => {
      vizControls.classList.remove("visible");
    };
    ["mouseenter", "mousemove", "touchstart"].forEach((evt) => {
      this.component.el.addEventListener(evt, show);
      vizControls.addEventListener(evt, show);
    });
    this.component.el.addEventListener("mouseleave", hide);
    vizControls.addEventListener("mouseleave", hide);
  }
};

// js/modules/fundamental/FundamentalComponent.js
var notes = [
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
var FundamentalComponent = class extends BaseComponent {
  render() {
    const keyboard = document.getElementById("piano-keyboard");
    if (!keyboard) return;
    keyboard.innerHTML = "";
    this.keys = [];
    notes.forEach((note) => {
      const key = document.createElement("div");
      key.className = `key ${note.class}`;
      key.textContent = note.name;
      key.dataset.noteIndex = note.index;
      this.keys.push(key);
      keyboard.appendChild(key);
    });
  }
  bindRenderedEvents() {
    const fundamentalInput = document.getElementById("fundamental-input");
    if (fundamentalInput) {
      this.bindEvent(fundamentalInput, "change", (e) => {
        this.onChangeInput?.(e.target.value);
      });
    }
    this.keys.forEach((key) => {
      const idx = key.dataset.noteIndex = parseInt(key.dataset.noteIndex);
      this.bindEvent(key, "click", () => {
        this.onClickKey(idx);
      });
    });
    const octaveDown = document.getElementById("octave-down");
    this.bindEvent(octaveDown, "click", () => {
      this.onOctaveDown();
    });
    const octaveUp = document.getElementById("octave-up");
    this.bindEvent(octaveUp, "click", () => {
      this.onOctaveUp();
    });
  }
};

// js/modules/fundamental/fundamentalController.js
var FundamentalController = class extends BaseController {
  createComponent(selector) {
    return new FundamentalComponent(selector);
  }
  getProps() {
    return {};
  }
  bindComponentEvents() {
    this.component.onOctaveUp = () => {
      FundamentalActions.changeOctave(1);
    };
    this.component.onOctaveDown = () => {
      FundamentalActions.changeOctave(-1);
    };
    this.component.onClickKey = (index) => {
      FundamentalActions.setFundamentalByNoteIndex(index);
    };
    this.component.onChangeInput = (value) => {
      FundamentalActions.handleFundamentalChange(value);
    };
  }
  bindExternalEvents() {
    document.addEventListener(FUNDAMENTAL_CHANGED, () => {
      FundamentalActions.updateFundamentalDisplay();
      FundamentalActions.updateKeyboardUI();
      updateAudioProperties();
    });
  }
};

// js/modules/playToggle/PlayToggleComponent.js
var PlayToggleComponent = class extends BaseComponent {
  render({ isPlaying } = {}) {
    const label = this.q("#play-label");
    const toggle = this.q("#play-toggle");
    if (label) label.textContent = isPlaying ? "Playing" : "Stopped";
    if (toggle) {
      toggle.classList.toggle("active", isPlaying);
      toggle.setAttribute("aria-checked", String(isPlaying));
    }
  }
  bindRenderedEvents() {
    const toggle = this.q("#play-toggle");
    this.bindEvent(toggle, "click", () => this.onToggle?.());
  }
};

// js/modules/playToggle/playToggleController.js
var PlayToggleController = class extends BaseController {
  createComponent(selector) {
    return new PlayToggleComponent(selector);
  }
  getProps() {
    return { isPlaying: AppState.isPlaying };
  }
  bindComponentEvents() {
    this.component.onToggle = () => PlayToggleActions.toggle();
  }
  bindExternalEvents() {
    document.addEventListener(PLAY_STATE_CHANGED, () => this.update());
  }
};

// js/modules/waveformSelector/WaveformSelectorComponent.js
var WaveformSelectorComponent = class extends BaseComponent {
  /** `morphing`: a preset crossfade is between two waveforms — the menu shows "Interpolated". */
  render({ currentWaveform, morphing = false } = {}) {
    if (currentWaveform !== void 0) {
      this.el.value = morphing ? "" : currentWaveform;
    }
  }
  bindRenderedEvents() {
    this.bindEvent(this.el, "change", (e) => this.onChange?.(e));
  }
};

// js/modules/waveformSelector/waveformSelectorController.js
var WaveformSelectorController = class extends BaseController {
  createComponent(selector) {
    return new WaveformSelectorComponent(selector);
  }
  getProps() {
    return { currentWaveform: AppState.currentWaveform, morphing: Boolean(AppState.waveformMorph) };
  }
  bindComponentEvents() {
    this.component.onChange = (e) => handleWaveformChange(e);
  }
  bindExternalEvents() {
    document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.update());
  }
};

// js/modules/osc/oscClient.js
var COMMANDS = /* @__PURE__ */ new Set([
  "drawbar",
  "drawbars",
  "gain",
  "slew",
  "note",
  "freq",
  "system",
  "startharmonic",
  "stiffness",
  "closedness",
  "stretch",
  "compress",
  "waveform",
  "source",
  "adcin",
  "adcchannel",
  "sfloop",
  "sffund",
  "sfrange",
  "subharmonic",
  "play",
  "reset",
  "randomize",
  "setdrawbarfundamental",
  "gate",
  "filter",
  "res",
  "ftype",
  "drive",
  "pan",
  "conv",
  "convir",
  "irring",
  "pulsemidi",
  "pulseosc",
  "pulseoffset",
  "midiclock",
  "seqshape",
  "seqgain",
  "seqfreq",
  "seqres",
  "seqwet",
  "seqfb",
  "seqstretch",
  "adsr",
  "envmode",
  "midiout"
]);
var TRANSIENT_COMMANDS = /* @__PURE__ */ new Set(["reset", "randomize", "setdrawbarfundamental"]);
var SEQ_AMOUNT_TARGETS = { seqgain: "gain", seqfreq: "freq", seqres: "res", seqwet: "wet", seqfb: "fb" };
function gateMode(value) {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const id = Math.round(Number(value));
    return PATTERNS.some((p) => p.id === id) ? id : void 0;
  }
  return patternIdFromName(value);
}
function parseGateSeq(parts) {
  if (parts.length === 1 && typeof parts[0] === "string") {
    return parts[0].split("").filter((c) => c === "0" || c === "1").map(Number);
  }
  return parts.map((v) => Number(v) > 0.5 ? 1 : 0);
}
var RETRY_MIN_MS = 1e3;
var RETRY_MAX_MS = 15e3;
var OscClient = class {
  constructor() {
    this.instance = new URLSearchParams(window.location.search).get("instance");
    this.ws = null;
    this.retryDelay = RETRY_MIN_MS;
    this._applyingInbound = false;
    this._pendingInboundPlay = null;
    this._closed = false;
  }
  /**
   * Fetch the bridge's cached state (pushed by the Max patch, possibly
   * long before this page existed) and apply it to AppState. Called
   * BEFORE the UI initializes, so the first render already shows Live's
   * parameter values — no flash of defaults. No-op without a bridge.
   */
  async bootstrap() {
    let entries;
    try {
      const res = await fetch("/state", { cache: "no-store" });
      if (!res.ok) return;
      this.checkServerFreshness(res.headers.get("x-twig-commands"));
      entries = await res.json();
    } catch {
      return;
    }
    for (const msg of entries) {
      try {
        this.route(msg);
      } catch (err) {
        console.error("[osc] bootstrap failed to apply", msg.address, err);
      }
    }
  }
  /**
   * The running bridge process caches only commands in ITS whitelist —
   * a server started before a new param was added silently drops it, and
   * the param mysteriously "doesn't persist". The server advertises its
   * list in an x-twig-commands header; warn loudly when it's missing
   * something this client can emit. (Servers predating the header send
   * none — nothing to check.)
   */
  checkServerFreshness(header) {
    if (!header) return;
    const known = new Set(header.split(","));
    const missing = [...COMMANDS].filter((c) => !TRANSIENT_COMMANDS.has(c) && !known.has(c));
    if (missing.length) {
      const msg = `bridge server is stale \u2014 restart it to persist: ${missing.join(", ")}`;
      console.warn(`[osc] ${msg}`);
      showStatus(msg, "warning");
    }
  }
  init() {
    this.connect();
    this.bindUpstreamEvents();
  }
  connect() {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    try {
      this.ws = new WebSocket(`${proto}://${window.location.host}/osc`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.retryDelay = RETRY_MIN_MS;
      console.log(`[osc] connected${this.instance ? ` as instance ${this.instance}` : ""}`);
    };
    this.ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.route(msg);
    };
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => {
    };
  }
  scheduleReconnect() {
    if (this._closed) return;
    setTimeout(() => this.connect(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
  }
  close() {
    this._closed = true;
    this.ws?.close();
  }
  // ---------------------------------------------------------------
  // Inbound: OSC → app state
  // ---------------------------------------------------------------
  route({ address, args = [] }) {
    if (typeof address !== "string") return;
    const parts = address.split("/").filter(Boolean);
    if (parts[0] !== "twig") return;
    let rest = parts.slice(1);
    if (rest.length && !COMMANDS.has(rest[0])) {
      const target = rest[0];
      rest = rest.slice(1);
      if (target !== String(this.instance ?? "")) return;
    }
    const [command, sub] = rest;
    if (!COMMANDS.has(command)) return;
    this._applyingInbound = true;
    try {
      this.apply(command, sub, args);
    } catch (err) {
      console.error(`[osc] failed to apply ${address}:`, err);
    } finally {
      this._applyingInbound = false;
    }
  }
  apply(command, sub, args) {
    switch (command) {
      case "drawbar": {
        const n = sub !== void 0 ? parseInt(sub, 10) : Math.round(args[0]);
        const value = sub !== void 0 ? args[0] : args[1];
        if (n >= 1 && typeof value === "number") {
          DrawbarsActions.setDrawbar(n - 1, clamp01(value));
        }
        break;
      }
      case "drawbars":
        args.forEach((v, i) => {
          if (typeof v === "number") DrawbarsActions.setDrawbar(i, clamp01(v));
        });
        break;
      case "gain":
        this.setSlider(
          "#master-gain-slider-root",
          clamp01(args[0]),
          () => smoothUpdateMasterGain(clamp01(args[0]))
        );
        break;
      case "slew":
        this.setSlider(
          "#master-slew-slider-root",
          Math.max(0, args[0] || 0),
          () => updateAppState({ masterSlewValue: Math.max(0, args[0] || 0) })
        );
        break;
      case "note":
        FundamentalActions.setFundamentalByMidi(Math.round(args[0]));
        break;
      case "freq":
        FundamentalActions.setFundamentalExact(args[0]);
        break;
      case "system":
        SpectralSystemActions.setSystem(Math.round(args[0]));
        break;
      case "startharmonic":
        SpectralSystemActions.setStartHarmonic(Math.round(args[0]));
        break;
      case "stiffness":
        SpectralSystemActions.setStiffnessB(args[0]);
        break;
      case "closedness":
        SpectralSystemActions.setTubeClosedness(args[0]);
        break;
      case "stretch":
        SpectralSystemActions.setStretchA(args[0]);
        break;
      case "compress":
        SpectralSystemActions.setCompressA(args[0]);
        break;
      case "source":
        SourceActions.setSourceMode(typeof args[0] === "number" ? Math.round(args[0]) : args[0]);
        break;
      case "adcin":
        SourceActions.setAdcDevice(args[0]);
        break;
      case "adcchannel":
        SourceActions.setAdcChannel(args[0]);
        break;
      case "sfloop":
        SourceActions.setSoundfileLoop(Boolean(Number(args[0])));
        break;
      case "sffund":
        SourceActions.setSoundfileFundamental(Number(args[0]));
        break;
      case "sfrange":
        SourceActions.setSoundfileRange(args.length >= 2 ? [Number(args[0]), Number(args[1])] : null);
        break;
      case "waveform": {
        const options = waveformMenuNames();
        let name = null;
        if (typeof args[0] === "string" && options.includes(args[0])) {
          name = args[0];
        } else if (typeof args[0] === "number") {
          name = options[Math.round(args[0])] ?? null;
        }
        if (name !== null && name !== AppState.currentWaveform) {
          setCurrentWaveform(name);
        }
        break;
      }
      case "subharmonic":
        if (Boolean(args[0]) !== AppState.isSubharmonic) {
          SpectralSystemActions.toggleSubharmonic();
        }
        break;
      case "play":
        if (Boolean(args[0]) !== AppState.isPlaying) {
          this._pendingInboundPlay = Boolean(args[0]);
          PlayToggleActions.toggle();
        }
        break;
      case "gate": {
        const [n, rest] = perVoiceArgs(sub, args);
        const mode = gateMode(rest[0]);
        if (n === null || mode === void 0) break;
        const config = mode === 4 ? { mode, seq: parseGateSeq(rest.slice(1)) } : {
          mode,
          x: Math.max(0, Number(rest[1]) || 0),
          y: Math.max(0, Number(rest[2]) || 0)
        };
        this.forVoices(n, (i) => OvertoneSignalActions.setGate(i, { ...config }));
        break;
      }
      case "filter": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const multiplier = Math.round(Number(rest[0]));
        const q = rest[1] !== void 0 ? Math.min(Q_MAX, Math.max(1e-4, Number(rest[1]))) : void 0;
        this.forVoices(n, (i) => OvertoneSignalActions.setFilter(i, {
          ...OvertoneSignalActions.getFilter(i),
          multiplier: multiplier > 0 ? multiplier : 0,
          ...q !== void 0 ? { q } : {}
        }));
        break;
      }
      case "res": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const q = Math.min(Q_MAX, Math.max(1e-4, Number(rest[0]) || 1e-4));
        this.forVoices(n, (i) => OvertoneSignalActions.setFilter(i, {
          ...OvertoneSignalActions.getFilter(i),
          q
        }));
        break;
      }
      case "ftype": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const raw = rest[0];
        const type = typeof raw === "number" || /^\d+$/.test(String(raw)) ? FILTER_TYPES[Math.round(Number(raw))] : String(raw).toLowerCase();
        if (!FILTER_TYPES.includes(type)) break;
        this.forVoices(n, (i) => OvertoneSignalActions.setFilter(i, {
          ...OvertoneSignalActions.getFilter(i),
          type
        }));
        break;
      }
      case "drive": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const v = Math.max(0, Math.min(DRIVE_MAX, Number(rest[0]) || 0));
        this.forVoices(n, (i) => OvertoneSignalActions.setDrive(i, v));
        break;
      }
      case "conv": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const patch = { wet: Number(rest[0]) };
        if (rest[1] !== void 0) patch.feedback = Number(rest[1]);
        if (rest[2] !== void 0) patch.gain = Number(rest[2]);
        if (rest[3] !== void 0) patch.tune = Number(rest[3]);
        this.forVoices(n, (i) => OvertoneSignalActions.setConvolution(i, patch));
        break;
      }
      case "irring":
        ConvolutionActions.setRingSeconds(args[0]);
        break;
      case "convir": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const i = Math.round(Number(rest[0]));
        this.forVoices(n, (v) => ConvolutionActions.selectIR(v, i < 0 ? null : i));
        break;
      }
      case "pan": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const v = Math.max(-1, Math.min(1, Number(rest[0]) || 0));
        this.forVoices(n, (i) => OvertoneSignalActions.setPan(i, v));
        break;
      }
      case "seqshape": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const options = waveformMenuNames();
        let name = null;
        if (typeof rest[0] === "string" && options.includes(rest[0])) {
          name = rest[0];
        } else if (typeof rest[0] === "number") {
          name = options[Math.round(rest[0])] ?? null;
        }
        if (name === null) break;
        this.forVoices(n, (i) => OvertoneSignalActions.setSequencerShape(i, name));
        break;
      }
      case "seqstretch": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        this.forVoices(n, (i) => OvertoneSignalActions.setSequencerStretch(i, Number(rest[0]) || 1));
        break;
      }
      case "seqgain":
      case "seqfreq":
      case "seqres":
      case "seqwet":
      case "seqfb": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const target = SEQ_AMOUNT_TARGETS[command];
        this.forVoices(n, (i) => OvertoneSignalActions.setSequencerAmount(i, target, Number(rest[0]) || 0));
        break;
      }
      case "adsr": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest.length < 4) break;
        const [a, d, s, r] = rest.map(Number);
        this.forVoices(n, (i) => OvertoneSignalActions.setEnvelope(i, { a, d, s, r }));
        break;
      }
      case "envmode":
        OvertoneSignalActions.setEnvelopeMode(Number(args[0]) ? "adsr" : "open");
        break;
      case "midiout":
        updateMidiOutputPort(
          typeof args[0] === "number" && args.length === 1 ? args[0] : args.join(" ").trim()
        );
        break;
      case "pulsemidi":
      case "pulseosc":
      case "pulseoffset": {
        const [n, rest] = perVoiceArgs(sub, args);
        if (n === null || rest[0] === void 0) break;
        const key = { pulsemidi: "midi", pulseosc: "osc", pulseoffset: "offset" }[command];
        const flag = { [key]: Boolean(Number(rest[0])) };
        this.forVoices(n, (i) => {
          AppState.oscillatorPulseOuts[i] = { ...OvertoneSignalActions.getPulseOut(i), ...flag };
          updateHarmonicPulse(i);
        });
        break;
      }
      case "midiclock": {
        const n = Math.round(args[0]);
        if (!Number.isFinite(n)) break;
        const previous = AppState.midiClockVoice;
        AppState.midiClockVoice = n >= 1 ? n - 1 : null;
        if (previous !== null) updateHarmonicPulse(previous);
        if (AppState.midiClockVoice !== null) updateHarmonicPulse(AppState.midiClockVoice);
        break;
      }
      case "setdrawbarfundamental": {
        const n = Math.round(args[0]);
        if (n >= 1) DrawbarsActions.setDrawbarAsFundamental(n - 1);
        break;
      }
      case "reset":
        DrawbarsActions.reset();
        break;
      case "randomize":
        DrawbarsActions.randomize();
        break;
    }
  }
  /** True while the bridge socket is open (drives modal availability labels). */
  isConnected() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }
  /**
   * Relay a voice pulse upstream: /twig/pulse/<n> [cycle, gateOn, velocity].
   * Velocity (0-127) tracks the overtone's drawbar gain, so the patch can
   * feed it straight into [noteout]. Not part of the cached state —
   * pulses are events, not settings.
   */
  emitPulse(index, pulse) {
    const amp = AppState.harmonicAmplitudes[index] || 0;
    const velocity = amp <= 1e-3 ? 0 : Math.max(1, Math.round(amp * 127));
    this.emit(`pulse/${index + 1}`, [pulse.cycle, pulse.gateOn ? 1 : 0, velocity]);
  }
  /**
   * Run `fn` for the voice(s) a 1-based selector addresses: n = 0 → every
   * partial of the current system; otherwise the one partial, silently
   * ignored when out of range.
   */
  forVoices(n, fn) {
    const count = AppState.currentSystem.ratios.length;
    if (n === 0) {
      for (let i = 0; i < count; i++) fn(i);
    } else if (n >= 1 && n <= count) {
      fn(n - 1);
    }
  }
  /**
   * Set a navbar slider by dispatching a real input event, so its display
   * text, state, and audio all update through the one existing handler.
   * Falls back to direct state mutation if the slider isn't rendered yet.
   */
  setSlider(rootSelector, value, fallback) {
    const input = document.querySelector(`${rootSelector} input[type="range"]`);
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      fallback();
    }
  }
  // ---------------------------------------------------------------
  // Upstream: app state → Max (Live preset params)
  // ---------------------------------------------------------------
  bindUpstreamEvents() {
    document.addEventListener(DRAWBAR_CHANGE, (e) => {
      const { index, value } = e.detail || {};
      if (index !== void 0) this.emit(`drawbar/${index + 1}`, [value]);
    });
    document.addEventListener(SPECTRAL_SYSTEM_CHANGED, (e) => {
      const { index } = e.detail || {};
      if (index !== void 0) this.emit("system", [index]);
      this.emit("startharmonic", [AppState.startHarmonic]);
      this.emit("stiffness", [AppState.stiffnessB]);
      this.emit("closedness", [AppState.tubeClosedness]);
      this.emit("stretch", [AppState.stretchA]);
      this.emit("compress", [AppState.compressA]);
      this.emit("drawbars", [...AppState.harmonicAmplitudes]);
    });
    document.addEventListener(IR_RING_CHANGED, () => {
      this.emit("irring", [AppState.irRingSeconds]);
    });
    document.addEventListener(SOURCE_CHANGED, () => {
      this.emit("source", [SOURCE_MODES.indexOf(AppState.sourceMode)]);
      this.emit("adcin", [AppState.adcDeviceId ?? ""]);
      this.emit("adcchannel", [AppState.adcChannel]);
      this.emit("sfloop", [AppState.soundfileLoop ? 1 : 0]);
      this.emit("sffund", [AppState.soundfileFundamental ?? 0]);
      this.emit("sfrange", AppState.soundfileRange ?? [0, 1]);
    });
    document.addEventListener(DRAWBARS_RESET, () => {
      this.emit("drawbars", [...AppState.harmonicAmplitudes]);
    });
    document.addEventListener(DRAWBARS_RANDOMIZED, () => {
      this.emit("drawbars", [...AppState.harmonicAmplitudes]);
    });
    document.addEventListener(MASTER_GAIN_CHANGED, () => {
      this.emit("gain", [AppState.masterGainValue]);
    });
    document.addEventListener(MASTER_SLEW_CHANGED, () => {
      this.emit("slew", [AppState.masterSlewValue]);
    });
    document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
      const { index, kind } = e.detail || {};
      if (index === void 0) return;
      const n = index + 1;
      if (kind === "seq") {
        const seq = OvertoneSignalActions.getSequencer(index);
        this.emit(`seqshape/${n}`, [seq.shape]);
        this.emit(`seqstretch/${n}`, [seq.stretch]);
        this.emit(`seqgain/${n}`, [seq.amounts.gain]);
        this.emit(`seqfreq/${n}`, [seq.amounts.freq]);
        this.emit(`seqres/${n}`, [seq.amounts.res]);
        this.emit(`seqwet/${n}`, [seq.amounts.wet]);
        this.emit(`seqfb/${n}`, [seq.amounts.fb]);
      } else if (kind === "pulse") {
        const out = AppState.oscillatorPulseOuts[index] || {};
        this.emit(`pulsemidi/${n}`, [out.midi ? 1 : 0]);
        this.emit(`pulseosc/${n}`, [out.osc ? 1 : 0]);
        this.emit(`pulseoffset/${n}`, [out.offset ? 1 : 0]);
      } else if (kind === "clock") {
        this.emit("midiclock", [AppState.midiClockVoice === null ? 0 : AppState.midiClockVoice + 1]);
      } else if (kind === "gate") {
        const g = AppState.oscillatorGates[index] || { mode: 0 };
        this.emit(`gate/${n}`, g.mode === 4 ? [4, (g.seq || []).join("")] : [g.mode ?? 0, g.x ?? 1, g.y ?? 1]);
      } else if (kind === "filter") {
        const f = AppState.oscillatorFilters[index] || {};
        this.emit(`filter/${n}`, [f.multiplier ?? 0]);
        this.emit(`res/${n}`, [f.q ?? 0.707]);
        this.emit(`ftype/${n}`, [Math.max(0, FILTER_TYPES.indexOf(f.type ?? DEFAULT_FILTER_TYPE))]);
      } else if (kind === "drive") {
        this.emit(`drive/${n}`, [OvertoneSignalActions.getDrive(index)]);
      } else if (kind === "conv") {
        const c = OvertoneSignalActions.getConvolution(index);
        this.emit(`conv/${n}`, [c.wet, c.feedback, c.gain, c.tune]);
        this.emit(`convir/${n}`, [irManager.indexOf(c.ir)]);
      } else if (kind === "envelope") {
        const env = OvertoneSignalActions.getEnvelope(index);
        this.emit(`adsr/${n}`, [env.a, env.d, env.s, env.r]);
      } else if (kind === "pan") {
        this.emit(`pan/${n}`, [getVoicePan(index)]);
      }
    });
    document.addEventListener(PLAY_STATE_CHANGED, () => {
      if (this._pendingInboundPlay === AppState.isPlaying) {
        this._pendingInboundPlay = null;
        return;
      }
      this.emit("play", [AppState.isPlaying ? 1 : 0]);
    });
    document.addEventListener(SUBHARMONIC_TOGGLED, () => {
      this.emit("subharmonic", [AppState.isSubharmonic ? 1 : 0]);
    });
    document.addEventListener(ENVELOPE_MODE_CHANGED, () => {
      this.emit("envmode", [AppState.envelopeMode === "adsr" ? 1 : 0]);
    });
    document.addEventListener(MIDI_OUTPUT_CHANGED, () => {
      this.emit("midiout", [midiConfig.outputId || ""]);
    });
    document.addEventListener(FUNDAMENTAL_CHANGED, () => {
      this.emit("note", [AppState.currentMidiNote]);
      this.emit("freq", [AppState.fundamentalFrequency]);
    });
    document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => {
      const index = waveformMenuNames().indexOf(AppState.currentWaveform);
      this.emit("waveform", index >= 0 ? [index, AppState.currentWaveform] : [AppState.currentWaveform]);
    });
  }
  emit(command, args) {
    if (this._applyingInbound) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const prefix = this.instance ? `/twig/${this.instance}` : "/twig";
    this.ws.send(JSON.stringify({ address: `${prefix}/${command}`, args }));
  }
};
function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}
function perVoiceArgs(sub, args) {
  if (sub !== void 0) {
    const n2 = parseInt(sub, 10);
    return [Number.isFinite(n2) ? n2 : null, args];
  }
  const n = Math.round(args[0]);
  return [Number.isFinite(n) ? n : null, args.slice(1)];
}
var oscClient = new OscClient();
function oscEnabled() {
  return new URLSearchParams(window.location.search).get("osc") !== "0";
}

// js/modules/shape/ShapePanel.js
var ShapePanel = class {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "shape-panel";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "shape-panel-preview";
    this.canvas.width = 240;
    this.canvas.height = 56;
    this.stepper = cycleStepper({
      options: waveformNames,
      get: () => shapeMode.contour,
      set: (name) => shapeMode.setContour(name),
      className: "shape-panel-stepper",
      render: (el, name) => {
        el.innerHTML = "";
        const img = document.createElement("img");
        img.src = shapeIconDataURL(name, { width: 22, height: 12, color: "--text-accent" });
        img.alt = name;
        el.title = name;
        el.appendChild(img);
      }
    });
    const cycles2 = document.createElement("div");
    cycles2.className = "shape-panel-cycles";
    this.cyclesLabel = document.createElement("span");
    this.cyclesLabel.className = "shape-panel-cycles-label";
    const mkBtn = (text, factor, title) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "action-btn shape-panel-btn";
      b.textContent = text;
      b.title = title;
      b.addEventListener("click", () => shapeMode.stepCycles(factor));
      return b;
    };
    cycles2.append(
      mkBtn("\xF72", 0.5, "half as many cycles across the row"),
      this.cyclesLabel,
      mkBtn("\xD72", 2, "twice as many cycles across the row")
    );
    this.el.append(this.canvas, this.stepper, cycles2);
  }
  setEnabled(enabled) {
    this.el.classList.toggle("is-disabled", !enabled);
    for (const btn of this.el.querySelectorAll("button")) btn.disabled = !enabled;
  }
  refresh() {
    const c = shapeMode.cycles;
    this.cyclesLabel.textContent = c >= 1 ? `\xD7${c}` : `\xF7${1 / c}`;
    this.stepper._refresh();
    drawShapeContour(this.canvas, shapeMode.contour, c);
  }
};
function waveformNames() {
  return waveformMenuNames();
}

// js/modules/overtoneToolbar/OvertoneToolbarComponent.js
var ICON_SHAPE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 12c2-7 4-7 6 0s4 7 6 0 2-7 3 0"/></svg>';
var ICON_LINK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1.3 1.3"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1.3-1.3"/></svg>';
var OvertoneToolbarComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.onReset = null;
    this.onRandomize = null;
    this.onToggleLink = null;
    this.onToggleShape = null;
    this.panel = new ShapePanel();
    this.build();
  }
  build() {
    this.el.classList.add("overtone-toolbar");
    this.el.innerHTML = "";
    const actions = document.createElement("div");
    actions.className = "overtone-toolbar-group";
    actions.append(
      this.button("action-btn focus-ring", "reset", "Reset", "Reset this panel's values for every overtone"),
      this.button("action-btn focus-ring", "randomize", "Randomize", "Randomize this panel's values for every overtone")
    );
    this.slotEl = document.createElement("div");
    this.slotEl.className = "overtone-toolbar-slot";
    const shapeBox = document.createElement("div");
    shapeBox.className = "overtone-toolbar-shape";
    shapeBox.append(
      this.button("overtone-mode-btn", "shape", "shape", "Shape: an edit sculpts every overtone along a waveform contour (or hold shift)", ICON_SHAPE),
      this.panel.el
    );
    const modes = document.createElement("div");
    modes.className = "overtone-toolbar-group overtone-toolbar-modes";
    modes.append(
      shapeBox,
      this.button("overtone-mode-btn", "link", "link", "Link all: every edit applies to all overtones (or hold cmd/ctrl)", ICON_LINK)
    );
    this.el.append(actions, this.slotEl, modes);
  }
  button(className, action, text, title, icon = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.dataset.action = action;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = `${icon}<span class="overtone-toolbar-btn-text">${text}</span>`;
    return btn;
  }
  render({ link, shape }) {
    this.q('[data-action="link"]').setAttribute("aria-pressed", String(Boolean(link)));
    this.q('[data-action="shape"]').setAttribute("aria-pressed", String(Boolean(shape)));
    this.panel.refresh();
    this.panel.setEnabled(Boolean(shape));
  }
  bindRenderedEvents() {
    const handlers = {
      reset: () => this.onReset?.(),
      randomize: () => this.onRandomize?.(),
      link: () => this.onToggleLink?.(),
      shape: () => this.onToggleShape?.()
    };
    for (const btn of this.qAll("button[data-action]")) {
      const handler = handlers[btn.dataset.action];
      if (handler) this.bindEvent(btn, "click", handler);
    }
  }
};

// js/modules/overtoneToolbar/overtoneToolbarController.js
var OvertoneToolbarController = class extends BaseController {
  constructor(selector, { onReset, onRandomize } = {}) {
    super(selector);
    this.onReset = onReset;
    this.onRandomize = onRandomize;
  }
  createComponent(selector) {
    return new OvertoneToolbarComponent(selector);
  }
  /** Where the host panel mounts its own content (between the button groups). */
  get slotEl() {
    return this.component.slotEl;
  }
  getProps() {
    return {
      link: linkLock.on || linkLock.held,
      // In effect either way: holding shift also enables the shape
      // panel's controls, so desktop can reach them without the lock
      shape: shapeMode.on || shapeMode.held
    };
  }
  bindComponentEvents() {
    this.component.onReset = () => this.onReset?.();
    this.component.onRandomize = () => this.onRandomize?.();
    this.component.onToggleLink = () => {
      if (!linkLock.on) shapeMode.set(false);
      linkLock.toggle();
    };
    this.component.onToggleShape = () => {
      if (!shapeMode.on) linkLock.set(false);
      shapeMode.set(!shapeMode.on);
    };
  }
  bindExternalEvents() {
    document.addEventListener(LINK_ALL_CHANGED, () => this.update());
    document.addEventListener(SHAPE_MODE_CHANGED, () => this.update());
  }
};

// js/modules/source/SourceComponent.js
var SourceComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this.onModeChange = null;
    this.onAdcDeviceChange = null;
    this.onAdcChannelChange = null;
    this.onFile = null;
    this.onLibraryPick = null;
    this.onManageFiles = null;
    this.onSoundfileMode = null;
    this.onSoundfileTune = null;
    this.onSoundfileFundamental = null;
    this.onSoundfileRange = null;
  }
  render({ sourceMode, adcDeviceId, adcChannel, adcDevices, soundfileName, soundfile, library }) {
    this.props = { sourceMode, soundfileName, soundfile, library };
    const modeSelect = this.q("#source-mode-select");
    if (modeSelect && modeSelect.value !== sourceMode) modeSelect.value = sourceMode;
    this.q("#source-adc-controls")?.classList.toggle("hidden", sourceMode !== "adc");
    this.q("#source-file-controls")?.classList.toggle("hidden", sourceMode !== "soundfile");
    this.q("#oscillator-picker")?.classList.toggle("hidden", sourceMode !== "oscillators");
    this.q("#current-waveform-canvas-area")?.classList.toggle("hidden", sourceMode !== "oscillators" && sourceMode !== "soundfile");
    if (sourceMode === "adc") this.renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices });
    if (sourceMode === "soundfile") {
      this.renderLibrary(library, soundfile.source, soundfileName);
      this.renderSoundfile(soundfile);
    }
    this.renderRange(sourceMode === "soundfile" && soundfileName ? soundfile.range : null, sourceMode === "soundfile" && Boolean(soundfileName));
  }
  /**
   * The chosen part of the file over the preview: shades outside it, and
   * the whole-file button while a range is set. Also used mid-drag.
   */
  renderRange(range, active) {
    const overlay = this.q("#source-range-overlay");
    if (!overlay) return;
    overlay.classList.toggle("hidden", !active);
    const [start, end] = range || [0, 1];
    overlay.querySelector(".source-range-dim-left").style.width = `${start * 100}%`;
    overlay.querySelector(".source-range-dim-right").style.width = `${(1 - end) * 100}%`;
    this.q("#source-range-reset")?.classList.toggle("hidden", !range);
  }
  /**
   * The library menu: every file on the machine that can be played as a
   * sample, grouped by where it came from, and naming what is loaded.
   *
   * The options are rebuilt only when the library itself changes — this
   * panel re-renders on every fundamental step and range drag, and
   * rewriting a <select> under the pointer closes it mid-choice.
   *
   * @param {Array} groups - sourceLibrary.samplerLibrary()
   * @param {?{kind: string, id: string}} current - what is loaded
   * @param {?string} name - its name, for a file the library no longer has
   */
  renderLibrary(groups, current, name) {
    const select = this.q("#soundfile-library-select");
    if (!select) return;
    const value = current ? `${current.kind}:${current.id}` : "";
    const known = (groups || []).some((g) => g.items.some((i) => `${g.kind}:${i.id}` === value));
    const signature = [known ? "" : name, ...(groups || []).map((g) => `${g.kind}=${g.items.map((i) => i.id).join(",")}`)].join("|");
    if (select.dataset.signature !== signature) {
      select.dataset.signature = signature;
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.textContent = known ? "Choose a file\u2026" : name || "No file loaded";
      select.appendChild(placeholder);
      let files = 0;
      for (const group of groups || []) {
        if (!group.items.length) continue;
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.label;
        for (const item of group.items) {
          const option = document.createElement("option");
          option.value = `${group.kind}:${item.id}`;
          option.textContent = item.name;
          optgroup.appendChild(option);
          files++;
        }
        select.appendChild(optgroup);
      }
      if (files) {
        const manage = document.createElement("option");
        manage.value = MANAGE_FILES_OPTION;
        manage.dataset.role = "action";
        manage.textContent = "Manage files\u2026";
        select.appendChild(manage);
      }
    }
    select.value = known ? value : "";
  }
  /** Mono/Poly, tune, fundamental — tune and fundamental only apply to poly. */
  renderSoundfile({ mode, tune, fundamental, detectedHz }) {
    const poly = mode === "poly";
    const modeSwitch = this.q("#soundfile-mode-switch");
    if (modeSwitch) {
      modeSwitch.classList.toggle("active", poly);
      modeSwitch.setAttribute("aria-checked", String(poly));
    }
    const modeLabel = this.q("#soundfile-mode-label");
    if (modeLabel) modeLabel.textContent = poly ? "Poly" : "Mono";
    const tuneEl = this.q("#soundfile-tune");
    if (tuneEl) {
      tuneEl.classList.toggle("active", Boolean(tune));
      tuneEl.setAttribute("aria-checked", String(Boolean(tune)));
      tuneEl.setAttribute("aria-disabled", String(!poly));
      tuneEl.parentElement.classList.toggle("disabled", !poly);
    }
    const detected = detectedHz ? detectedHz.toFixed(detectedHz >= 100 ? 1 : 2) : null;
    const hzEl = this.q("#soundfile-fundamental");
    if (hzEl) {
      if (document.activeElement !== hzEl) hzEl.value = fundamental ?? "";
      hzEl.placeholder = detected ? `auto ${detected}` : "auto";
      hzEl.disabled = !(poly && tune);
    }
    const reset = this.q("#soundfile-fundamental-reset");
    if (reset) {
      const show = fundamental !== null && fundamental !== void 0 && detected !== null;
      reset.classList.toggle("hidden", !show);
      reset.textContent = detected ? `\u21BA ${detected}` : "";
      reset.disabled = !(poly && tune);
    }
  }
  renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices }) {
    const deviceSelect = this.q("#adc-device-select");
    if (deviceSelect) {
      deviceSelect.innerHTML = "";
      const def = document.createElement("option");
      def.value = "";
      def.textContent = "Default input";
      deviceSelect.appendChild(def);
      for (const dev of adcDevices || []) {
        const opt = document.createElement("option");
        opt.value = dev.id;
        opt.textContent = dev.label;
        if (dev.id === adcDeviceId) opt.selected = true;
        deviceSelect.appendChild(opt);
      }
    }
    const channelSelect = this.q("#adc-channel-select");
    if (channelSelect) {
      channelSelect.innerHTML = "";
      for (let ch = 0; ch < 8; ch++) {
        const opt = document.createElement("option");
        opt.value = ch;
        opt.textContent = `Ch ${ch + 1}`;
        if (ch === (adcChannel || 0)) opt.selected = true;
        channelSelect.appendChild(opt);
      }
    }
  }
  /**
   * Drag across the preview to choose the part of the file that plays.
   * The shades follow the pointer; the range is committed on release
   * (a commit restarts the players, so not per move). A press without
   * travel leaves the range alone.
   */
  bindRangeDrag() {
    const area = this.q("#current-waveform-canvas-area");
    const overlay = this.q("#source-range-overlay");
    if (!area || !overlay) return;
    let anchor = null;
    const frac = (e) => {
      const r = area.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    this.bindEvent(overlay, "pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("#source-range-reset")) return;
      anchor = { x: frac(e), clientX: e.clientX };
      try {
        overlay.setPointerCapture(e.pointerId);
      } catch {
      }
      e.preventDefault();
    });
    this.bindEvent(overlay, "pointermove", (e) => {
      if (!anchor) return;
      const x = frac(e);
      this.renderRange([Math.min(anchor.x, x), Math.max(anchor.x, x)], true);
    });
    const finish = (e) => {
      if (!anchor) return;
      const a = anchor;
      anchor = null;
      if (Math.abs(e.clientX - a.clientX) < 3) {
        this.renderRange(this.props?.soundfile?.range ?? null, true);
        return;
      }
      const x = frac(e);
      this.onSoundfileRange?.([Math.min(a.x, x), Math.max(a.x, x)]);
    };
    this.bindEvent(overlay, "pointerup", finish);
    this.bindEvent(overlay, "pointercancel", finish);
  }
  /**
   * Re-bound after every render (BaseController.update tears down all
   * bindEvent listeners before rendering).
   */
  bindRenderedEvents() {
    this.bindEvent(this.q("#source-mode-select"), "change", (e) => {
      this.onModeChange?.(e.target.value);
    });
    this.bindEvent(this.q("#adc-device-select"), "change", (e) => {
      this.onAdcDeviceChange?.(e.target.value || null);
    });
    this.bindEvent(this.q("#adc-channel-select"), "change", (e) => {
      this.onAdcChannelChange?.(parseInt(e.target.value, 10) || 0);
    });
    this.bindEvent(this.q("#soundfile-input"), "change", (e) => {
      const file = e.target.files?.[0];
      if (file) this.onFile?.(file);
    });
    this.bindEvent(this.q("#soundfile-library-select"), "change", (e) => {
      if (e.target.value === MANAGE_FILES_OPTION) {
        const current = this.props?.soundfile?.source;
        e.target.value = current ? `${current.kind}:${current.id}` : "";
        this.onManageFiles?.();
        return;
      }
      const [kind, id] = e.target.value.split(":");
      if (!id) return;
      this.onLibraryPick?.({ kind, id, name: e.target.selectedOptions[0]?.textContent || "" });
    });
    this.bindEvent(this.q("#soundfile-mode-switch"), "click", (e) => {
      this.onSoundfileMode?.(e.currentTarget.classList.contains("active") ? "mono" : "poly");
    });
    this.bindEvent(this.q("#soundfile-tune"), "click", (e) => {
      if (e.currentTarget.getAttribute("aria-disabled") === "true") return;
      this.onSoundfileTune?.(!e.currentTarget.classList.contains("active"));
    });
    this.bindEvent(this.q("#soundfile-fundamental"), "change", (e) => this.onSoundfileFundamental?.(parseFloat(e.target.value)));
    this.bindEvent(this.q("#soundfile-fundamental-reset"), "click", (e) => {
      e.preventDefault();
      this.onSoundfileFundamental?.(null);
    });
    this.bindRangeDrag();
    this.bindEvent(this.q("#source-range-reset"), "click", () => this.onSoundfileRange?.(null));
    this.bindEvent(this.el, "dragover", (e) => {
      e.preventDefault();
      this.el.classList.add("drop-target");
    });
    this.bindEvent(this.el, "dragleave", () => {
      this.el.classList.remove("drop-target");
    });
    this.bindEvent(this.el, "drop", (e) => {
      e.preventDefault();
      this.el.classList.remove("drop-target");
      const file = [...e.dataTransfer?.files || []].find((f) => f.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i.test(f.name));
      if (file) this.onFile?.(file);
    });
  }
};

// js/modules/source/sourceController.js
var SourceController = class extends BaseController {
  createComponent(selector) {
    return new SourceComponent(selector);
  }
  getProps() {
    return {
      sourceMode: AppState.sourceMode,
      adcDeviceId: AppState.adcDeviceId,
      adcChannel: AppState.adcChannel,
      adcDevices: this._adcDevices || [],
      soundfileName: AppState.soundfileName,
      library: this._library || [],
      soundfile: {
        mode: soundfileConfig.mode,
        tune: soundfileConfig.tune,
        fundamental: AppState.soundfileFundamental,
        range: AppState.soundfileRange,
        detectedHz: sourceManager.fileFundamental,
        source: sourceManager.fileSource
      }
    };
  }
  bindComponentEvents() {
    this.component.onModeChange = (mode) => SourceActions.setSourceMode(mode);
    this.component.onAdcDeviceChange = (id) => SourceActions.setAdcDevice(id);
    this.component.onAdcChannelChange = (ch) => SourceActions.setAdcChannel(ch);
    this.component.onFile = (file) => SourceActions.loadSoundFile(file);
    this.component.onLibraryPick = (entry) => SourceActions.loadLibraryEntry(entry);
    this.component.onManageFiles = () => openSettings("files");
    this.component.onSoundfileMode = (mode) => SourceActions.setSoundfileMode(mode);
    this.component.onSoundfileTune = (on) => SourceActions.setSoundfileTune(on);
    this.component.onSoundfileFundamental = (hz) => SourceActions.setSoundfileFundamental(hz);
    this.component.onSoundfileRange = (range) => SourceActions.setSoundfileRange(range);
  }
  bindExternalEvents() {
    document.addEventListener(SOURCE_CHANGED, () => this.refreshDevices());
    for (const event of [LIBRARY_CHANGED, RECORDINGS_CHANGED]) {
      document.addEventListener(event, () => this.refreshLibrary());
    }
  }
  /** Refresh the ADC device list, then re-render with it. */
  async refreshDevices() {
    const mode = AppState.sourceMode;
    if (mode === "adc") {
      try {
        this._adcDevices = await sourceManager.inputDevices();
      } catch {
        this._adcDevices = [];
      }
    }
    const entering = mode === "soundfile" && this._sourceMode !== "soundfile";
    this._sourceMode = mode;
    if (entering) {
      await this.refreshLibrary();
      return;
    }
    this.update();
  }
  /** Re-read the machine's library; only the sampler's menu shows it. */
  async refreshLibrary() {
    if (AppState.sourceMode !== "soundfile") return;
    this._library = await samplerLibrary();
    this.update();
  }
};

// js/dsp/spectrumPreview.js
function primitiveHarmonics(primitive, count = 32) {
  const out = [];
  for (let n = 1; n <= count; n++) {
    let a = 0;
    switch (primitive) {
      case "square":
        a = n % 2 ? 4 / (Math.PI * n) : 0;
        break;
      case "sawtooth":
        a = 2 / (Math.PI * n);
        break;
      case "triangle":
        a = n % 2 ? 8 / (Math.PI * Math.PI * n * n) : 0;
        break;
      default:
        a = n === 1 ? 1 : 0;
    }
    if (a > 0) out.push({ k: n, amp: a });
  }
  return out;
}
function timbreLines({ ratios, amplitudes, isSubharmonic, f0, primitive, custom, maxFreq = 2e4 }) {
  const lines = [];
  const stack = custom ? Array.from({ length: Math.min(custom.real.length, custom.imag.length) }, (_, k) => ({
    k: k / custom.period,
    amp: Math.hypot(custom.real[k] || 0, custom.imag[k] || 0)
  })).filter((h) => h.k > 0 && h.amp > 1e-4) : primitiveHarmonics(primitive);
  const peak = stack.reduce((m, h) => Math.max(m, h.amp), 0) || 1;
  for (let i = 0; i < ratios.length; i++) {
    const amp = amplitudes[i] || 0;
    const r = ratios[i];
    if (amp <= 1e-3 || !(r > 0)) continue;
    const voiceFreq = f0 * (isSubharmonic ? 1 / r : r);
    for (const h of stack) {
      const freq = voiceFreq * h.k;
      if (freq > maxFreq) break;
      lines.push({ freq, amp: amp * (h.amp / peak) });
    }
  }
  return lines;
}
function irTimeConstant(ringSeconds, loopSeconds) {
  return ringSeconds > 0 ? ringSeconds / Math.log(1e3) : loopSeconds;
}
function resonanceCurve(lines, tau, freqs) {
  const out = new Float32Array(freqs.length);
  const w = 2 * Math.PI * tau;
  let peak = 0;
  for (let i = 0; i < freqs.length; i++) {
    let sum = 0;
    for (const line of lines) {
      const d = (freqs[i] - line.freq) * w;
      sum += line.amp / Math.sqrt(1 + d * d);
    }
    out[i] = sum;
    if (sum > peak) peak = sum;
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}
function logFrequencies(fmin, fmax, count) {
  const out = new Float32Array(count);
  const ratio = Math.log(fmax / fmin);
  for (let i = 0; i < count; i++) out[i] = fmin * Math.exp(ratio * i / (count - 1));
  return out;
}

// js/modules/spectrum/SpectrumComponent.js
var HEIGHT = 96;
var POINTS = 360;
var DB_FLOOR = -48;
var SpectrumComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "spectrum-canvas";
    this.el.appendChild(this.canvas);
  }
  resize() {
    const width = this.el.clientWidth || 400;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(HEIGHT * dpr);
    this.canvas.style.setProperty("width", "100%", "important");
    this.canvas.style.setProperty("height", `${HEIGHT}px`, "important");
    this.canvas.style.setProperty("min-height", `${HEIGHT}px`, "important");
    this.dpr = dpr;
    this.width = width;
  }
  render(props) {
    this.props = props;
    this.resize();
    const ctx = this.canvas.getContext("2d");
    const { width, dpr } = this;
    const height = HEIGHT;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = themeColor("--viz-bg");
    ctx.fillRect(0, 0, width, height);
    const f0 = props.f0 || 130.81;
    const fmin = Math.max(20, f0 / 2);
    const fmax = 2e4;
    const freqs = logFrequencies(fmin, fmax, POINTS);
    const xOf = (f) => Math.log(f / fmin) / Math.log(fmax / fmin) * width;
    ctx.strokeStyle = themeColor("--viz-grid");
    ctx.lineWidth = 1;
    for (let f = f0; f < fmax; f *= 2) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    const lines = timbreLines(props);
    if (lines.length === 0) return;
    const tau = irTimeConstant(props.ringSeconds, 1 / f0);
    const mag = resonanceCurve(lines, tau, freqs);
    const yOf = (m) => {
      const db = 20 * Math.log10(Math.max(m, 1e-6));
      const t = Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));
      return height - 4 - t * (height - 10);
    };
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < POINTS; i++) ctx.lineTo(i / (POINTS - 1) * width, yOf(mag[i]));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = themeColor("--viz-trace");
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < POINTS; i++) {
      const x = i / (POINTS - 1) * width;
      const y = yOf(mag[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = themeColor("--viz-trace");
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = themeColor("--viz-grid");
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(props.ringSeconds > 0 ? `ring ${props.ringSeconds.toFixed(1)} s` : "one loop", width - 12, 16);
  }
};

// js/modules/spectrum/spectrumController.js
var SpectrumController = class extends BaseController {
  createComponent(selector) {
    return new SpectrumComponent(selector);
  }
  getProps() {
    const primitive = AppState.currentWaveform;
    const coeffs = AppState.customWaveCoefficients?.[primitive];
    return {
      ratios: AppState.currentSystem.ratios,
      amplitudes: AppState.harmonicAmplitudes,
      isSubharmonic: AppState.isSubharmonic,
      f0: AppState.fundamentalFrequency,
      primitive,
      custom: coeffs ? { real: coeffs.real, imag: coeffs.imag, period: AppState.customWavePeriodMultipliers?.[primitive] || 1 } : null,
      ringSeconds: AppState.irRingSeconds
    };
  }
  bindExternalEvents() {
    for (const evt of [
      DRAWBAR_CHANGE,
      DRAWBARS_RESET,
      DRAWBARS_RANDOMIZED,
      SPECTRAL_SYSTEM_CHANGED,
      SUBHARMONIC_TOGGLED,
      CURRENT_WAVEFORM_CHANGED,
      FUNDAMENTAL_CHANGED,
      IR_RING_CHANGED
    ]) {
      document.addEventListener(evt, () => this.scheduleUpdate());
    }
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.scheduleUpdate()).observe(this.component.el);
    } else {
      window.addEventListener("resize", () => this.scheduleUpdate());
    }
  }
};

// js/modules/scope/ScopeComponent.js
var HEIGHT2 = 96;
var TRACE_SAMPLES = 1024;
var ScopeComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.canvas = null;
    this.buffer = null;
    this.playing = false;
    this._rafId = null;
    this._resizeObserver = null;
  }
  _ensureCanvas() {
    if (this.canvas) return;
    this.canvas = document.createElement("canvas");
    this.el.appendChild(this.canvas);
    this.dpr = window.devicePixelRatio || 1;
  }
  /** Recompute the backing store from the root's current width, then redraw. */
  _resize() {
    const width = this.el.clientWidth || 300;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(HEIGHT2 * dpr);
    this.canvas.style.setProperty("width", "100%", "important");
    this.canvas.style.setProperty("height", `${HEIGHT2}px`, "important");
    this.canvas.style.setProperty("min-height", `${HEIGHT2}px`, "important");
    this.dpr = dpr;
    this.width = width;
    this._draw();
  }
  render({ playing }) {
    this.playing = playing;
    this._ensureCanvas();
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(this.el);
    }
    this.bindEvent(window, "resize", () => this._resize());
    this._resize();
    if (playing) this._start();
    else this._stop();
  }
  _start() {
    if (this._rafId != null) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._draw();
    };
    tick();
  }
  _stop() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
  /** First rising zero-crossing within the first half of the buffer. */
  _findTrigger(buffer) {
    const half = buffer.length >> 1;
    for (let i = 1; i < half; i++) {
      if (buffer[i - 1] <= 0 && buffer[i] > 0) return i;
    }
    return 0;
  }
  _draw() {
    if (!this.canvas) return;
    if (this.el.offsetParent === null) return;
    const ctx = this.canvas.getContext("2d");
    const width = this.width || this.el.clientWidth || 300;
    const height = HEIGHT2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = themeColor("--viz-bg");
    ctx.fillRect(0, 0, width, height);
    const midY = Math.round(height / 2) + 0.5;
    ctx.strokeStyle = themeColor("--viz-grid");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    const analyser = this.playing ? getOutputAnalyser() : null;
    if (!analyser) return;
    if (!this.buffer || this.buffer.length !== analyser.fftSize) {
      this.buffer = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(this.buffer);
    const trigger = this._findTrigger(this.buffer);
    const count = Math.min(TRACE_SAMPLES, this.buffer.length - trigger);
    if (count < 2) return;
    ctx.strokeStyle = themeColor("--viz-trace");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const v = this.buffer[trigger + i];
      const x = i / (count - 1) * width;
      const y = Math.max(0, Math.min(height, (1 - v) * height / 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  teardown() {
    super.teardown();
    this._stop();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }
};

// js/modules/scope/scopeController.js
var ScopeController = class extends BaseController {
  createComponent(selector) {
    return new ScopeComponent(selector);
  }
  getProps() {
    return { playing: AppState.isPlaying };
  }
  bindExternalEvents() {
    document.addEventListener(PLAY_STATE_CHANGED, () => this.update());
  }
};

// js/modules/envelopeViz/EnvelopeVizComponent.js
var HEIGHT3 = 96;
var PAD = 4;
var HOLD = 0.35;
function envelopeCurvePoints(env, hold = HOLD) {
  const { a, d, s, r } = env;
  return [
    { t: 0, v: 0 },
    { t: a, v: 1 },
    { t: a + d, v: s },
    { t: a + d + hold, v: s },
    { t: a + d + hold + r, v: 0 }
  ];
}
function envelopeDuration(env, hold = HOLD) {
  const points = envelopeCurvePoints(env, hold);
  return points[points.length - 1].t;
}
function scaleEnvelopePoints(points, sharedDuration, width, height, pad = PAD) {
  const span = sharedDuration || 1;
  const innerW = Math.max(0, width - 2 * pad);
  const innerH = Math.max(0, height - 2 * pad);
  return points.map(({ t, v }) => ({
    x: pad + t / span * innerW,
    y: pad + (1 - v) * innerH
  }));
}
var EnvelopeVizComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "envelope-viz-canvas";
    this.el.appendChild(this.canvas);
  }
  resize() {
    const width = this.el.clientWidth || 300;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(HEIGHT3 * dpr);
    this.canvas.style.setProperty("width", "100%", "important");
    this.canvas.style.setProperty("height", `${HEIGHT3}px`, "important");
    this.canvas.style.setProperty("min-height", `${HEIGHT3}px`, "important");
    this.dpr = dpr;
    this.width = width;
  }
  render(props) {
    this.resize();
    const ctx = this.canvas.getContext("2d");
    const { width, dpr } = this;
    const height = HEIGHT3;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = themeColor("--viz-bg");
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = themeColor("--viz-grid");
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    const voices = props.voices || [];
    if (!voices.length) return;
    const sharedDuration = Math.max(...voices.map(({ env }) => envelopeDuration(env)));
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    for (const { ratio, env } of voices) {
      const points = scaleEnvelopePoints(envelopeCurvePoints(env), sharedDuration, width, height);
      ctx.strokeStyle = partialColor(ratio);
      ctx.beginPath();
      points.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
};

// js/modules/envelopeViz/envelopeVizController.js
var EnvelopeVizController = class extends BaseController {
  createComponent(selector) {
    return new EnvelopeVizComponent(selector);
  }
  getProps() {
    const ratios = AppState.currentSystem.ratios;
    return {
      voices: ratios.map((ratio, i) => ({ ratio, env: OvertoneSignalActions.getEnvelope(i) }))
    };
  }
  bindExternalEvents() {
    document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
      if (e.detail?.kind === "envelope") this.scheduleUpdate();
    });
    for (const evt of [SPECTRAL_SYSTEM_CHANGED, DRAWBARS_RESET, DRAWBARS_RANDOMIZED]) {
      document.addEventListener(evt, () => this.scheduleUpdate());
    }
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
      this._resizeObserver.observe(this.component.el);
    } else {
      this._resizeListener = () => this.scheduleUpdate();
      window.addEventListener("resize", this._resizeListener);
    }
  }
  destroy() {
    this._resizeObserver?.disconnect();
    if (this._resizeListener) window.removeEventListener("resize", this._resizeListener);
    super.destroy();
  }
};

// js/modules/inspector/inspectorState.js
var state = { index: 0 };
function voiceCount() {
  return AppState.currentSystem.ratios.length;
}
var inspectorState = {
  get index() {
    return Math.min(state.index, Math.max(0, voiceCount() - 1));
  },
  select(index) {
    if (index === state.index) return;
    state.index = index;
    document.dispatchEvent(new CustomEvent(INSPECTOR_CHANGED, { detail: { index } }));
  },
  /** Move the selection by `delta` voices, wrapping. */
  step(delta) {
    const n = voiceCount();
    if (n === 0) return;
    this.select((this.index + delta + n) % n);
  }
};

// js/modules/sequenceViz/SequenceVizComponent.js
var HEIGHT4 = 96;
var SequenceVizComponent = class extends BaseComponent {
  constructor(elementId) {
    super(elementId);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "sequence-viz-canvas";
    this.el.appendChild(this.canvas);
    this.base = document.createElement("canvas");
    this._raf = null;
  }
  resize() {
    const width = this.el.clientWidth || 300;
    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(HEIGHT4 * dpr);
    }
    this.canvas.style.setProperty("width", "100%", "important");
    this.canvas.style.setProperty("height", `${HEIGHT4}px`, "important");
    this.canvas.style.setProperty("min-height", `${HEIGHT4}px`, "important");
    this.dpr = dpr;
    this.width = width;
  }
  render({ index, cycles: cycles2, playing, positionOf }) {
    this.cycles = Math.max(1, cycles2 || 1);
    this.positionOf = positionOf;
    this.resize();
    const ctx = this.base.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawSequencePreview(ctx, index, this.width, HEIGHT4);
    this.stop();
    this.frame();
    if (playing) this.start();
  }
  /** The static drawing, then the playhead where the clock stands. */
  frame() {
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    const position = this.positionOf?.();
    if (position === null || position === void 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const x = Math.floor(position % this.cycles / this.cycles * this.width) + 0.5;
    ctx.strokeStyle = themeColor("--viz-playhead");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT4);
    ctx.stroke();
  }
  start() {
    const tick = () => {
      if (this.el.clientWidth > 0) this.frame();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  stop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
  teardown() {
    this.stop();
    super.teardown();
  }
};

// js/modules/sequenceViz/sequenceVizController.js
var SequenceVizController = class extends BaseController {
  createComponent(selector) {
    return new SequenceVizComponent(selector);
  }
  getProps() {
    const index = inspectorState.index;
    const gate = OvertoneSignalActions.getGate(index);
    const seq = OvertoneSignalActions.getSequencer(index);
    return {
      index,
      // The playhead folds the clock into exactly the cycles drawn
      cycles: previewCycleCount(gate, seq.stretch),
      playing: AppState.isPlaying,
      positionOf: () => harmonicCyclePosition(index)
    };
  }
  /** The panel's label names the voice: "Sequence 3". */
  update() {
    const label = document.querySelector("#sequence-viz-root > label");
    if (label) label.textContent = `Sequence ${inspectorState.index + 1}`;
    return super.update();
  }
  bindExternalEvents() {
    document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
      const { index, kind } = e.detail || {};
      if (index === inspectorState.index && (kind === "gate" || kind === "seq")) this.scheduleUpdate();
    });
    for (const evt of [INSPECTOR_CHANGED, SPECTRAL_SYSTEM_CHANGED, PLAY_STATE_CHANGED]) {
      document.addEventListener(evt, () => this.scheduleUpdate());
    }
    this._resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
    this._resizeObserver.observe(this.component.el);
  }
  destroy() {
    this._resizeObserver?.disconnect();
    super.destroy();
  }
};

// js/modules/masterRail/masterRailController.js
var MasterRailController = class {
  /**
   * @param {string} railSelector  the rail
   * @param {string} homeSelector  the roots' place in the navbar
   * @param {string[]} rootSelectors the slider roots, in order
   */
  constructor(railSelector, homeSelector, rootSelectors) {
    this.rail = document.querySelector(railSelector);
    this.home = document.querySelector(homeSelector);
    this.roots = rootSelectors.map((sel) => document.querySelector(sel));
    if (!this.rail || !this.home || this.roots.some((r) => !r)) {
      throw new Error("MasterRailController: missing rail, home or slider root");
    }
  }
  init() {
    this.sync();
    document.addEventListener(LAYOUT_MODE_CHANGED, () => this.sync());
  }
  sync() {
    const host = layoutMode.narrow ? this.rail : this.home;
    if (this.roots[0].parentElement !== host) host.append(...this.roots);
  }
};

// js/modules/recording/RecorderComponent.js
var svg = (body) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
var ICONS = {
  record: svg('<circle cx="10" cy="10" r="4.5" fill="currentColor" stroke="none"/>'),
  config: svg('<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>'),
  play: svg('<path d="M6.5 4.5v11l9-5.5z" fill="currentColor"/>'),
  pause: svg('<path d="M7 4.5v11M13 4.5v11" stroke-width="2.4"/>'),
  reset: svg('<path d="M5 4.5v11" stroke-width="2"/><path d="M15.5 4.5v11l-8-5.5z" fill="currentColor"/>'),
  download: svg('<path d="M10 3.5v9M6 9l4 4 4-4M4.5 16.5h11"/>'),
  expand: svg('<path d="M8 5l5 5-5 5"/>'),
  collapse: svg('<path d="M12 5l-5 5 5 5"/>')
};
var RecorderComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.expanded = false;
  }
  render({ status, transport, recordings, selected, stemsAvailable, videoExtension } = {}) {
    this.el.innerHTML = "";
    this.el.classList.toggle("rec-expanded", this.expanded);
    const has = Boolean(selected);
    const recording = status === "recording";
    const armed = status === "armed";
    this.el.append(
      this.button(
        "rec-btn" + (recording ? " recording" : armed ? " armed" : ""),
        ICONS.record,
        "record",
        recording ? "Stop recording" : armed ? "Waiting for beat \u2014 click to cancel" : "Record"
      )
    );
    if (recording || armed) {
      const elapsed = document.createElement("span");
      elapsed.className = "rec-elapsed";
      elapsed.textContent = "0:00";
      this.el.appendChild(elapsed);
    }
    const expand = this.button(
      "action-btn rec-icon-btn rec-expand-btn",
      this.expanded ? ICONS.collapse : ICONS.expand,
      "expand",
      this.expanded ? "Hide recorder controls" : "Recorder controls"
    );
    expand.setAttribute("aria-expanded", String(this.expanded));
    this.el.appendChild(expand);
    this.el.append(
      this.button("action-btn rec-icon-btn", ICONS.config, "config", "Recording settings"),
      this.stepper(recordings, selected),
      this.button(
        "action-btn rec-icon-btn",
        transport === "playing" ? ICONS.pause : ICONS.play,
        "toggle",
        transport === "playing" ? "Pause" : "Play",
        !has
      ),
      this.button("action-btn rec-icon-btn", ICONS.reset, "reset", "Reset to start", !has),
      this.button("action-btn rec-icon-btn rec-download-btn", ICONS.download, "download", "Download take\u2026", !has)
    );
    this.el.appendChild(this.downloadMenu(has, stemsAvailable, videoExtension));
  }
  /**
   * The download button's menu: one item per export format. The bundle
   * holds everything the take has — it is offered whenever there is more
   * than the plain .wav/.mid pair to gather (stems, or an animation).
   */
  downloadMenu(has, stemsAvailable, videoExtension) {
    const menu2 = document.createElement("div");
    menu2.className = "rec-menu hidden";
    const items = [
      ["wav", "audio (.wav)", has, null],
      ["mid", "MIDI (.mid)", has, null],
      [
        "video",
        `animation (.${videoExtension || "mp4"})`,
        has && Boolean(videoExtension),
        "record with Record Animation on"
      ],
      [
        "zip",
        "bundle (.zip)",
        has && (stemsAvailable || Boolean(videoExtension)),
        "multitrack or filmed takes only"
      ]
    ];
    for (const [kind, label, enabled, why] of items) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "rec-menu-item";
      item.dataset.kind = kind;
      item.textContent = label;
      item.disabled = !enabled;
      if (!enabled && why) item.title = why;
      menu2.appendChild(item);
    }
    return menu2;
  }
  toggleMenu(open = null) {
    const menu2 = this.q(".rec-menu");
    menu2?.classList.toggle("hidden", open === null ? void 0 : !open);
  }
  /** Tick the elapsed readout in place — no re-render, so open menus survive. */
  setElapsed(seconds) {
    const el = this.q(".rec-elapsed");
    if (!el) return;
    const s = Math.floor(seconds);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  /** `content` is trusted markup: an ICONS entry or a plain label. */
  button(className, content, action, title, disabled = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.innerHTML = content;
    btn.dataset.action = action;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.disabled = disabled;
    return btn;
  }
  stepper(recordings, selected) {
    const wrap = document.createElement("div");
    wrap.className = "select-stepper rec-select";
    const select = document.createElement("select");
    select.className = "control-select rec-select-menu";
    select.id = "recording-select";
    select.setAttribute("aria-label", "Recording");
    if (recordings.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "no recordings";
      opt.disabled = true;
      opt.selected = true;
      select.appendChild(opt);
      select.disabled = true;
    }
    for (const r of recordings) {
      const opt = document.createElement("option");
      opt.value = r.key;
      opt.textContent = r.name;
      opt.selected = r.key === selected;
      select.appendChild(opt);
    }
    wrap.append(
      this.button("action-btn select-step-btn", "<-", "prev", "Previous recording", recordings.length === 0),
      select,
      this.button("action-btn select-step-btn", "->", "next", "Next recording", recordings.length === 0)
    );
    return wrap;
  }
  bindRenderedEvents() {
    for (const btn of this.qAll("button[data-action]")) {
      this.bindEvent(btn, "click", () => this.dispatch(btn.dataset.action));
    }
    this.bindEvent(this.q("#recording-select"), "change", (e) => this.onSelect?.(e.target.value));
    for (const item of this.qAll(".rec-menu-item")) {
      this.bindEvent(item, "click", () => {
        this.toggleMenu(false);
        this.onDownload?.(item.dataset.kind);
      });
    }
    this.bindEvent(document, "mousedown", (e) => {
      if (!this.q(".rec-menu")?.classList.contains("hidden") && !e.target.closest(".rec-menu") && !e.target.closest(".rec-download-btn")) {
        this.toggleMenu(false);
      }
    });
    this.bindEvent(document, "keydown", (e) => {
      if (e.key === "Escape") this.toggleMenu(false);
    });
  }
  dispatch(action) {
    switch (action) {
      case "record":
        return this.onRecord?.();
      case "config":
        return this.onConfig?.();
      case "prev":
        return this.onSelectStep?.(-1);
      case "next":
        return this.onSelectStep?.(1);
      case "toggle":
        return this.onTogglePlay?.();
      case "reset":
        return this.onReset?.();
      case "download":
        return this.toggleMenu();
      case "expand": {
        this.expanded = !this.expanded;
        this.el.classList.toggle("rec-expanded", this.expanded);
        const btn = this.q(".rec-expand-btn");
        if (btn) {
          btn.innerHTML = this.expanded ? ICONS.collapse : ICONS.expand;
          btn.setAttribute("aria-expanded", String(this.expanded));
        }
        return void 0;
      }
      default:
        return void 0;
    }
  }
};

// js/modules/recording/recorderController.js
var RecorderController = class extends BaseController {
  createComponent(selector) {
    return new RecorderComponent(selector);
  }
  getProps() {
    const { status, transport, selected } = AppState.recorder;
    const recording = recordingStore.get(selected);
    return {
      status,
      transport,
      selected,
      recordings: recordingStore.list(),
      stemsAvailable: recording?.audioMode === "multitrack",
      // null = this take has no animation (the menu then names .mp4
      // for the disabled item)
      videoExtension: recording?.video?.extension ?? null
    };
  }
  bindComponentEvents() {
    const c = this.component;
    c.onRecord = () => RecordingActions.toggleRecord();
    c.onConfig = () => this.onOpenSettings?.();
    c.onSelect = (key) => RecordingActions.select(key);
    c.onSelectStep = (step) => RecordingActions.selectStep(step);
    c.onTogglePlay = () => RecordingActions.togglePlay();
    c.onReset = () => RecordingActions.reset();
    c.onDownload = (kind) => {
      if (kind === "wav") RecordingActions.downloadWav();
      else if (kind === "mid") RecordingActions.downloadMidi();
      else if (kind === "video") RecordingActions.downloadVideo();
      else RecordingActions.downloadBundle();
    };
  }
  bindExternalEvents() {
    document.addEventListener(RECORDER_CHANGED, () => {
      this.scheduleUpdate();
      this._syncTicker();
    });
    document.addEventListener(RECORDINGS_CHANGED, () => this.scheduleUpdate());
  }
  /**
   * Elapsed-time ticker: runs only while a take is armed/recording and
   * recomputes from the audio clock each tick, so a throttled background
   * page shows a stale number briefly but never a wrong one.
   */
  _syncTicker() {
    const active = AppState.recorder.status !== "idle";
    if (active && !this._ticker) {
      this._ticker = setInterval(() => {
        this.component.setElapsed(RecordingActions.recordingElapsed());
      }, 250);
    } else if (!active && this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  }
};

// js/modules/surfaces/ToolbarComponent.js
var ICONS2 = {
  trigger: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="6" height="6" rx="1.2"/><rect x="11" y="3" width="6" height="6" rx="1.2"/><rect x="3" y="11" width="6" height="6" rx="1.2"/><rect x="11" y="11" width="6" height="6" rx="1.2"/></svg>',
  source: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 10c2-6 4-6 6 0s4 6 6 0 2-6 3 0"/></svg>',
  gain: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 16V6M8 16v-3M12 16V9M16 16v-6"/></svg>',
  filter: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 7h7c2 0 3 1.5 4 4s2 5 3 5"/><path d="M3 16h14"/></svg>',
  sequence: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3V8h3v6h3V5h3v9h2"/></svg>',
  convolution: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 16V4M7.5 16V9M11 16v-4M14.5 16v-2.5M17.5 16v-1.5"/></svg>',
  adsr: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l3-11 3 6h5l3 5"/></svg>',
  presets: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/><path d="M8 5.5h4M5.5 8v4M14.5 8v4M8 14.5h4"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/></svg>'
};
var ICON_CHEVRON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 7.5l5 5"/></svg>';
var ToolbarComponent = class extends BaseComponent {
  constructor(selector) {
    super(selector);
    this.onSelect = null;
    this.onToggleCollapsed = null;
  }
  render({ surfaces, collapsed }) {
    this.el.innerHTML = "";
    for (const s of surfaces) {
      this.el.appendChild(this.button({
        id: s.id,
        label: s.label,
        title: s.title,
        pressed: s.showing,
        onClick: () => this.onSelect?.(s.id)
      }));
      if (s.dividerAfter) {
        const divider = document.createElement("span");
        divider.className = "surface-toolbar-divider";
        this.el.appendChild(divider);
      }
    }
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "surface-toolbar-collapse";
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.title = collapse.ariaLabel = collapsed ? "Show the toolbar" : "Hide the toolbar";
    collapse.innerHTML = ICON_CHEVRON;
    this.bindEvent(collapse, "click", () => this.onToggleCollapsed?.());
    this.el.appendChild(collapse);
  }
  button({ id, label, pressed, title, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "surface-toolbar-btn";
    btn.dataset.surface = id;
    btn.setAttribute("aria-pressed", String(pressed));
    btn.title = title || label;
    btn.innerHTML = ICONS2[id] || "";
    const text = document.createElement("span");
    text.className = "surface-toolbar-label";
    text.textContent = label;
    btn.appendChild(text);
    this.bindEvent(btn, "click", onClick);
    return btn;
  }
};

// js/modules/surfaces/SurfaceShellComponent.js
var WRAPPERS = ["#m4l-fundamental-source-panel", ".surface-stack", ".surface-side"];
var SurfaceShellComponent = class extends BaseComponent {
  render({ active, pinned, visibleRoots, allRoots }) {
    for (const id of allRoots) {
      const el = document.getElementById(id);
      if (el) el.hidden = !visibleRoots.has(id);
    }
    for (const sel of WRAPPERS) {
      const wrapper = document.querySelector(sel);
      if (!wrapper) continue;
      wrapper.hidden = [...wrapper.children].every((c) => c.hidden);
    }
    document.body.dataset.surface = active;
    document.body.classList.toggle("pinned", pinned !== null);
    document.body.classList.toggle("source-docked", pinned === "source");
    document.body.classList.toggle("trigger-docked", pinned === "trigger");
    window.dispatchEvent(new Event("resize"));
  }
};

// js/modules/surfaces/SideToggleComponent.js
var ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M12 3.5v13"/></svg>';
var SideToggleComponent = class extends BaseComponent {
  constructor(selector) {
    super(selector);
    this.onToggle = null;
    this.el.innerHTML = ICON;
    this.el.addEventListener("click", () => this.onToggle?.());
  }
  render({ open }) {
    const label = open ? "Hide the visualizations" : "Show the visualizations";
    this.el.setAttribute("aria-pressed", String(open));
    this.el.setAttribute("aria-label", label);
    this.el.title = label;
  }
};

// js/modules/surfaces/surfacesController.js
var SurfacesController = class extends BaseController {
  constructor(toolbarSelector, shellSelector, sideToggleSelector) {
    super(toolbarSelector);
    this.shell = new SurfaceShellComponent(shellSelector);
    this.collapsed = false;
    this.sideToggles = [...document.querySelectorAll(sideToggleSelector)].map((el) => {
      const toggle = new SideToggleComponent(el);
      toggle.onToggle = () => surfaceState.toggleSide();
      return toggle;
    });
  }
  createComponent(selector) {
    return new ToolbarComponent(selector);
  }
  getProps() {
    return {
      // A divider where the group changes: pins | main | pages
      surfaces: SURFACES.map((s, i) => ({ ...s, showing: surfaceState.showing(s.id), dividerAfter: SURFACES[i + 1] !== void 0 && SURFACES[i + 1].group !== s.group })),
      active: surfaceState.active,
      pinned: surfaceState.pinnedShown,
      collapsed: this.collapsed,
      visibleRoots: surfaceState.visibleRoots(),
      allRoots: surfaceState.allRoots()
    };
  }
  update() {
    const props = super.update();
    this.shell.render(props);
    for (const toggle of this.sideToggles) toggle.render({ open: surfaceState.side });
    return props;
  }
  bindComponentEvents() {
    this.component.onSelect = (id) => surfaceState.show(id);
    this.component.onToggleCollapsed = () => {
      this.collapsed = !this.collapsed;
      document.body.classList.toggle("toolbar-collapsed", this.collapsed);
      this.update();
    };
  }
  bindExternalEvents() {
    const applied = () => {
      this.update();
      flushHiddenControllers();
    };
    document.addEventListener(SURFACE_CHANGED, applied);
    document.addEventListener(LAYOUT_MODE_CHANGED, applied);
  }
};

// js/modules/inspector/InspectorComponent.js
var PULSE_MAX_HZ = 50;
var GATE_MODE_OPTIONS = PATTERNS.map((p) => ({ value: p.id, label: p.label }));
var ICON_PREV = "\u2039";
var ICON_NEXT = "\u203A";
var InspectorComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.writing = false;
    this.onStep = null;
  }
  render({ index, headerSlot, dialSize, scope }) {
    this.teardown();
    this.index = index;
    this.dialSize = dialSize;
    this.scope = scope;
    this.el.innerHTML = "";
    const root = document.createElement("div");
    root.className = "inspector";
    headerSlot.replaceChildren(this.buildHeader(index));
    root.appendChild(this.buildSections(index));
    this.el.appendChild(root);
  }
  /** Run `fn(i)` for every voice the gesture addresses, flagged as our own write. */
  apply(index, e, fn) {
    this.writing = true;
    try {
      for (const i of voiceTargets(index, e)) fn(i);
    } finally {
      this.writing = false;
    }
  }
  /**
   * A ranged value: on a shape gesture it sculpts `set` across every
   * voice (anchored on this one), else it goes to the addressed voices.
   * Flagged as our own write either way.
   */
  applyValue(index, e, { min, max, value }, set) {
    this.writing = true;
    try {
      if (shapeMode.isGesture(e)) shapeMode.applyParam(index, { min, max }, value, set);
      else for (const i of voiceTargets(index, e)) set(i, value);
    } finally {
      this.writing = false;
    }
  }
  buildHeader(index) {
    const header = document.createElement("div");
    header.className = "inspector-header";
    const ratio = AppState.currentSystem.ratios[index];
    const label = AppState.currentSystem.labels[index] || `#${index + 1}`;
    const freq = calculateFrequency(ratio);
    const title = document.createElement("h2");
    title.className = "inspector-title";
    this.titleVoiceEl = document.createElement("span");
    this.titleVoiceEl.className = "inspector-title-voice";
    this.titleDetailEl = document.createElement("span");
    this.titleDetailEl.className = "inspector-title-detail";
    title.append(this.titleVoiceEl, this.titleDetailEl);
    this._voiceTitle = `Sequence ${index + 1}`;
    this._voiceDetail = `${label} \xB7 ${freq.toFixed(freq >= 100 ? 1 : 2)} Hz`;
    this._voiceLabel = label;
    this.setScope(this.scope);
    header.append(
      this.iconButton({ html: ICON_PREV, label: "Previous overtone", cls: "inspector-step", onClick: () => this.onStep?.(-1) }),
      title,
      this.iconButton({ html: ICON_NEXT, label: "Next overtone", cls: "inspector-step", onClick: () => this.onStep?.(1) })
    );
    return header;
  }
  /**
   * Who an edit addresses: null = this voice; 'link' = every voice gets
   * the value; 'shape' = every voice, sculpted from this one.
   */
  setScope(scope) {
    this.scope = scope;
    if (!this.titleVoiceEl) return;
    this.titleVoiceEl.textContent = scope ? "All voices" : this._voiceTitle;
    this.titleDetailEl.textContent = scope === "link" ? `linked \xB7 editing ${this._voiceLabel}` : scope === "shape" ? `shaped from ${this._voiceLabel}` : this._voiceDetail;
  }
  iconButton({ html, label, cls, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.innerHTML = html;
    this.bindEvent(btn, "click", onClick);
    return btn;
  }
  buildSections(index) {
    const sections = document.createElement("div");
    sections.className = "inspector-sections";
    sections.append(
      this.buildGateSection(index),
      this.buildModulationSection(index),
      this.buildPulseSection(index)
    );
    return sections;
  }
  /**
   * Titled card. Content goes into `.sectionBody` — a column normally,
   * flowed into a row by the embed layout (170px leaves no vertical room).
   */
  section(titleText) {
    const el = document.createElement("section");
    el.className = "inspector-section";
    const h = document.createElement("h3");
    h.className = "inspector-section-title";
    h.textContent = titleText;
    const body = document.createElement("div");
    body.className = "inspector-section-body";
    el.append(h, body);
    el.sectionBody = body;
    return el;
  }
  // ---------------------------------------------------------------
  // Gate / sequence + modulation
  // ---------------------------------------------------------------
  buildGateSection(index) {
    const el = this.section("Sequence");
    const gate = OvertoneSignalActions.getGate(index);
    const applyGate = (e) => {
      this.apply(index, e, (i) => OvertoneSignalActions.setGate(i, { ...gate, seq: [...gate.seq || []] }));
    };
    const select = document.createElement("select");
    select.className = "control-select";
    for (const opt of GATE_MODE_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === gate.mode) o.selected = true;
      select.appendChild(o);
    }
    const params = document.createElement("div");
    params.className = "inspector-gate-params";
    const modeGroup = document.createElement("div");
    modeGroup.className = "inspector-gate-mode";
    modeGroup.append(this.selectStepper(select, "gate mode"), params);
    el.sectionBody.appendChild(modeGroup);
    const renderParams = () => {
      params.innerHTML = "";
      if (gate.mode === 4) {
        const lab = document.createElement("label");
        lab.className = "inspector-field";
        lab.textContent = "0/1 pattern";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "inspector-seq-input";
        input.placeholder = "e.g. 10110";
        input.value = (gate.seq || []).join("");
        input.addEventListener("input", (e) => {
          const clean = input.value.replace(/[^01]/g, "");
          if (clean !== input.value) input.value = clean;
          gate.seq = clean.split("").map(Number);
          applyGate(e);
        });
        lab.appendChild(input);
        params.appendChild(lab);
      } else {
        for (const { key, label, min, max, def, format } of patternParams(gate.mode)) {
          const dial = new Dial({
            min,
            max,
            step: 1,
            value: gate[key] ?? def,
            resetValue: def,
            size: this.dialSize,
            label,
            ...format ? { format } : {},
            fineOnShift: false,
            // shift = shape
            onChange: (v, e) => {
              gate[key] = v;
              if (shapeMode.isGesture(e)) {
                this.applyValue(index, e, { min, max, value: v }, (i, val) => OvertoneSignalActions.setGate(i, { ...OvertoneSignalActions.getGate(i), [key]: Math.round(val) }));
              } else {
                applyGate(e);
              }
            }
          });
          params.appendChild(dial.el);
        }
      }
    };
    select.addEventListener("change", (e) => {
      gate.mode = parseInt(select.value, 10);
      for (const { key, def } of patternParams(gate.mode)) gate[key] = def;
      renderParams();
      applyGate(e);
    });
    renderParams();
    el.sectionBody.append(this.buildShapeControls(index));
    return el;
  }
  /** The sequence's modulation depth per target. */
  buildModulationSection(index) {
    const el = this.section("Modulation");
    el.sectionBody.appendChild(this.buildTargetControls(index));
    return el;
  }
  /** Cycle contour: waveform selector (same options as the oscillator menu) + stretch. */
  buildShapeControls(index) {
    const wrap = document.createElement("div");
    wrap.className = "inspector-shape";
    const seq = OvertoneSignalActions.getSequencer(index);
    const select = document.createElement("select");
    select.className = "control-select";
    const source = document.getElementById("waveform-select");
    const options = source ? Array.from(source.options).filter((o) => !o.disabled) : [];
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.textContent;
      if (opt.value === seq.shape) o.selected = true;
      select.appendChild(o);
    }
    wrap.appendChild(this.selectStepper(select, "contour"));
    select.addEventListener("change", (e) => {
      this.apply(index, e, (i) => OvertoneSignalActions.setSequencerShape(i, select.value));
    });
    const lenRow = document.createElement("div");
    lenRow.className = "inspector-stretch-row";
    const lenLabel = document.createElement("span");
    lenLabel.className = "inspector-stretch-label";
    const fmt = (v) => v >= 1 ? `\xD7${v}` : `\xF7${1 / v}`;
    lenLabel.textContent = fmt(OvertoneSignalActions.getSequencer(index).stretch);
    const mkBtn = (text, factor) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "action-btn inspector-stretch-btn";
      b.textContent = text;
      b.addEventListener("click", (e) => {
        const next = OvertoneSignalActions.getSequencer(index).stretch * factor;
        this.apply(index, e, (i) => OvertoneSignalActions.setSequencerStretch(i, next));
        lenLabel.textContent = fmt(OvertoneSignalActions.getSequencer(index).stretch);
      });
      return b;
    };
    lenRow.append(mkBtn("\xF72", 0.5), lenLabel, mkBtn("\xD72", 2));
    wrap.appendChild(lenRow);
    return wrap;
  }
  /**
   * ‹ select › — next/previous buttons flanking a menu, the app's rule
   * for every select (native dropdowns don't open inside jweb). Stepping
   * wraps and fires the menu's own change handler.
   */
  selectStepper(select, what) {
    const wrap = document.createElement("div");
    wrap.className = "select-stepper";
    const step = (delta, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn select-step-btn";
      btn.textContent = delta < 0 ? "<-" : "->";
      btn.setAttribute("aria-label", `${label} ${what}`);
      this.bindEvent(btn, "click", (e) => {
        const n = select.options.length;
        if (!n) return;
        select.selectedIndex = (select.selectedIndex + delta + n) % n;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        e.currentTarget.focus();
      });
      return btn;
    };
    wrap.append(step(-1, "Previous"), select, step(1, "Next"));
    return wrap;
  }
  /** Modulation targets: amount sliders. */
  buildTargetControls(index) {
    const wrap = document.createElement("div");
    wrap.className = "inspector-targets";
    const seq = OvertoneSignalActions.getSequencer(index);
    const addAmount = (target, labelText, min, max) => {
      const row = document.createElement("label");
      row.className = "inspector-target-row";
      row.dataset.target = target;
      const label = document.createElement("span");
      label.className = "inspector-target-label";
      label.textContent = labelText;
      const input = document.createElement("input");
      input.type = "range";
      input.min = min;
      input.max = max;
      input.step = 0.01;
      input.value = seq.amounts[target];
      input.className = "inspector-target-slider";
      const value = document.createElement("span");
      value.className = "inspector-target-value";
      value.textContent = (+seq.amounts[target]).toFixed(2);
      input.addEventListener("input", (e) => {
        const v = parseFloat(input.value);
        this.applyValue(index, e, { min, max, value: v }, (i, val) => OvertoneSignalActions.setSequencerAmount(i, target, Math.round(val * 100) / 100));
        value.textContent = v.toFixed(2);
      });
      row.append(label, input, value);
      wrap.appendChild(row);
    };
    addAmount("gain", "gain", 0, 1);
    addAmount("freq", "filter freq", -1, 1);
    addAmount("res", "resonance", 0, 1);
    addAmount("wet", "conv wet/dry", 0, 1);
    addAmount("fb", "conv feedback", 0, 1);
    return wrap;
  }
  // ---------------------------------------------------------------
  // Pulse outputs (MIDI / OSC / clock)
  // ---------------------------------------------------------------
  buildPulseSection(index) {
    const el = this.section("Pulse Out");
    const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
    const rows = document.createElement("div");
    rows.className = "inspector-pulse-rows";
    el.sectionBody.appendChild(rows);
    const note = noteForVoice(index);
    const midiAvailable = midiOutputRouter.available;
    rows.appendChild(this.pulseRow({
      text: "MIDI out",
      detail: `note ${note} \xB7 ch ${pulseChannel()}${midiAvailable ? "" : " \xB7 no output available"}`,
      enabled: midiAvailable,
      value: OvertoneSignalActions.getPulseOut(index).midi,
      onToggle: (on, e) => this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { midi: on }))
    }));
    const oscAvailable = oscClient.isConnected();
    rows.appendChild(this.pulseRow({
      text: "OSC out",
      detail: oscAvailable ? `pulse ${index + 1} <cycle> <gate>` : "bridge offline",
      enabled: oscAvailable,
      value: OvertoneSignalActions.getPulseOut(index).osc,
      onToggle: (on, e) => this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { osc: on }))
    }));
    const offsetDetail = (on) => on ? "pulses land mid-cycle" : "pulses land on the cycle start";
    const offsetRow = this.pulseRow({
      text: "Offset pulse 50%",
      detail: offsetDetail(OvertoneSignalActions.getPulseOut(index).offset),
      enabled: true,
      value: OvertoneSignalActions.getPulseOut(index).offset,
      onToggle: (on, e) => {
        this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { offset: on }));
        offsetRow.querySelector(".inspector-pulse-detail").textContent = offsetDetail(on);
      }
    });
    rows.appendChild(offsetRow);
    const clockDetail = () => {
      const c = AppState.midiClockVoice;
      if (c !== null && c !== index) return `currently overtone ${c + 1}`;
      const correction = AppState.sourceMode === "oscillators" ? getFrequencyCorrection(AppState.currentWaveform) : 1;
      const hz = calculateFrequency(AppState.currentSystem.ratios[index]) * correction;
      if (!(hz > 0)) return "24 ticks per beat";
      const fold = clockFold(hz);
      const bpm = hz * 2 ** fold * 60;
      const tempo = `${bpm >= 100 ? bpm.toFixed(0) : bpm.toFixed(1)} BPM`;
      if (fold === 0) return `${tempo} \xB7 beat = cycle`;
      return fold < 0 ? `${tempo} \xB7 beat = ${2 ** -fold} cycles` : `${tempo} \xB7 ${2 ** fold} beats per cycle`;
    };
    const clockRow = this.pulseRow({
      text: "Output as MIDI clock",
      detail: clockDetail(),
      enabled: midiOutputRouter.available,
      value: AppState.midiClockVoice === index,
      onToggle: (on) => {
        this.writing = true;
        try {
          OvertoneSignalActions.setMidiClockVoice(on ? index : null);
        } finally {
          this.writing = false;
        }
        if (!on) midiOutputRouter.stopClock();
        clockRow.querySelector(".inspector-pulse-detail").textContent = clockDetail();
      }
    });
    rows.appendChild(clockRow);
    this.refreshClockDetail = () => {
      clockRow.querySelector(".inspector-pulse-detail").textContent = clockDetail();
    };
    if (voiceFreq > PULSE_MAX_HZ) {
      const warn = document.createElement("div");
      warn.className = "inspector-pulse-warning";
      warn.textContent = `MIDI/OSC pulses pause above ${PULSE_MAX_HZ} Hz \u2014 this voice is at ${Math.round(voiceFreq)} Hz (the clock keeps running)`;
      el.sectionBody.appendChild(warn);
    }
    return el;
  }
  /** Row: [toggle] label — detail. */
  pulseRow({ text, detail, enabled, value, onToggle }) {
    const row = document.createElement("div");
    row.className = "inspector-pulse-row";
    if (!enabled) row.classList.add("inspector-pulse-row-disabled");
    const toggle = document.createElement("div");
    toggle.className = "toggle-switch inspector-pulse-toggle";
    toggle.setAttribute("role", "switch");
    toggle.classList.toggle("active", Boolean(value));
    toggle.setAttribute("aria-checked", String(Boolean(value)));
    toggle.setAttribute("aria-label", text);
    if (enabled) {
      toggle.addEventListener("click", (e) => {
        const on = !toggle.classList.contains("active");
        toggle.classList.toggle("active", on);
        toggle.setAttribute("aria-checked", String(on));
        onToggle(on, e);
      });
    }
    const label = document.createElement("span");
    label.className = "inspector-pulse-label";
    label.textContent = text;
    const detailEl = document.createElement("span");
    detailEl.className = "inspector-pulse-detail";
    detailEl.textContent = detail;
    row.append(toggle, label, detailEl);
    return row;
  }
  teardown() {
    super.teardown();
    this._redrawSeqPreview = null;
  }
};

// js/modules/inspector/inspectorController.js
var InspectorController = class extends BaseController {
  /**
   * @param {string} selector        the panel's editor area
   * @param {HTMLElement} headerSlot where the voice stepper mounts (the
   *   panel's bottom toolbar slot)
   */
  constructor(selector, headerSlot) {
    super(selector);
    this.headerSlot = headerSlot;
  }
  createComponent(selector) {
    return new InspectorComponent(selector);
  }
  getProps() {
    return {
      index: inspectorState.index,
      headerSlot: this.headerSlot,
      dialSize: layoutMode.coarse ? 52 : 36,
      scope: this.scope()
    };
  }
  /** Who an edit addresses right now: 'shape' | 'link' | null (the lock, or its held key). */
  scope() {
    if (shapeMode.on || shapeMode.held) return "shape";
    if (linkLock.on || linkLock.held) return "link";
    return null;
  }
  update() {
    if (!surfaceState.showing("sequence")) {
      this.component.teardown();
      this.component.el.innerHTML = "";
      this.headerSlot.replaceChildren();
      return null;
    }
    return super.update();
  }
  bindComponentEvents() {
    this.component.onStep = (delta) => inspectorState.step(delta);
  }
  bindExternalEvents() {
    document.addEventListener(INSPECTOR_CHANGED, () => this.update());
    document.addEventListener(SURFACE_CHANGED, () => this.update());
    document.addEventListener(LAYOUT_MODE_CHANGED, () => this.update());
    const syncScope = () => this.component.setScope(this.scope());
    document.addEventListener(LINK_ALL_CHANGED, syncScope);
    document.addEventListener(SHAPE_MODE_CHANGED, syncScope);
    document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(MIDI_PORTS_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(FUNDAMENTAL_CHANGED, () => this.component.refreshClockDetail?.());
    document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
      if (this.component.writing) return;
      if (e.detail?.index !== inspectorState.index) return;
      this.scheduleUpdate();
    });
  }
};

// js/modules/pads/PadGridComponent.js
var PadGridComponent = class extends BaseComponent {
  constructor(target) {
    super(target);
    this.onAttack = null;
    this.onRelease = null;
    this.onSetFundamental = null;
    this.setFundamental = false;
    this._held = /* @__PURE__ */ new Set();
    this._pads = [];
    this._levelRaf = null;
  }
  render({ voices, envelopeMode, keyHints = [], levelOf = null, setFundamental = false }) {
    this.teardown();
    this.el.innerHTML = "";
    this.setFundamental = Boolean(setFundamental);
    this.el.classList.toggle("pad-grid-set-fundamental", this.setFundamental);
    this.el.classList.toggle("pad-grid-inactive", envelopeMode !== "adsr" && !this.setFundamental);
    this._pads = voices.map((v, i) => this.createPad(i, v, keyHints[i]));
    this._pads.forEach((p) => this.el.appendChild(p));
    this._levelOf = levelOf;
    this.startLevelLoop();
  }
  createPad(index, { label, hz, gain }, keyHint) {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "trigger-pad";
    pad.style.setProperty("--pad-color", partialColor(this._ratioOf(index)));
    pad.setAttribute("aria-label", `Overtone ${index + 1} (${label})`);
    pad.dataset.index = index;
    const name = document.createElement("span");
    name.className = "trigger-pad-label";
    name.textContent = label;
    const detail = document.createElement("span");
    detail.className = "trigger-pad-hz";
    const freq = document.createElement("span");
    freq.textContent = hz;
    const level = document.createElement("span");
    level.className = "trigger-pad-gain";
    level.textContent = gain;
    const sep = document.createElement("span");
    sep.className = "trigger-pad-sep";
    sep.textContent = " - ";
    detail.append(freq, sep, level);
    pad.append(name, detail);
    if (keyHint) {
      const key = document.createElement("span");
      key.className = "trigger-pad-key";
      key.textContent = keyHint;
      pad.appendChild(key);
    }
    const release = () => {
      if (!this._held.has(index)) return;
      this._held.delete(index);
      pad.classList.remove("held");
      this.onRelease?.(index);
    };
    const openMenu = (x, y) => {
      release();
      openOvertoneMenu(index, x, y);
    };
    this.bindEvent(pad, "pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (this.setFundamental) {
        this.onSetFundamental?.(index);
        return;
      }
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
      }
      this._held.add(index);
      pad.classList.add("held");
      this.onAttack?.(index);
      pad.addEventListener("pointerup", release, { once: true });
      pad.addEventListener("pointercancel", release, { once: true });
    });
    this.bindEvent(pad, "contextmenu", (e) => {
      e.preventDefault();
      if (isTouchContextMenu(e)) return;
      openMenu(e.clientX, e.clientY);
    });
    pad._release = release;
    return pad;
  }
  _ratioOf(index) {
    return this._ratios?.[index] ?? index + 1;
  }
  /** Per-frame level glow: --pad-level 0..1 from the voice meter. */
  startLevelLoop() {
    if (this._levelRaf) cancelAnimationFrame(this._levelRaf);
    if (!this._levelOf) return;
    const tick = () => {
      for (const pad of this._pads) {
        const level = Math.min(1, this._levelOf(Number(pad.dataset.index)) * 2.5);
        pad.style.setProperty("--pad-level", level.toFixed(3));
      }
      this._levelRaf = requestAnimationFrame(tick);
    };
    this._levelRaf = requestAnimationFrame(tick);
  }
  /** Let go of everything — a re-render must never strand a gated voice. */
  releaseAll() {
    for (const pad of this._pads) pad._release?.();
    this._held.clear();
  }
  /** A drawbar moved: rewrite that pad's level in place (a re-render would release held pads). */
  setGain(index, text) {
    const level = this._pads?.[index]?.querySelector(".trigger-pad-gain");
    if (level) level.textContent = text;
  }
  teardown() {
    this.releaseAll();
    if (this._levelRaf) {
      cancelAnimationFrame(this._levelRaf);
      this._levelRaf = null;
    }
    super.teardown();
  }
};

// js/modules/pads/padGridController.js
var MODE_TOGGLE_ID = "pad-fundamental-toggle";
var gainText = (index) => `${Math.round((AppState.harmonicAmplitudes[index] || 0) * 100)}%`;
var LOOP_TOGGLE_ID = "pad-loop-toggle";
var PadGridController = class extends BaseController {
  constructor(...args) {
    super(...args);
    this.setFundamental = false;
  }
  createComponent(selector) {
    return new PadGridComponent(selector);
  }
  getProps() {
    const sys = AppState.currentSystem;
    const labels = AppState.isSubharmonic && sys.subharmonicLabels ? sys.subharmonicLabels : sys.labels;
    const voices = sys.ratios.map((ratio, i) => ({
      label: labels[i] || `#${i + 1}`,
      hz: formatHz(calculateFrequency(ratio)),
      gain: gainText(i)
    }));
    return {
      voices,
      envelopeMode: OvertoneSignalActions.getEnvelopeMode(),
      keyHints: TRIGGER_KEY_LABELS,
      levelOf: getVoiceLevel,
      setFundamental: this.setFundamental
    };
  }
  update() {
    this.component._ratios = AppState.currentSystem.ratios;
    return super.update();
  }
  bindComponentEvents() {
    this.component.onAttack = (index) => triggerHarmonicAttack(index);
    this.component.onRelease = (index) => triggerHarmonicRelease(index);
    this.component.onSetFundamental = (index) => DrawbarsActions.setDrawbarAsFundamental(index);
  }
  /** The header's toggle: what a pad tap does. */
  bindModeToggle() {
    const btn = document.getElementById(MODE_TOGGLE_ID);
    if (!btn) return;
    btn.addEventListener("click", () => {
      this.setFundamental = !this.setFundamental;
      btn.setAttribute("aria-pressed", String(this.setFundamental));
      this.update();
    });
  }
  /**
   * "Loop Samples": loop the sound file, or play it once per trigger.
   * Disabled outside sound-file mode (the app's rule — inapplicable
   * controls stay, grayed); the state is synth state (bridged, preset).
   */
  bindLoopToggle() {
    const btn = document.getElementById(LOOP_TOGGLE_ID);
    if (!btn) return;
    const sync2 = () => {
      btn.setAttribute("aria-pressed", String(AppState.soundfileLoop));
      btn.disabled = AppState.sourceMode !== "soundfile";
    };
    btn.addEventListener("click", () => SourceActions.setSoundfileLoop(!AppState.soundfileLoop));
    document.addEventListener(SOURCE_CHANGED, sync2);
    sync2();
  }
  bindExternalEvents() {
    this.bindModeToggle();
    this.bindLoopToggle();
    document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(SUBHARMONIC_TOGGLED, () => this.scheduleUpdate());
    document.addEventListener(FUNDAMENTAL_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(ENVELOPE_MODE_CHANGED, () => this.scheduleUpdate());
    document.addEventListener(DRAWBAR_CHANGE, (e) => {
      const { index } = e.detail || {};
      if (index !== void 0) this.component.setGain(index, gainText(index));
    });
    for (const evt of [DRAWBARS_RESET, DRAWBARS_RANDOMIZED]) {
      document.addEventListener(evt, () => this.scheduleUpdate());
    }
  }
};

// js/modules/envelopeMode/EnvelopeModeToggleComponent.js
var EnvelopeModeToggleComponent = class extends BaseComponent {
  render({ mode } = {}) {
    this.teardown();
    this.el.innerHTML = "";
    const isAdsr = mode === "adsr";
    const label = document.createElement("span");
    label.className = "toggle-label active envelope-mode-label";
    label.textContent = isAdsr ? "Trigger" : "Drone";
    const toggle = document.createElement("div");
    toggle.className = "toggle-switch envelope-mode-switch";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(isAdsr));
    toggle.setAttribute("aria-label", "Envelope mode: trigger or drone");
    toggle.classList.toggle("active", isAdsr);
    this.el.appendChild(label);
    this.el.appendChild(toggle);
    this.bindEvent(toggle, "click", () => this.onToggle?.());
  }
};

// js/modules/envelopeMode/envelopeModeController.js
var EnvelopeModeController = class extends BaseController {
  createComponent(selector) {
    return new EnvelopeModeToggleComponent(selector);
  }
  getProps() {
    return { mode: OvertoneSignalActions.getEnvelopeMode() };
  }
  bindComponentEvents() {
    this.component.onToggle = () => {
      const mode = OvertoneSignalActions.getEnvelopeMode();
      OvertoneSignalActions.setEnvelopeMode(mode === "adsr" ? "open" : "adsr");
    };
  }
  bindExternalEvents() {
    document.addEventListener(ENVELOPE_MODE_CHANGED, () => this.update());
  }
};

// js/ui.js
function initUI() {
  setupMainButtons();
  setupControlSliders();
  setupWaveformSelector();
  setupSelectSteppers();
  setupDrawbars();
  setupSpectralSystem();
  setupVisualizations();
  setupFundamental();
  setupSurfaces();
  new KeyboardShortcuts().init();
  initLinkAll();
  initShapeMode();
  if (oscEnabled()) {
    oscClient.init();
  }
  setupPulseOutputs();
  setTimeout(() => {
    midiInputRouter.init();
    midiOutputRouter.init();
  }, 2e3);
}
function setupPulseOutputs() {
  setPulseHandler((index, pulse) => pulseBus.dispatch(index, pulse));
  pulseBus.addSink((index, pulse) => {
    const oscOn = AppState.oscillatorPulseOuts[index]?.osc ?? midiConfig.pulseOscEnabled;
    if (oscOn && pulse.gateOn) {
      oscClient.emitPulse(index, pulse);
    }
  });
}
function setupDrawbars() {
  const drawbarsController = new DrawbarsController("#drawbars");
  drawbarsController.init();
  new OvertoneToolbarController("#drawbars-toolbar", {
    onReset: () => drawbarsController.reset(),
    onRandomize: () => drawbarsController.randomize()
  }).init();
}
function setupSpectralSystem() {
  new SpectralSystemController("#spectral-system-root").init();
  new TonewheelController("#tonewheel-container").init();
}
function setupVisualizations() {
  new WaveformController("#waveform-canvas-area").init();
  new DownloadControlController("#routing-control-root").init();
  new ScopeController("#scope-canvas-area").init();
  new EnvelopeVizController("#envelope-canvas-area").init();
  new SequenceVizController("#sequence-canvas-area").init();
}
function setupFundamental() {
  new FundamentalController("#fundamental-control-root").init();
  new PadGridController("#pad-grid").init();
}
function setupSurfaces() {
  new SurfacesController("#surface-toolbar", ".page-content", ".side-toggle-btn").init();
  new OvertoneToolbarController("#sequence-toolbar", {
    onReset: () => OvertoneSignalActions.resetGates(),
    onRandomize: () => OvertoneSignalActions.randomizeGates()
  }).init();
  new InspectorController("#sequence-inspector", document.getElementById("sequence-voice")).init();
  document.addEventListener(SURFACE_CHANGED, () => {
    if (surfaceState.tools) return;
    shapeMode.reset();
    linkLock.set(false);
  });
  initPresets();
  document.addEventListener(SURFACE_CHANGED, () => mountPanelFor(surfaceState.active));
}
var LAZY_PANELS = {
  presets: async () => {
    const [{ PresetsController }, { PresetsComponent }] = await Promise.all([
      import("./chunks/presetsController-RLR27WKI.js"),
      import("./chunks/PresetsComponent-RC5ROD5N.js")
    ]);
    new PresetsController("#presets-control-root", PresetsComponent).init();
  },
  // Settings owns its own mount (settingsSurface.js), because the things
  // that open it are modules ui.js itself imports
  settings: () => mountSettings()
};
var mounted = /* @__PURE__ */ new Map();
function mountPanelFor(surfaceId) {
  const mount = LAZY_PANELS[surfaceId];
  if (!mount) return Promise.resolve();
  if (!mounted.has(surfaceId)) mounted.set(surfaceId, mount());
  return mounted.get(surfaceId);
}
function setupMainButtons() {
  new PlayToggleController(".play-toggle-container").init();
  setupEnvelopeMode();
  const recorder = new RecorderController("#recorder-root");
  recorder.onOpenSettings = () => openSettings("recorder");
  recorder.init();
}
function setupEnvelopeMode() {
  new EnvelopeModeController("#navbar-mode-root").init();
  const sync2 = () => {
    document.body.classList.toggle("adsr-mode", OvertoneSignalActions.getEnvelopeMode() === "adsr");
  };
  document.addEventListener(ENVELOPE_MODE_CHANGED, sync2);
  sync2();
}
function setupControlSliders() {
  const gainSlider = new SliderController("#master-gain-slider-root", {
    min: 0,
    max: 1,
    step: 0.01,
    value: AppState.masterGainValue,
    label: "Gain",
    ariaLabel: "Master gain",
    formatValue: (v) => `${(v * 100).toFixed(0)}%`
  }, (value) => {
    smoothUpdateMasterGain(value);
  });
  gainSlider.init();
  const slewSlider = new SliderController("#master-slew-slider-root", {
    min: 0,
    max: 10,
    step: 0.01,
    value: AppState.masterSlewValue,
    label: "Slew",
    ariaLabel: "Master slew",
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
    document.dispatchEvent(new CustomEvent(MASTER_SLEW_CHANGED, { detail: { value } }));
  });
  slewSlider.init();
  const follow = (slider, read) => () => {
    if (Math.abs(parseFloat(slider.component.input.value) - read()) > 1e-9) slider.setValue(read());
  };
  document.addEventListener(MASTER_GAIN_CHANGED, follow(gainSlider, () => AppState.masterGainValue));
  document.addEventListener(MASTER_SLEW_CHANGED, follow(slewSlider, () => AppState.masterSlewValue));
  new MasterRailController(
    "#master-rail",
    ".navbar-section.center",
    ["#master-gain-slider-root", "#master-slew-slider-root"]
  ).init();
}
function setupWaveformSelector() {
  new SourceController("#oscillator-control-root").init();
  new WaveformController("#current-waveform-canvas-area", { mode: "single" }).init();
  new SpectrumController("#spectrum-canvas-area").init();
  new WaveformSelectorController("#waveform-select").init();
}
function setupSelectSteppers() {
  document.querySelectorAll(".select-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const select = document.getElementById(btn.dataset.target);
      if (!select || select.options.length === 0) return;
      const step = parseInt(btn.dataset.step, 10) || 1;
      const count = select.options.length;
      const skip = (option) => option.disabled || option.dataset.role === "action";
      let index = select.selectedIndex;
      for (let taken = 0; taken < count; taken++) {
        index = (index + step + count) % count;
        if (!skip(select.options[index])) {
          select.selectedIndex = index;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    });
  });
}
function updateUI() {
  updateValue("waveform-select", AppState.waveformMorph ? "" : AppState.currentWaveform);
}

// js/modules/favicon/faviconService.js
var DESKTOP_INTERVAL_MS = 100;
var MOBILE_INTERVAL_MS = 2e3;
var SIZE = 64;
var FaviconService = class {
  constructor() {
    this.interval = null;
    this.faviconId = "dynamic-favicon";
    this.scratch = null;
    this.ctx = null;
    this.imageData = null;
  }
  /**
   * Follow the sound: the icon animates only while the synth is playing.
   * Nothing is drawn (and no timer runs) before the first Play, which
   * keeps page load and an idle tab free of it entirely.
   */
  init() {
    document.addEventListener(PLAY_STATE_CHANGED, (e) => {
      if (e.detail?.isPlaying) this.start();
      else this.stop();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else if (this.playing) this.start();
    });
  }
  get playing() {
    return Boolean(this._playing);
  }
  start() {
    this._playing = true;
    if (this.interval || document.hidden) return;
    const period = layoutMode.coarse ? MOBILE_INTERVAL_MS : DESKTOP_INTERVAL_MS;
    this.updateFavicon();
    this.interval = setInterval(() => this.updateFavicon(), period);
  }
  stop(playing = false) {
    this._playing = playing;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  updateFavicon() {
    const canvas = document.querySelector("#tonewheel-container canvas");
    if (!canvas || !canvas.width) return;
    try {
      if (!this.scratch) {
        this.scratch = document.createElement("canvas");
        this.scratch.width = this.scratch.height = SIZE;
        this.ctx = this.scratch.getContext("2d", { willReadFrequently: true });
      }
      const ctx = this.ctx;
      const cropW = canvas.width * 0.5;
      const cropH = canvas.height * 0.5;
      ctx.drawImage(canvas, canvas.width * 0.25, canvas.height * 0.25, cropW, cropH, 0, 0, SIZE, SIZE);
      const image = ctx.getImageData(0, 0, SIZE, SIZE);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const lifted = Math.min(255, data[i + c] + 50);
          data[i + c] = Math.max(0, Math.min(255, 128 + 2 * (lifted - 128)));
        }
      }
      ctx.putImageData(image, 0, 0);
      this.setFavicon(this.scratch.toDataURL("image/png"));
    } catch {
    }
  }
  setFavicon(dataUrl) {
    let link = document.getElementById(this.faviconId);
    if (!link) {
      for (const l of document.querySelectorAll('link[rel~="icon"]')) l.remove();
      link = document.createElement("link");
      link.id = this.faviconId;
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  }
};
var faviconService = new FaviconService();

// js/modules/assets/assetsBoot.js
async function restoreLibrary() {
  try {
    const wavetableManager = getWavetableManager();
    const counts = await restore(wavetableManager);
    restoreWaveformOptions(wavetableManager);
    if (counts.irs > 0) document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
    return counts;
  } catch (err) {
    console.warn("[assets] could not restore the library:", err.message);
    return { waves: 0, irs: 0 };
  }
}

// js/app.js
var BOOT_REVEAL_MS = 2e3;
async function initApp() {
  try {
    loadAppConfig();
    await restoreLibrary();
    if (oscEnabled()) {
      await oscClient.bootstrap();
    }
    initUI();
    faviconService.init();
    updateUI();
  } catch (error) {
    console.error("Failed to initialize application:", error);
    showStatus("Failed to initialize application. Please refresh the page.", "error");
  } finally {
    document.documentElement.classList.remove("booting");
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
    if (audioEngine.context && audioEngine.context.state !== "closed") {
      audioEngine.context.close();
    }
    console.log("Application cleaned up successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}
function hasUnsavedWork() {
  return AppState.isPlaying || AppState.recorder.status !== "idle" || recordingStore.list().length > 0 || assetStore.ephemeral && irManager.list().length > 0;
}
function confirmClose(event) {
  if (!hasUnsavedWork()) return;
  event.preventDefault();
  event.returnValue = "";
}
function setupCleanup() {
  window.addEventListener("beforeunload", confirmClose);
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
  setTimeout(() => document.documentElement.classList.remove("booting"), BOOT_REVEAL_MS);
  if (!checkCompatibility()) {
    document.documentElement.classList.remove("booting");
    return;
  }
  setupCleanup();
  layoutMode.init();
  initApp();
}
window.TWIG = {
  // State access
  getState: () => AppState,
  getAudioCtx: () => audioEngine.context,
  getAudioEngine: () => audioEngine,
  getIRManager: () => irManager,
  assets: assetStore,
  getSourceManager: () => sourceManager,
  getRecordingStore: () => recordingStore,
  recorder: RecordingActions,
  getAppConfig: () => ({ midiConfig, recorderConfig, soundfileConfig }),
  midiConfigActions: midiConfigActions_exports,
  presets: PresetActions,
  // Per-cycle voice pulses (subaudible clock taps): subscribe(voiceIndex |
  // '*', fn(index, {cycle, gateOn, frequency, audioTime})) → unsubscribe fn
  pulses: {
    subscribe: (voice, fn) => pulseBus.subscribe(voice, fn)
  },
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
