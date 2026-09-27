import {
  DRAWBARS_RESET,
  ENVELOPE_MODE_CHANGED,
  FUNDAMENTAL_CHANGED,
  IR_RING_CHANGED,
  LAYOUT_MODE_CHANGED,
  LIBRARY_CHANGED,
  MASTER_GAIN_CHANGED,
  MASTER_SLEW_CHANGED,
  MAX_FILTER_PARTIALS,
  OVERTONE_SIGNAL_CHANGED,
  PRESETS_CHANGED,
  SOURCE_CHANGED,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED,
  SURFACE_CHANGED,
  addWaveformToAudio,
  audioEngine,
  buildCurrentSpectrum,
  calculateFrequency,
  freqToMidi,
  generateFilenameParts,
  getVoicePan,
  getWavetableManager,
  harmonicEnvelopeLevel,
  harmonicFilterCutoff,
  harmonicWaveformPayload,
  irManager,
  midiConfig,
  persistAppConfig,
  precomputeWaveTable,
  presetConfig,
  restartAudio,
  showStatus,
  updateAllHarmonicEnvelopeModes,
  updateAllHarmonicWaveforms,
  updateAudioProperties,
  updateHarmonicConvolution,
  updateHarmonicDrive,
  updateHarmonicFilter,
  updateHarmonicGate,
  updateHarmonicPan,
  updateHarmonicPulse,
  updateHarmonicSequencer
} from "./chunk-YSWKRLK7.js";
import {
  AppState,
  CANVAS_HEIGHT_RATIOS,
  COMPRESS_A_MAX,
  COMPRESS_A_MIN,
  DEFAULT_COMPRESS_A,
  DEFAULT_FILTER_TYPE,
  DEFAULT_FUNDAMENTAL,
  DEFAULT_MASTER_GAIN,
  DEFAULT_MASTER_SLEW,
  DEFAULT_STIFFNESS_B,
  DEFAULT_STRETCH_A,
  DEFAULT_TUBE_CLOSEDNESS,
  ENVELOPE_DEFAULTS,
  FILTER_TYPES,
  IR_RING_MAX_SECONDS,
  START_HARMONIC_MAX,
  STIFFNESS_B_MAX,
  STRETCH_A_MAX,
  STRETCH_A_MIN,
  setCurrentSystem,
  spectralSystems,
  updateAppState
} from "./chunk-ZE2D7APW.js";

// js/consonance.js
var REL_TOLERANCE = 4e-3;
var MAX_DENOMINATOR = 32;
var MAX_HEIGHT = Math.log2(2 * MAX_DENOMINATOR * MAX_DENOMINATOR);
function octaveReduce(ratio) {
  let r = ratio;
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  return r;
}
function bestRational(x, maxDen, tolerance) {
  let h0 = 1, k0 = 0;
  let h1 = Math.floor(x), k1 = 1;
  let frac = x - Math.floor(x);
  for (let i = 0; i < 24; i++) {
    if (Math.abs(h1 / k1 - x) / x <= tolerance) return [h1, k1];
    if (frac < 1e-12) break;
    const a = Math.floor(1 / frac);
    frac = 1 / frac - a;
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1;
    k0 = k1;
    h1 = h2;
    k1 = k2;
  }
  return null;
}
function consonance(ratio) {
  if (!(ratio > 0) || !isFinite(ratio)) return 0;
  const reduced = octaveReduce(ratio);
  const approx = bestRational(reduced, MAX_DENOMINATOR, REL_TOLERANCE);
  if (!approx) return 0;
  const [p, q] = approx;
  const height = Math.log2(p * q);
  return Math.max(0, 1 - height / MAX_HEIGHT);
}

// js/theme.js
var HARMONIC_COLOR_COUNT = 12;
var cache = /* @__PURE__ */ new Map();
function themeColor(token) {
  let value = cache.get(token);
  if (value === void 0) {
    value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    cache.set(token, value);
  }
  return value;
}
function themeNumber(token) {
  return parseFloat(themeColor(token));
}
function partialColor(ratio) {
  const key = `partial:${ratio}`;
  let color = cache.get(key);
  if (color === void 0) {
    const step = 1 + Math.round(consonance(ratio) * (HARMONIC_COLOR_COUNT - 1));
    color = themeColor(`--harmonic-${step}`);
    cache.set(key, color);
  }
  return color;
}

// js/modules/layout/layoutMode.js
var NARROW_QUERY = "(max-width: 85rem)";
var ROOMY_QUERY = "(min-height: 49rem) and (min-width: 85.01rem), (min-height: 51.5rem) and (min-width: 68.75rem)";
var state = { shell: "surfaces", coarse: false, narrow: false, roomy: false };
function queryFlag(name) {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null) return null;
  return raw !== "0" && raw !== "false";
}
function detect() {
  const embed = queryFlag("embed") ?? (window.innerHeight > 0 && window.innerHeight <= themeNumber("--embed-max-height"));
  const coarse = queryFlag("coarse") ?? window.matchMedia("(pointer: coarse)").matches;
  const narrow = !embed && window.matchMedia(NARROW_QUERY).matches;
  const roomy = embed || window.matchMedia(ROOMY_QUERY).matches;
  return { shell: embed ? "embed" : "surfaces", coarse, narrow, roomy };
}
function apply(next) {
  const changed = Object.keys(next).some((key) => next[key] !== state[key]);
  Object.assign(state, next);
  document.body.classList.toggle("embed", state.shell === "embed");
  document.body.classList.toggle("surfaces", state.shell === "surfaces");
  document.body.classList.toggle("coarse", state.coarse);
  document.body.classList.toggle("narrow", state.narrow);
  if (changed) {
    document.dispatchEvent(new CustomEvent(LAYOUT_MODE_CHANGED, { detail: { ...state } }));
  }
}
var layoutMode = {
  /** Detect and apply now; call before components measure their containers. */
  init() {
    apply(detect());
    window.addEventListener("resize", () => apply(detect()));
    window.matchMedia("(pointer: coarse)").addEventListener("change", () => apply(detect()));
  },
  get shell() {
    return state.shell;
  },
  get coarse() {
    return state.coarse;
  },
  get narrow() {
    return state.narrow;
  },
  get roomy() {
    return state.roomy;
  },
  get isEmbed() {
    return state.shell === "embed";
  }
};

// js/modules/generic/sketch/Sketch.js
var FIT = {
  /** The container's box (the waveform previews stretch with their panel). */
  BOX: "box",
  /** A square of the container's smaller side (the tonewheel is a circle). */
  SQUARE: "square"
};
var Sketch = class {
  /**
   * @param {HTMLElement} container - The canvas is appended here
   * @param {Object} opts
   * @param {function(CanvasRenderingContext2D, Sketch)} opts.draw - One frame
   * @param {string} [opts.fit=FIT.BOX] - See FIT
   * @param {boolean} [opts.loop=true] - Animate; false draws only on redraw()
   * @param {number} [opts.fallbackSize=0] - Size to use while the container measures 0
   * @param {number} [opts.pixelRatio=0] - Backing-store scale instead of
   *   the screen's devicePixelRatio (video export renders the same
   *   drawing, in the same CSS-pixel space, at a chosen resolution)
   */
  constructor(container, { draw, fit = FIT.BOX, loop = true, fallbackSize = 0, pixelRatio = 0 }) {
    this.container = container;
    this.drawFrame = draw;
    this.fit = fit;
    this.looping = loop;
    this.fallbackSize = fallbackSize;
    this.pixelRatio = pixelRatio;
    this.frameCount = 0;
    this.width = 0;
    this.height = 0;
    this._raf = null;
    this._pending = false;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.lineCap = "round";
    container.appendChild(this.canvas);
    this._observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (this._raf === null) requestAnimationFrame(() => this.resize());
    }) : null;
    this._observer?.observe(container);
    this._onWindowResize = () => this.resize();
    window.addEventListener("resize", this._onWindowResize);
    this.resize();
    if (loop) this.start();
    else this.redraw();
  }
  /** Measure the container and re-fit the canvas; redraws when stopped. */
  resize() {
    const box = this.measure();
    if (box.width <= 0 || box.height <= 0) return;
    const dpr = this.pixelRatio || window.devicePixelRatio || 1;
    const changed = box.width !== this.width || box.height !== this.height || dpr !== this._dpr;
    this.width = box.width;
    this.height = box.height;
    this._dpr = dpr;
    if (changed) {
      this.canvas.width = Math.round(box.width * dpr);
      this.canvas.height = Math.round(box.height * dpr);
      this.canvas.style.setProperty("width", `${box.width}px`, "important");
      this.canvas.style.setProperty("height", `${box.height}px`, "important");
      this.onResize?.(this);
      if (!this.looping) this.redraw();
    }
  }
  measure() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (this.fit === FIT.SQUARE) {
      const size = w > 0 && h > 0 ? Math.min(w, h) : w || h || this.fallbackSize;
      return { width: size, height: size };
    }
    return { width: w || this.fallbackSize, height: h || this.fallbackSize };
  }
  /** Draw one frame now (the only path that paints). */
  render() {
    if (this.width <= 0 || this.height <= 0) return;
    const { ctx } = this;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.lineCap = "round";
    this.frameCount++;
    this.drawFrame(ctx, this);
  }
  /** Draw once, coalesced onto the next frame (for a stopped sketch). */
  redraw() {
    if (this.looping || this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.render();
    });
  }
  start() {
    if (this._raf !== null) return;
    this.looping = true;
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.render();
    };
    this._raf = requestAnimationFrame(tick);
  }
  stop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.looping = false;
  }
  destroy() {
    this.stop();
    this._observer?.disconnect();
    window.removeEventListener("resize", this._onWindowResize);
    this.canvas.remove();
  }
};
function strokeClosedPath(ctx, points) {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.stroke();
}
function strokePath(ctx, points) {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
}
var alphaCache = /* @__PURE__ */ new Map();
function withAlpha(color, alpha) {
  const key = `${color}|${alpha.toFixed(3)}`;
  let out = alphaCache.get(key);
  if (out === void 0) {
    out = toRgba(color, alpha);
    alphaCache.set(key, out);
  }
  return out;
}
var probeCtx = null;
function toRgba(color, alpha) {
  probeCtx = probeCtx || document.createElement("canvas").getContext("2d");
  probeCtx.fillStyle = "#000";
  probeCtx.fillStyle = color;
  const resolved = probeCtx.fillStyle;
  if (resolved.startsWith("#")) {
    const n = parseInt(resolved.slice(1), 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
  }
  const parts = resolved.match(/[\d.]+/g) || [0, 0, 0];
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

// js/modules/tonewheel/tonewheelActions.js
var spreadFactor = 1;
var baseRadius;
var maxAmplitudeRadial;
var baseRadiusRatio = 0.08;
var sketch = null;
var FILM_LOGICAL_SIZE = 360;
var TonewheelActions = {
  /** Build the tonewheel sketch inside #tonewheel-canvas and start it. */
  initVisualization() {
    const container = document.getElementById("tonewheel-canvas");
    if (!container) return null;
    sketch?.destroy();
    sketch = new Sketch(container, {
      draw: drawTonewheel,
      fit: FIT.SQUARE,
      fallbackSize: window.innerWidth < 640 ? 320 : 800
    });
    return sketch;
  },
  /**
   * A SECOND tonewheel for video export: the same drawing, off screen,
   * with a backing store of `pixels` square. It runs its own frame loop
   * (so it advances its rotation exactly as the visible one does) and is
   * never the page's sketch — the on-screen wheel keeps animating.
   * @param {number} pixels - Square export resolution
   * @returns {{canvas: HTMLCanvasElement, dispose: function}}
   */
  createFilmSketch(pixels) {
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:-20000px;top:0;width:${FILM_LOGICAL_SIZE}px;height:${FILM_LOGICAL_SIZE}px;pointer-events:none;`;
    document.body.appendChild(box);
    const film = new Sketch(box, {
      draw: drawTonewheel,
      fit: FIT.SQUARE,
      pixelRatio: pixels / FILM_LOGICAL_SIZE
    });
    return {
      canvas: film.canvas,
      dispose() {
        film.destroy();
        box.remove();
      }
    };
  },
  setVisualizationFrequency(freq) {
    updateAppState({ visualizationFrequency: freq });
  },
  setSpreadFactor(value) {
    spreadFactor = value;
  },
  getSpreadFactor() {
    return spreadFactor;
  },
  clearCustomWaveCache() {
    waveformTables.clear();
  }
};
function drawTonewheel(ctx, sk) {
  const { width, height } = sk;
  updateDimensions(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = themeColor("--viz-bg-tonewheel");
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = themeColor("--viz-grid");
  ctx.beginPath();
  ctx.ellipse(0, 0, baseRadius, baseRadius, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.stroke();
  const points = 360;
  const rotationSpeed = AppState.visualizationFrequency * Math.PI * 2 / 60;
  drawIndividualPartials(ctx, points, sk.frameCount * rotationSpeed);
  ctx.restore();
}
function updateDimensions(width, height) {
  const radialHeight = height * CANVAS_HEIGHT_RATIOS.RADIAL;
  maxAmplitudeRadial = Math.min(width, radialHeight) * (1 - baseRadiusRatio) * 0.45;
  baseRadius = Math.min(width, radialHeight) * baseRadiusRatio;
}
function computeHarmonicLaneRadii({ harmonicAmplitudes, baseRadius: baseRadius2, maxLaneHeight }) {
  const activeHarmonics = harmonicAmplitudes.map((amp, idx) => ({ amp, idx })).filter((h) => h.amp > 0);
  const num2 = activeHarmonics.length;
  const radii = new Array(harmonicAmplitudes.length);
  const laneSpacing = maxLaneHeight / num2;
  let currentRadius = baseRadius2;
  for (let i = 0; i < num2; i++) {
    radii[activeHarmonics[i].idx] = currentRadius;
    currentRadius += laneSpacing;
  }
  return radii;
}
function drawIndividualPartials(ctx, points, currentAngle) {
  const type = AppState.currentWaveform;
  const numHarmonics = Math.min(
    AppState.harmonicAmplitudes.length,
    AppState.currentSystem.ratios.length
  );
  const laneRadii = computeHarmonicLaneRadii({
    harmonicAmplitudes: AppState.harmonicAmplitudes.slice(0, numHarmonics),
    baseRadius,
    maxLaneHeight: maxAmplitudeRadial
  });
  const thetaScale = Math.PI * 2 / points;
  const ring = new Float64Array(points * 2);
  for (let h = 0; h < numHarmonics; h++) {
    const amp = AppState.harmonicAmplitudes[h];
    if (amp <= 1e-3) continue;
    const envLevel = harmonicEnvelopeLevel(h);
    if (envLevel <= 1e-3) continue;
    const ratio = AppState.currentSystem.ratios[h];
    const ringRadius = laneRadii[h];
    const MAX_RING_MOD = 0.45;
    const visualAmp = MAX_RING_MOD * (maxAmplitudeRadial / numHarmonics) * spreadFactor * amp;
    const teeth = AppState.isSubharmonic ? 1 : ratio;
    const spin = AppState.isSubharmonic ? currentAngle / ratio : currentAngle;
    ctx.strokeStyle = withAlpha(partialColor(ratio), 153 * envLevel / 255);
    ctx.lineWidth = 2;
    for (let i = 0; i < points; i++) {
      const theta = i * thetaScale;
      const waveValue = getWaveValue(type, theta * teeth, AppState.customWaveCoefficients?.[type]);
      const rotatedTheta = theta + spin;
      const r = ringRadius + waveValue * visualAmp;
      ring[i * 2] = r * Math.cos(rotatedTheta);
      ring[i * 2 + 1] = r * Math.sin(rotatedTheta);
    }
    strokeClosedPath(ctx, ring);
  }
}
var waveformTables = /* @__PURE__ */ new Map();
var TABLE_SIZE = 512;
function getWaveValue(type, theta, customCoeffs) {
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

// js/modules/surfaces/surfaceState.js
var SURFACES = [
  // Fundamental, signal source, overtone system
  { id: "source", group: "pin", label: "Source", roots: ["fundamental-control-root", "oscillator-control-root", "spectral-system-root"] },
  // One pad per overtone
  { id: "trigger", group: "pin", label: "Trigger", roots: ["pad-grid-root"] },
  // The drawbar strip in each of its parameter families, each with its
  // own visualization in the side column
  { id: "gain", group: "main", label: "Gain", roots: ["drawbars-control-root"], side: "gain-viz-root", family: "gain", tools: true },
  { id: "adsr", group: "main", label: "ADSR", roots: ["drawbars-control-root"], side: "adsr-viz-root", family: "adsr", tools: true },
  { id: "filter", group: "main", label: "Filter", roots: ["drawbars-control-root"], side: "filter-viz-root", family: "filter", tools: true },
  // `label` is what fits the rail; `title` is the full name (tooltip)
  { id: "convolution", group: "main", label: "Conv", title: "Convolution", roots: ["drawbars-control-root"], side: "conv-viz-root", family: "convolution", tools: true },
  // The inspector: one voice's sequence, modulation and pulse outs,
  // that sequence drawn in the side column
  { id: "sequence", group: "main", label: "Sequence", roots: ["sequence-control-root"], side: "sequence-viz-root", tools: true },
  // Storage banks, the A/B crossfader and the JSON state view
  { id: "presets", group: "page", label: "Presets", roots: ["presets-control-root"] },
  { id: "settings", group: "page", label: "Settings", roots: ["settings-control-root"] }
];
var SIDE_ROOTS = ["tonewheel-container"];
var state2 = {
  // The active main or page surface — never a pin
  active: "gain",
  // The pin panel that accompanies the active main surface wherever it
  // can (the page opens on Source + Gain where there is room, on Gain
  // alone where there isn't); null = none pinned
  pinned: "source",
  // A pin panel showing INSTEAD of the active surface (only where it
  // can't be pinned), or null
  alone: null,
  // null = "not chosen yet": the default depends on the pointer density,
  // which layoutMode only knows after init() — later than this module
  // is imported — so it's resolved on first read, not here. Desktop
  // starts with the side column open beside the strip (the layout users
  // know); a finger-driven screen has no room to spare.
  side: null
};
function sideDefault() {
  return !layoutMode.coarse;
}
function def(id) {
  return SURFACES.find((s) => s.id === id);
}
function emit() {
  document.dispatchEvent(new CustomEvent(SURFACE_CHANGED));
}
var surfaceState = {
  /** The active main or page surface (never a pin — see `alone`). */
  get active() {
    return state2.active;
  },
  /** A pin may sit with the active surface right now. */
  get canPin() {
    return layoutMode.roomy && def(state2.active).group === "main";
  },
  /** The pin panel showing WITH the active surface, or null. */
  get pinnedShown() {
    return this.canPin ? state2.pinned : null;
  },
  /** The pin panel showing INSTEAD of the active surface, or null. */
  get alone() {
    return this.canPin ? null : state2.alone;
  },
  /** Is `id`'s panel on screen? */
  showing(id) {
    if (def(id).group === "pin") return this.pinnedShown === id || this.alone === id;
    return id === state2.active && !this.alone;
  },
  /** The showing surface carries the overtone toolbar (link / shape). */
  get tools() {
    return !this.alone && Boolean(def(state2.active).tools);
  },
  get side() {
    return state2.side ?? sideDefault();
  },
  /** The showing surface's side visualization panel id, if it has a side column. */
  get sidePanel() {
    return this.alone ? null : def(state2.active).side ?? null;
  },
  /** The toggle is on AND the showing surface has a side column. */
  get sideShown() {
    return this.side && this.sidePanel !== null;
  },
  /**
   * A toolbar button. A main or page surface becomes the active one; a
   * pin toggles — pinned where it can be (replacing the other pin),
   * shown alone where it can't.
   */
  show(id) {
    const surface = def(id);
    if (!surface) return;
    if (surface.group === "pin") {
      if (this.canPin) {
        state2.pinned = state2.pinned === id ? null : id;
      } else {
        state2.alone = state2.alone === id ? null : id;
      }
    } else {
      if (id === state2.active && !state2.alone) return;
      state2.active = id;
      state2.alone = null;
    }
    emit();
  },
  setSide(on) {
    const next = Boolean(on);
    if (next === this.side) return;
    state2.side = next;
    emit();
  },
  toggleSide() {
    this.setSide(!this.side);
  },
  /** Element ids that should be visible right now. */
  visibleRoots() {
    const ids = /* @__PURE__ */ new Set();
    for (const s of SURFACES) {
      if (this.showing(s.id)) s.roots.forEach((r) => ids.add(r));
    }
    if (this.sideShown) [this.sidePanel, ...SIDE_ROOTS].forEach((r) => ids.add(r));
    return ids;
  },
  /** Every panel root any surface or side column can show. */
  allRoots() {
    const ids = new Set(SIDE_ROOTS);
    for (const s of SURFACES) [...s.roots, ...s.side ? [s.side] : []].forEach((r) => ids.add(r));
    return ids;
  }
};

// js/modules/settings/settingsSurface.js
var MANAGE_FILES_OPTION = "__files__";
var mounting = null;
function mountSettings() {
  if (!mounting) {
    mounting = import("./settingsController-ISGOZTYA.js").then(({ SettingsController }) => {
      const controller = new SettingsController("#settings-control-root");
      controller.init();
      return controller;
    });
  }
  return mounting;
}
async function openSettings(tab) {
  surfaceState.show("settings");
  (await mountSettings()).selectTab(tab);
}

// js/modules/waveform/waveformActions.js
var CURRENT_WAVEFORM_CHANGED = "currentWaveformChanged";
function waveformMenuNames() {
  const select = document.getElementById("waveform-select");
  return select ? [...select.options].filter(isWaveformOption).map((o) => o.value) : ["sine", "square", "triangle", "sawtooth"];
}
function isWaveformOption(option) {
  return !option.disabled && option.dataset.role !== "action";
}
function handleWaveformChange(e) {
  if (e.target.value === MANAGE_FILES_OPTION) {
    e.target.value = AppState.waveformMorph ? "" : AppState.currentWaveform;
    openSettings("files");
    return;
  }
  setCurrentWaveform(e.target.value);
}
function setCurrentWaveform(currentWaveform) {
  if (!currentWaveform) return;
  updateAppState({ currentWaveform, waveformMorph: null });
  document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED, {
    detail: { currentWaveform }
  }));
  updateAllHarmonicWaveforms();
}
function handleAddToWaveforms(isSubharmonic) {
  buildCurrentSpectrum(isSubharmonic).then((spectrum) => {
    if (!spectrum) {
      showStatus("Nothing to capture \u2014 no active drawbars.", "warning");
      return;
    }
    return addToWaveforms(spectrum);
  }).catch((error) => {
    console.error("Failed to bake waveform:", error);
    showStatus("Failed to bake waveform", "error");
  });
}
async function addToWaveforms(spectrum) {
  try {
    const name = waveformLabel();
    const { waveKey, coefficients } = await addWaveformToAudio(spectrum, name);
    const customWaveIndex = addWaveformToState(
      AppState,
      waveKey,
      coefficients,
      spectrum.periodMultiplier
    );
    addWaveformToUI(waveKey, name, customWaveIndex);
    document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED));
    document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
  } catch (error) {
    showStatus(`Failed to add waveform: ${error.message}`, "error");
  }
}
function addWaveformToState(AppState2, waveKey, coefficients, periodMultiplier) {
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
function waveformLabel() {
  const parts = generateFilenameParts();
  return `${parts.noteLetter}-${parts.waveform}-${parts.systemName}-${parts.levels}` + (parts.subharmonicFlag ? `-${parts.subharmonicFlag}` : "");
}
function syncWaveformOptions(wavetableManager = getWavetableManager()) {
  const select = document.getElementById("waveform-select");
  if (!select) return;
  const chosen = select.value;
  for (const option of [...select.options]) {
    if (option.value.startsWith("custom_") || option.dataset.role === "action") option.remove();
  }
  const tail = select.querySelector("option[disabled][hidden]");
  const waves = wavetableManager.list();
  waves.forEach(({ key, name }, i) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `Custom ${i + 1}: ${name || key}`;
    select.insertBefore(option, tail);
  });
  if (waves.length) {
    const manage = document.createElement("option");
    manage.value = MANAGE_FILES_OPTION;
    manage.dataset.role = "action";
    manage.textContent = "Manage files\u2026";
    select.insertBefore(manage, tail);
  }
  if ([...select.options].some((o) => o.value === chosen)) select.value = chosen;
  AppState.customWaveCount = waves.length;
}
function addWaveformToUI(waveKey, name, customWaveIndex) {
  syncWaveformOptions();
  const select = document.getElementById("waveform-select");
  if (select) select.value = waveKey;
  setCurrentWaveform(waveKey);
  showStatus(
    `Successfully added new waveform: Custom ${customWaveIndex}. Now synthesizing with it!`,
    "success"
  );
}
function restoreWaveformOptions(wavetableManager) {
  syncWaveformOptions(wavetableManager);
  for (const { key } of wavetableManager.list()) {
    const coefficients = wavetableManager.getCoefficients(key);
    if (!coefficients) continue;
    AppState.customWaveCoefficients = AppState.customWaveCoefficients || {};
    AppState.customWaveCoefficients[key] = coefficients;
    AppState.customWavePeriodMultipliers = AppState.customWavePeriodMultipliers || {};
    AppState.customWavePeriodMultipliers[key] = wavetableManager.getPeriodMultiplier(key);
  }
}

// js/dsp/gate/patterns.js
function euclideanRhythm(pulses, steps) {
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
function euclideanFor(cache2, pulses, steps) {
  const key = `${pulses}/${steps}`;
  if (cache2.euclideanKey !== key) {
    cache2.euclideanKey = key;
    cache2.euclidean = euclideanRhythm(pulses, steps);
  }
  return cache2.euclidean;
}
var PATTERNS = [
  {
    id: 0,
    name: "off",
    aliases: [],
    label: "Off",
    bypass: true,
    params: [],
    active: () => true,
    period: () => 1
  },
  {
    id: 1,
    name: "alternating",
    aliases: ["alt"],
    label: "Alternating",
    randomizable: true,
    params: [
      { key: "x", label: "cycles on", min: 1, max: 32, def: 1 },
      { key: "y", label: "cycles off", min: 0, max: 32, def: 1 }
    ],
    active: (cycle, { x, y }) => cycle % Math.max(1, Math.round(x) + Math.round(y)) < Math.round(x),
    period: ({ x, y }) => Math.max(1, Math.round(x) + Math.round(y))
  },
  {
    id: 2,
    name: "euclidean",
    aliases: ["euclid"],
    label: "Euclidean",
    randomizable: true,
    params: [
      { key: "x", label: "pulses", min: 0, max: 32, def: 3 },
      { key: "y", label: "steps", min: 1, max: 32, def: 8 }
    ],
    active(cycle, { x, y, cache: cache2 }) {
      const steps = Math.max(1, Math.round(y));
      return euclideanFor(cache2, Math.min(Math.round(x), steps), steps)[cycle % steps];
    },
    period: ({ y }) => Math.max(1, Math.round(y))
  },
  {
    id: 3,
    name: "probability",
    aliases: ["prob"],
    label: "Probability",
    random: true,
    params: [
      { key: "x", label: "probability", min: 0, max: 100, def: 50, format: (v) => `${Math.round(v)}%` }
    ],
    active: (cycle, { x }) => Math.random() * 100 < x,
    period: () => 1
  },
  {
    id: 4,
    name: "sequence",
    aliases: ["seq"],
    label: "Sequence",
    params: [],
    // the 0/1 pattern is a text field, not dials
    active: (cycle, { steps }) => steps && steps.length ? steps[cycle % steps.length] > 0.5 : true,
    period: ({ steps }) => Math.max(1, steps?.length || 1)
  }
];
var BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
function patternById(id) {
  return BY_ID.get(id) ?? PATTERNS[0];
}
function patternPeriod(id, ctx) {
  return patternById(id).period(ctx);
}
function patternIdFromName(name) {
  const key = String(name).toLowerCase();
  return PATTERNS.find((p) => p.name === key || p.aliases.includes(key))?.id;
}
function patternParams(id) {
  return patternById(id).params;
}

// js/modules/overtoneSignal/overtoneSignalActions.js
var Q_MAX = 50;
var DRIVE_MAX = 2.5;
var ENV_TIME_MAX = { a: 2, d: 2, r: 5 };
var CONV_FEEDBACK_MAX = 0.99;
var OvertoneSignalActions = {
  getGate(index) {
    return { mode: 0, x: 1, y: 1, seq: [], ...AppState.oscillatorGates[index] };
  },
  getFilter(index) {
    return { multiplier: 0, q: 0.707, type: DEFAULT_FILTER_TYPE, ...AppState.oscillatorFilters[index] };
  },
  getPan(index) {
    return getVoicePan(index);
  },
  setGate(index, gate) {
    AppState.oscillatorGates[index] = gate;
    updateHarmonicGate(index);
    this._changed(index, "gate");
  },
  /**
   * The whole filter config for one voice — callers spread the current
   * one and change a field. The type is validated here rather than at
   * each caller, because it also arrives from the bridge and from pasted
   * preset JSON.
   */
  setFilter(index, filter) {
    AppState.oscillatorFilters[index] = {
      ...filter,
      type: FILTER_TYPES.includes(filter.type) ? filter.type : DEFAULT_FILTER_TYPE
    };
    updateHarmonicFilter(index);
    this._changed(index, "filter");
  },
  /** Overdrive amount 0-DRIVE_MAX (0 = clean), applied before the lowpass. */
  getDrive(index) {
    return AppState.oscillatorDrives[index] || 0;
  },
  setDrive(index, amount) {
    AppState.oscillatorDrives[index] = Math.max(0, Math.min(DRIVE_MAX, Number(amount) || 0));
    updateHarmonicDrive(index);
    this._changed(index, "drive");
  },
  /**
   * Convolution send: { wet 0-1, feedback ±CONV_FEEDBACK_MAX, gain 0-1,
   * ir: IRManager key | null, tune: 0 (loop period = IR duration) or a
   * 1-based series partial the feedback comb is tuned to }. Each overtone
   * picks its own IR.
   */
  getConvolution(index) {
    return { wet: 0, feedback: 0, gain: 1, ir: null, tune: 0, ...AppState.oscillatorConvolutions[index] };
  },
  setConvolution(index, patch) {
    const merged = { ...this.getConvolution(index), ...patch };
    AppState.oscillatorConvolutions[index] = {
      wet: Math.max(0, Math.min(1, Number(merged.wet) || 0)),
      feedback: Math.max(-CONV_FEEDBACK_MAX, Math.min(CONV_FEEDBACK_MAX, Number(merged.feedback) || 0)),
      gain: Math.max(0, Math.min(1, isFinite(Number(merged.gain)) ? Number(merged.gain) : 1)),
      ir: irManager.has(merged.ir) ? merged.ir : null,
      tune: Math.max(0, Math.min(MAX_FILTER_PARTIALS, Math.round(Number(merged.tune) || 0)))
    };
    updateHarmonicConvolution(index);
    this._changed(index, "conv");
  },
  /** Per-overtone ADSR: { a, d, r } seconds, { s } 0-1. */
  getEnvelope(index) {
    return { ...ENVELOPE_DEFAULTS, ...AppState.oscillatorEnvelopes[index] };
  },
  /**
   * Merge ADSR fields for a voice. No live-audio call — values are read
   * at the next attack/release trigger.
   */
  setEnvelope(index, env) {
    const merged = { ...this.getEnvelope(index), ...env };
    const time = (v, max) => Math.max(1e-3, Math.min(max, Number(v) || 0));
    AppState.oscillatorEnvelopes[index] = {
      a: time(merged.a, ENV_TIME_MAX.a),
      d: time(merged.d, ENV_TIME_MAX.d),
      s: Math.max(0, Math.min(1, Number(merged.s) || 0)),
      r: time(merged.r, ENV_TIME_MAX.r)
    };
    this._changed(index, "envelope");
  },
  /** Global envelope mode: 'open' (default) or 'adsr'. */
  getEnvelopeMode() {
    return AppState.envelopeMode;
  },
  setEnvelopeMode(mode) {
    const next = mode === "adsr" ? "adsr" : "open";
    if (next === AppState.envelopeMode) return;
    AppState.envelopeMode = next;
    updateAllHarmonicEnvelopeModes();
    document.dispatchEvent(new CustomEvent(ENVELOPE_MODE_CHANGED));
  },
  getSequencer(index) {
    const stored = AppState.oscillatorSequencers[index] || {};
    return {
      shape: stored.shape || "square",
      stretch: stored.stretch || 1,
      amounts: { gain: 1, freq: 0, res: 0, wet: 0, fb: 0, ...stored.amounts }
    };
  },
  /** Shape period in cycles (1/64 – 64, powers of two from the UI). */
  setSequencerStretch(index, stretch) {
    const seq = this.getSequencer(index);
    AppState.oscillatorSequencers[index] = {
      ...seq,
      stretch: Math.max(1 / 64, Math.min(64, stretch))
    };
    updateHarmonicSequencer(index);
    this._changed(index, "seq");
  },
  /** Set the cycle contour waveform (same names as the oscillator menu). */
  setSequencerShape(index, shape) {
    const seq = this.getSequencer(index);
    AppState.oscillatorSequencers[index] = { ...seq, shape };
    updateHarmonicSequencer(index);
    this._changed(index, "seq");
  },
  /** Set a modulation amount: target 'gain' | 'freq' | 'res' | 'wet' | 'fb'. */
  setSequencerAmount(index, target, value) {
    const seq = this.getSequencer(index);
    const clamped = target === "freq" ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
    AppState.oscillatorSequencers[index] = {
      ...seq,
      amounts: { ...seq.amounts, [target]: clamped }
    };
    updateHarmonicSequencer(index);
    this._changed(index, "seq");
  },
  getPulseOut(index) {
    return {
      midi: midiConfig.pulseMidiEnabled,
      osc: midiConfig.pulseOscEnabled,
      offset: false,
      ...AppState.oscillatorPulseOuts[index]
    };
  },
  /**
   * Merge pulse-output flags for a voice: { midi?, osc?, offset? } —
   * `offset` lands the voice's pulses at 50% of the cycle, not its start.
   */
  setPulseOut(index, flags) {
    AppState.oscillatorPulseOuts[index] = { ...this.getPulseOut(index), ...flags };
    updateHarmonicPulse(index);
    this._changed(index, "pulse");
  },
  /**
   * Assign a voice as the MIDI clock source (exclusive), or clear with
   * null. The previous clock voice's pulse enable is re-evaluated.
   */
  setMidiClockVoice(index) {
    const previous = AppState.midiClockVoice;
    AppState.midiClockVoice = index;
    if (previous !== null && previous !== index) updateHarmonicPulse(previous);
    if (index !== null) updateHarmonicPulse(index);
    this._changed(index ?? previous ?? 0, "clock");
  },
  setPan(index, pan) {
    if (!Array.isArray(AppState.oscillatorPans)) AppState.oscillatorPans = [];
    AppState.oscillatorPans[index] = Math.max(-1, Math.min(1, pan));
    updateHarmonicPan(index);
    this._changed(index, "pan");
  },
  // ---------------------------------------------------------------
  // Bulk operations (the drawbar section's view-scoped reset/randomize)
  // ---------------------------------------------------------------
  _voiceCount() {
    return AppState.currentSystem.ratios.length;
  },
  /** Filters to neutral: open (multiplier 0), default resonance, no drive. */
  resetFilters() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setFilter(i, { multiplier: 0, q: 0.707, type: DEFAULT_FILTER_TYPE });
      this.setDrive(i, 0);
    }
  },
  /** Convolution sends fully dry, feedback off, gain unity; IRs kept. */
  resetConvolutions() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setConvolution(i, { wet: 0, feedback: 0, gain: 1, tune: 0 });
    }
  },
  /** Random wet/dry per voice; feedback, gain, and IR (the aux controls) untouched. */
  randomizeConvolutions() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setConvolution(i, { wet: Math.round(Math.random() * 100) / 100 });
    }
  },
  /** Random cutoff partial per voice; resonance (the aux dial) untouched. */
  randomizeFilters() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setFilter(i, {
        ...this.getFilter(i),
        multiplier: 1 + Math.floor(Math.random() * MAX_FILTER_PARTIALS)
      });
    }
  },
  /** Every voice's envelope back to the defaults. */
  resetEnvelopes() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setEnvelope(i, { ...ENVELOPE_DEFAULTS });
    }
  },
  /**
   * Random but playable envelopes: short-to-medium attacks and decays,
   * any sustain, releases up to a couple of seconds.
   */
  randomizeEnvelopes() {
    const between = (lo, hi) => lo + Math.random() * (hi - lo);
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setEnvelope(i, {
        a: between(5e-3, 0.6),
        d: between(0.05, 1),
        s: Math.round(between(0.2, 1) * 100) / 100,
        r: between(0.05, 2)
      });
    }
  },
  /** Gates off, pattern params back to defaults. */
  resetGates() {
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setGate(i, { mode: 0, x: 1, y: 1, seq: [] });
    }
  },
  /**
   * Random audible rhythm per voice: alternating or euclidean mode with
   * small musical x/y values (randomizing x/y under mode-off would be
   * inaudible, which reads as a broken button).
   */
  randomizeGates() {
    const choices = PATTERNS.filter((p) => p.randomizable);
    for (let i = 0; i < this._voiceCount(); i++) {
      this.setGate(i, {
        mode: choices[Math.floor(Math.random() * choices.length)].id,
        x: 1 + Math.floor(Math.random() * 8),
        y: 2 + Math.floor(Math.random() * 15),
        seq: []
      });
    }
  },
  _changed(index, kind) {
    document.dispatchEvent(new CustomEvent(OVERTONE_SIGNAL_CHANGED, {
      detail: { index, kind }
    }));
  }
};

// js/modules/presets/presetSchema.js
var PRESET_VERSION = 1;
var INTERPOLATED_SYSTEM = -1;
var num = (min, max, kind = "linear", def2 = 0) => ({ min, max, kind, def: def2 });
var snap = (def2) => ({ kind: "snap", def: def2 });
var morph = (def2) => ({ kind: "morph", def: def2 });
var VOICE_SPEC = {
  amplitude: num(0, 1),
  pan: num(-1, 1),
  drive: num(0, DRIVE_MAX),
  filter: {
    multiplier: num(0, MAX_FILTER_PARTIALS, "integer"),
    q: num(1e-4, Q_MAX, "linear", 0.707),
    // A shape, not a quantity: A below the midpoint, B from it
    type: snap(DEFAULT_FILTER_TYPE)
  },
  convolution: {
    wet: num(0, 1),
    feedback: num(-CONV_FEEDBACK_MAX, CONV_FEEDBACK_MAX),
    gain: num(0, 1, "linear", 1),
    tune: num(0, MAX_FILTER_PARTIALS, "integer"),
    ir: snap(null)
    // IRManager key (session-only; unresolvable keys apply as none)
  },
  envelope: {
    a: num(1e-3, ENV_TIME_MAX.a, "linear", ENVELOPE_DEFAULTS.a),
    d: num(1e-3, ENV_TIME_MAX.d, "linear", ENVELOPE_DEFAULTS.d),
    s: num(0, 1, "linear", ENVELOPE_DEFAULTS.s),
    r: num(1e-3, ENV_TIME_MAX.r, "linear", ENVELOPE_DEFAULTS.r)
  },
  gate: {
    mode: num(0, 4, "snap", 0),
    x: num(0, 1024, "integer", 1),
    y: num(0, 1024, "integer", 1),
    seq: snap([])
  },
  sequencer: {
    shape: snap("square"),
    stretch: num(1 / 64, 64, "geometric", 1),
    amounts: {
      gain: num(0, 1, "linear", 1),
      freq: num(-1, 1),
      res: num(0, 1),
      wet: num(0, 1),
      fb: num(0, 1)
    }
  }
};
var SPEC = {
  fundamental: num(1e-3, 1e4, "geometric", DEFAULT_FUNDAMENTAL),
  subharmonic: snap(false),
  system: {
    index: num(INTERPOLATED_SYSTEM, spectralSystems.length - 1, "snap", 0),
    startHarmonic: num(1, START_HARMONIC_MAX, "snap", 1),
    stiffnessB: num(0, STIFFNESS_B_MAX, "snap", DEFAULT_STIFFNESS_B),
    tubeClosedness: num(0, 1, "snap", DEFAULT_TUBE_CLOSEDNESS),
    stretchA: num(STRETCH_A_MIN, STRETCH_A_MAX, "snap", DEFAULT_STRETCH_A),
    compressA: num(COMPRESS_A_MIN, COMPRESS_A_MAX, "snap", DEFAULT_COMPRESS_A),
    ratios: snap(null)
    // only with index INTERPOLATED_SYSTEM
  },
  masterGain: num(0, 1, "linear", DEFAULT_MASTER_GAIN),
  masterSlew: num(0, 10, "linear", DEFAULT_MASTER_SLEW),
  waveform: morph("square"),
  source: {
    mode: snap("oscillators"),
    adcDeviceId: snap(null),
    adcChannel: num(0, 63, "snap", 0),
    // The file itself is session-only; mono/poly and tuning are app config
    soundfile: {
      loop: snap(true),
      fundamental: snap(null),
      // Hz as a number, or null = detected
      range: snap(null)
      // [start, end] fractions, or null = the whole file
    }
  },
  envelopeMode: snap("open"),
  irRingSeconds: num(0, IR_RING_MAX_SECONDS),
  voices: [VOICE_SPEC]
};
var isLeaf = (spec) => "kind" in spec;
function capture() {
  const s = AppState;
  const count = s.harmonicAmplitudes.length;
  const voices = [];
  for (let i = 0; i < count; i++) {
    const gate = s.oscillatorGates[i] || {};
    const seq = s.oscillatorSequencers[i] || {};
    voices.push({
      amplitude: s.harmonicAmplitudes[i] || 0,
      pan: s.oscillatorPans?.[i] || 0,
      drive: s.oscillatorDrives[i] || 0,
      filter: {
        multiplier: s.oscillatorFilters[i]?.multiplier || 0,
        q: s.oscillatorFilters[i]?.q ?? 0.707,
        type: s.oscillatorFilters[i]?.type ?? DEFAULT_FILTER_TYPE
      },
      convolution: { wet: 0, feedback: 0, gain: 1, tune: 0, ir: null, ...s.oscillatorConvolutions[i] },
      envelope: { ...ENVELOPE_DEFAULTS, ...s.oscillatorEnvelopes[i] },
      gate: { mode: gate.mode ?? 0, x: gate.x ?? 1, y: gate.y ?? 1, seq: [...gate.seq || []] },
      sequencer: {
        shape: seq.shape || "square",
        stretch: seq.stretch || 1,
        amounts: { gain: 1, freq: 0, res: 0, wet: 0, fb: 0, ...seq.amounts }
      }
    });
  }
  return {
    fundamental: s.fundamentalFrequency,
    subharmonic: Boolean(s.isSubharmonic),
    system: {
      index: s.currentSystemIndex,
      startHarmonic: s.startHarmonic,
      stiffnessB: s.stiffnessB,
      tubeClosedness: s.tubeClosedness,
      stretchA: s.stretchA,
      compressA: s.compressA,
      ratios: s.currentSystemIndex === INTERPOLATED_SYSTEM ? [...s.currentSystem.ratios] : null
    },
    masterGain: s.masterGainValue,
    masterSlew: s.masterSlewValue,
    waveform: s.waveformMorph ? { ...s.waveformMorph } : s.currentWaveform || "sine",
    source: {
      mode: s.sourceMode,
      adcDeviceId: s.adcDeviceId ?? null,
      adcChannel: s.adcChannel || 0,
      soundfile: { loop: s.soundfileLoop, fundamental: s.soundfileFundamental ?? null, range: s.soundfileRange ? [...s.soundfileRange] : null }
    },
    envelopeMode: s.envelopeMode,
    irRingSeconds: s.irRingSeconds || 0,
    voices
  };
}
function sanitize(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = walkSanitize(SPEC, src);
  if (out.system.index !== INTERPOLATED_SYSTEM || !Array.isArray(out.system.ratios)) {
    out.system.ratios = null;
    if (out.system.index < 0) out.system.index = 0;
  } else {
    out.system.ratios = out.system.ratios.map((r) => Number.isFinite(r) && r > 0 ? r : 1);
  }
  return out;
}
function walkSanitize(spec, value) {
  if (Array.isArray(spec)) {
    const list = Array.isArray(value) ? value : [];
    return list.map((item) => walkSanitize(spec[0], item));
  }
  if (isLeaf(spec)) return sanitizeLeaf(spec, value);
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of Object.keys(spec)) out[key] = walkSanitize(spec[key], src[key]);
  return out;
}
function sanitizeLeaf(spec, value) {
  if ("min" in spec) {
    const v = Number(value);
    if (!Number.isFinite(v)) return spec.def;
    const clamped = Math.min(spec.max, Math.max(spec.min, v));
    return spec.kind === "integer" ? Math.round(clamped) : clamped;
  }
  const def2 = spec.def;
  if (spec.kind === "morph") {
    if (typeof value === "string") return value;
    if (typeof value?.a === "string" && typeof value?.b === "string") {
      const t = Math.min(1, Math.max(0, Number(value.t) || 0));
      return t <= 0 ? value.a : t >= 1 ? value.b : { a: value.a, b: value.b, t };
    }
    return def2;
  }
  if (def2 === null) return typeof value === "string" || Array.isArray(value) || Number.isFinite(value) && value > 0 ? value : null;
  if (Array.isArray(def2)) return Array.isArray(value) ? value.map((v) => v > 0.5 ? 1 : 0) : [...def2];
  return typeof value === typeof def2 ? value : def2;
}
function interpolate(a, b, t) {
  if (t <= 0) return structuredClone(a);
  if (t >= 1) return structuredClone(b);
  const out = walkLerp(SPEC, a, b, t);
  const ratiosA = systemRatios(a);
  const ratiosB = systemRatios(b);
  const sameSystem = a.subharmonic === b.subharmonic && sameRatios(ratiosA, ratiosB);
  const count = Math.max(ratiosA.length, ratiosB.length);
  for (let i = 0; i < out.voices.length; i++) {
    const ampA = i < ratiosA.length ? a.voices[i]?.amplitude || 0 : 0;
    const ampB = i < ratiosB.length ? b.voices[i]?.amplitude || 0 : 0;
    out.voices[i].amplitude = lerp(ampA, ampB, t);
  }
  if (!sameSystem) {
    const ratios = [];
    for (let i = 0; i < count; i++) {
      const fa = i < ratiosA.length ? voiceFrequency(a.fundamental, a.subharmonic, ratiosA[i]) : null;
      const fb = i < ratiosB.length ? voiceFrequency(b.fundamental, b.subharmonic, ratiosB[i]) : null;
      const f = fa === null ? fb : fb === null ? fa : geometric(fa, fb, t);
      ratios.push(out.subharmonic ? out.fundamental / f : f / out.fundamental);
    }
    out.system.index = INTERPOLATED_SYSTEM;
    out.system.ratios = ratios;
  }
  return out;
}
function walkLerp(spec, a, b, t) {
  if (Array.isArray(spec)) {
    const n = Math.max(a?.length || 0, b?.length || 0);
    const out2 = [];
    for (let i = 0; i < n; i++) out2.push(walkLerp(spec[0], a?.[i], b?.[i], t));
    return out2;
  }
  if (isLeaf(spec)) return lerpLeaf(spec, a, b, t);
  const out = {};
  for (const key of Object.keys(spec)) out[key] = walkLerp(spec[key], a?.[key], b?.[key], t);
  return out;
}
function lerpLeaf(spec, a, b, t) {
  const va = a === void 0 ? spec.def : a;
  const vb = b === void 0 ? spec.def : b;
  switch (spec.kind) {
    case "linear":
      return lerp(va, vb, t);
    case "geometric":
      return geometric(va, vb, t);
    case "integer":
      return Math.round(lerp(va, vb, t));
    case "morph": {
      const a2 = waveformName(va);
      const b2 = waveformName(vb);
      return a2 === b2 ? a2 : { a: a2, b: b2, t };
    }
    default:
      return structuredClone(t < 0.5 ? va : vb);
  }
}
function waveformName(waveform) {
  if (typeof waveform === "string") return waveform;
  return waveform.t < 0.5 ? waveform.a : waveform.b;
}
var lerp = (a, b, t) => a + (b - a) * t;
function geometric(a, b, t) {
  if (!(a > 0) || !(b > 0)) return lerp(a, b, t);
  return a * Math.pow(b / a, t);
}
function voiceFrequency(fundamental, subharmonic, ratio) {
  return subharmonic ? fundamental / ratio : fundamental * ratio;
}
function systemRatios(snapshot) {
  const { index, ratios, startHarmonic, ...options } = snapshot.system;
  if (index === INTERPOLATED_SYSTEM && ratios) return ratios;
  const base = spectralSystems[index] || spectralSystems[0];
  const system = base.generate ? { ...base, ...base.generate(startHarmonic, options) } : base;
  return system.ratios;
}
function sameRatios(a, b) {
  return a.length === b.length && a.every((r, i) => Math.abs(r - b[i]) < 1e-9);
}
function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// js/modules/presets/presetStore.js
var BANK_COUNT = 32;
var STORAGE_KEY = "twig.presets";
var banks = new Array(BANK_COUNT).fill(null);
var presetStore = {
  /** Bank `index` (0-based), or null when empty. */
  get(index) {
    return banks[index] ?? null;
  },
  /** Every bank, empty ones as null, in order. */
  list() {
    return banks.slice();
  },
  has(index) {
    return Boolean(banks[index]);
  },
  set(index, { name, state: state4 }) {
    banks[index] = { name: String(name || "").slice(0, 40), savedAt: Date.now(), state: sanitize(state4) };
    write();
  },
  rename(index, name) {
    if (!banks[index]) return;
    banks[index] = { ...banks[index], name: String(name || "").slice(0, 40) };
    write();
  },
  clear(index) {
    banks[index] = null;
    write();
  },
  /** Restore the stored banks. Call once at boot. */
  load() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return;
    }
    if (!Array.isArray(saved?.banks)) return;
    for (let i = 0; i < BANK_COUNT; i++) {
      const bank = saved.banks[i];
      banks[i] = bank && typeof bank === "object" && bank.state ? { name: String(bank.name || ""), savedAt: Number(bank.savedAt) || 0, state: sanitize(bank.state) } : null;
    }
  }
};
function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, banks }));
  } catch {
  }
}

// js/modules/presets/presetApply.js
var VOICE_KINDS = { gate: "gate", filter: "filter", drive: "drive", convolution: "conv", envelope: "envelope", sequencer: "seq", pan: "pan" };
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var deferred = null;
var frame = null;
var SYSTEM_EVENT_MIN_MS = 150;
var lastSystemEvent = -Infinity;
var systemEventTimer = null;
function applySnapshot(next, { immediate = false, ramp } = {}) {
  const prev = capture();
  const diff = diffSnapshots(prev, next);
  writeAppState(next, diff);
  if (AppState.isPlaying) writeAudioFast(next, diff, ramp ?? next.masterSlew);
  deferred = mergeDeferred(deferred, diff, prev);
  if (immediate) {
    cancelAnimationFrame(frame);
    frame = null;
    flush();
  } else if (frame === null) {
    frame = requestAnimationFrame(() => {
      frame = null;
      flush();
    });
  }
}
function diffSnapshots(prev, next) {
  const d = {
    fundamental: prev.fundamental !== next.fundamental,
    subharmonic: prev.subharmonic !== next.subharmonic,
    system: !same(prev.system, next.system),
    masterGain: prev.masterGain !== next.masterGain,
    masterSlew: prev.masterSlew !== next.masterSlew,
    waveform: !same(prev.waveform, next.waveform),
    // The menu shows the name, or "Interpolated" while a morph is on
    waveformName: waveformName(prev.waveform) !== waveformName(next.waveform) || typeof prev.waveform === "string" !== (typeof next.waveform === "string"),
    source: !same(prev.source, next.source),
    envelopeMode: prev.envelopeMode !== next.envelopeMode,
    irRingSeconds: prev.irRingSeconds !== next.irRingSeconds,
    amplitudes: false,
    voices: []
    // per index: Set of changed keys
  };
  const n = Math.max(prev.voices.length, next.voices.length);
  for (let i = 0; i < n; i++) {
    const a = prev.voices[i];
    const b = next.voices[i];
    const changed = /* @__PURE__ */ new Set();
    if (!a || !b) {
      for (const key of Object.keys(VOICE_KINDS)) changed.add(key);
      changed.add("amplitude");
    } else {
      if (a.amplitude !== b.amplitude) changed.add("amplitude");
      for (const key of Object.keys(VOICE_KINDS)) if (!same(a[key], b[key])) changed.add(key);
    }
    if (changed.has("amplitude")) d.amplitudes = true;
    d.voices[i] = changed;
  }
  return d;
}
function writeAppState(s, diff) {
  const midi = Math.min(127, Math.round(freqToMidi(s.fundamental)));
  updateAppState({
    fundamentalFrequency: s.fundamental,
    currentMidiNote: midi,
    currentOctave: Math.floor(midi / 12) - 1,
    isSubharmonic: s.subharmonic,
    startHarmonic: s.system.startHarmonic,
    stiffnessB: s.system.stiffnessB,
    tubeClosedness: s.system.tubeClosedness,
    stretchA: s.system.stretchA,
    compressA: s.system.compressA,
    masterGainValue: s.masterGain,
    masterSlewValue: s.masterSlew,
    currentWaveform: resolveWaveform(waveformName(s.waveform)),
    waveformMorph: typeof s.waveform === "string" ? null : { a: resolveWaveform(s.waveform.a), b: resolveWaveform(s.waveform.b), t: s.waveform.t },
    sourceMode: s.source.mode,
    adcDeviceId: s.source.adcDeviceId,
    adcChannel: s.source.adcChannel,
    soundfileLoop: s.source.soundfile.loop,
    soundfileRange: Array.isArray(s.source.soundfile.range) && s.source.soundfile.range.length === 2 ? [...s.source.soundfile.range] : null,
    soundfileFundamental: s.source.soundfile.fundamental,
    envelopeMode: s.envelopeMode,
    irRingSeconds: s.irRingSeconds
  });
  if (diff.system) {
    if (s.system.index === INTERPOLATED_SYSTEM) {
      AppState.currentSystemIndex = INTERPOLATED_SYSTEM;
      AppState.currentSystem = interpolatedSystem(s.system.ratios);
    } else {
      setCurrentSystem(s.system.index);
    }
  }
  const count = Math.max(s.voices.length, AppState.currentSystem.ratios.length);
  const amps = [];
  const pans = [];
  const gates = {};
  const filters = {};
  const drives = {};
  const convolutions = {};
  const envelopes = {};
  const sequencers = {};
  for (let i = 0; i < count; i++) {
    const v = s.voices[i];
    amps[i] = v?.amplitude || 0;
    if (!v) continue;
    pans[i] = v.pan;
    gates[i] = { ...v.gate, seq: [...v.gate.seq] };
    filters[i] = { ...v.filter };
    drives[i] = v.drive;
    convolutions[i] = { ...v.convolution, ir: irManager.has(v.convolution.ir) ? v.convolution.ir : null };
    envelopes[i] = { ...v.envelope };
    sequencers[i] = { shape: v.sequencer.shape, stretch: v.sequencer.stretch, amounts: { ...v.sequencer.amounts } };
  }
  updateAppState({
    harmonicAmplitudes: amps,
    oscillatorPans: pans,
    oscillatorGates: gates,
    oscillatorFilters: filters,
    oscillatorDrives: drives,
    oscillatorConvolutions: convolutions,
    oscillatorEnvelopes: envelopes,
    oscillatorSequencers: sequencers
  });
}
function resolveWaveform(name) {
  if (!name.startsWith("custom_")) return name;
  return getWavetableManager()?.has(name) ? name : "sine";
}
function interpolatedSystem(ratios) {
  return {
    name: "Interpolated",
    description: "Overtone frequencies interpolated between presets A and B \u2014 every voice glides from one system\u2019s partial to the other\u2019s.",
    ratios: [...ratios],
    labels: ratios.map((r) => r >= 100 ? r.toFixed(1) : r.toFixed(3))
  };
}
function writeAudioFast(s, diff, ramp) {
  if (diff.masterGain) audioEngine.master.setGain(s.masterGain, ramp);
  const pitchChanged = diff.fundamental || diff.subharmonic || diff.system;
  const waveform = diff.waveform && s.source.mode === "oscillators" ? harmonicWaveformPayload() : void 0;
  const ratios = AppState.currentSystem.ratios;
  for (const [i, voice] of audioEngine.voices) {
    const v = s.voices[i];
    const changed = diff.voices[i];
    if (!v || !changed || i >= ratios.length) continue;
    const params = {};
    const frequency = calculateFrequency(ratios[i]);
    if (waveform) params.waveform = waveform;
    if (pitchChanged) params.frequency = frequency;
    if (changed.has("amplitude") || diff.masterGain) params.gain = v.amplitude * s.masterGain;
    if (pitchChanged || changed.has("filter")) {
      params.filter = { cutoff: harmonicFilterCutoff(i, frequency), q: v.filter.q, type: v.filter.type };
    }
    if (changed.has("drive")) params.drive = v.drive;
    if (changed.has("pan")) params.pan = v.pan;
    if (changed.has("convolution")) {
      const c = v.convolution;
      const bypassed = !AppState.oscillatorConvolutions[i]?.ir;
      params.convolution = bypassed ? { gain: c.gain } : { wet: c.wet, feedback: c.feedback, gain: c.gain };
    }
    if (Object.keys(params).length) voice.set(params, ramp);
  }
}
function mergeDeferred(acc, diff, prev) {
  const d = acc || { flags: {}, voices: /* @__PURE__ */ new Map(), fromInterpolated: prev.system.index === INTERPOLATED_SYSTEM };
  for (const key of Object.keys(diff)) if (diff[key] === true) d.flags[key] = true;
  diff.voices.forEach((changed, i) => {
    if (changed.size === 0) return;
    const set = d.voices.get(i) || /* @__PURE__ */ new Set();
    for (const key of changed) set.add(key);
    d.voices.set(i, set);
  });
  return d;
}
function flush() {
  const d = deferred;
  deferred = null;
  if (!d) return;
  const f = d.flags;
  const playing = AppState.isPlaying;
  if (playing) {
    if (f.source) {
      restartAudio();
    } else {
      if (f.fundamental || f.subharmonic || f.system) updateAudioProperties();
      for (const [i, changed] of d.voices) {
        if (changed.has("gate")) updateHarmonicGate(i);
        if (changed.has("filter")) updateHarmonicFilter(i);
        if (changed.has("convolution")) updateHarmonicConvolution(i);
        if (changed.has("sequencer")) updateHarmonicSequencer(i);
      }
      if (f.envelopeMode) updateAllHarmonicEnvelopeModes();
    }
  }
  const dispatch = (name, detail) => document.dispatchEvent(new CustomEvent(name, detail === void 0 ? void 0 : { detail }));
  if (f.fundamental) dispatch(FUNDAMENTAL_CHANGED);
  if (f.subharmonic) dispatch(SUBHARMONIC_TOGGLED, { isSubharmonic: AppState.isSubharmonic });
  if (f.system) dispatchSystemChanged(d.fromInterpolated && AppState.currentSystemIndex === INTERPOLATED_SYSTEM);
  if (f.masterGain) dispatch(MASTER_GAIN_CHANGED, { value: AppState.masterGainValue });
  if (f.masterSlew) dispatch(MASTER_SLEW_CHANGED, { value: AppState.masterSlewValue });
  if (f.waveformName) dispatch(CURRENT_WAVEFORM_CHANGED, { currentWaveform: AppState.currentWaveform });
  if (f.source) dispatch(SOURCE_CHANGED, { sourceMode: AppState.sourceMode });
  if (f.envelopeMode) dispatch(ENVELOPE_MODE_CHANGED);
  if (f.irRingSeconds) dispatch(IR_RING_CHANGED);
  if (f.amplitudes && !f.system) dispatch(DRAWBARS_RESET);
  for (const [index, changed] of d.voices) {
    for (const key of changed) {
      if (VOICE_KINDS[key]) dispatch(OVERTONE_SIGNAL_CHANGED, { index, kind: VOICE_KINDS[key] });
    }
  }
}
function dispatchSystemChanged(throttle) {
  const now = performance.now();
  if (throttle && now - lastSystemEvent < SYSTEM_EVENT_MIN_MS) {
    if (systemEventTimer === null) {
      systemEventTimer = setTimeout(() => {
        systemEventTimer = null;
        dispatchSystemChanged(false);
      }, SYSTEM_EVENT_MIN_MS - (now - lastSystemEvent));
    }
    return;
  }
  clearTimeout(systemEventTimer);
  systemEventTimer = null;
  lastSystemEvent = now;
  const index = AppState.currentSystemIndex;
  const detail = index === INTERPOLATED_SYSTEM ? { system: AppState.currentSystem } : { index, system: AppState.currentSystem };
  document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, { detail }));
}

// js/modules/presets/presetActions.js
var CROSSFADER_MAX = 127;
var state3 = {
  selected: 0,
  // bank the Store/Recall buttons act on
  loaded: null,
  // bank the sound came from, or null
  loadedState: null,
  dirty: false
};
var frames = null;
var dirtyCheck = null;
var before = null;
var lastCrossfadeAt = -Infinity;
function emit2() {
  document.dispatchEvent(new CustomEvent(PRESETS_CHANGED));
}
var validBank = (index) => Number.isInteger(index) && index >= 0 && index < BANK_COUNT;
var PresetActions = {
  get selected() {
    return state3.selected;
  },
  get loaded() {
    return state3.loaded;
  },
  get dirty() {
    return state3.dirty;
  },
  get slotA() {
    return presetConfig.slotA;
  },
  get slotB() {
    return presetConfig.slotB;
  },
  get position() {
    return presetConfig.position;
  },
  /** Both crossfader banks assigned and stored. */
  get canCrossfade() {
    return presetStore.has(presetConfig.slotA) && presetStore.has(presetConfig.slotB);
  },
  select(index) {
    if (!validBank(index) || index === state3.selected) return;
    state3.selected = index;
    emit2();
  },
  /** Save the current sound into the selected bank. */
  store(name) {
    const index = state3.selected;
    const existing = presetStore.get(index);
    presetStore.set(index, { name: name ?? existing?.name ?? "", state: capture() });
    before = null;
    this._markLoaded(index);
    this._invalidateFrames(index);
    showStatus(`Stored preset ${index + 1}`, "success");
    emit2();
  },
  /** Load the selected bank (or `index`) into the sound. */
  recall(index = state3.selected) {
    const bank = presetStore.get(index);
    if (!bank) return;
    state3.selected = index;
    applySnapshot(bank.state, { immediate: true });
    before = null;
    this._markLoaded(index);
    emit2();
  },
  rename(index, name) {
    presetStore.rename(index, name);
    emit2();
  },
  clear(index = state3.selected) {
    if (!presetStore.has(index)) return;
    presetStore.clear(index);
    if (state3.loaded === index) {
      state3.loaded = null;
      state3.loadedState = null;
      state3.dirty = false;
    }
    if (presetConfig.slotA === index) presetConfig.slotA = null;
    if (presetConfig.slotB === index) presetConfig.slotB = null;
    persistAppConfig();
    this._invalidateFrames(index);
    emit2();
  },
  // --- interpolation ---
  setSlotA(index) {
    this._setSlot("slotA", index);
  },
  setSlotB(index) {
    this._setSlot("slotB", index);
  },
  _setSlot(key, index) {
    const next = validBank(index) && presetStore.has(index) ? index : null;
    if (presetConfig[key] === next) return;
    presetConfig[key] = next;
    persistAppConfig();
    frames = null;
    emit2();
  },
  /**
   * Move the crossfader (0-127) and sound the frame there. Position 0
   * is bank A exactly, 127 bank B exactly.
   */
  setCrossfade(position) {
    const p = Math.max(0, Math.min(CROSSFADER_MAX, Math.round(Number(position) || 0)));
    presetConfig.position = p;
    persistAppConfig();
    const frame2 = this.frame(p);
    if (frame2) {
      before ??= capture();
      lastCrossfadeAt = performance.now();
      applySnapshot(frame2);
    }
    emit2();
  },
  /** A crossfade is set up (both banks assigned) or has been sounded since. */
  get crossfading() {
    return this.canCrossfade || before !== null;
  },
  /**
   * Unassign A and B and put the sound back to what it was before the
   * fader first moved (the last non-interpolated state).
   */
  clearInterpolation() {
    presetConfig.slotA = null;
    presetConfig.slotB = null;
    presetConfig.position = 0;
    persistAppConfig();
    frames = null;
    if (before) {
      applySnapshot(before, { immediate: true });
      before = null;
    }
    this._scheduleDirtyCheck();
    emit2();
  },
  /** The snapshot at crossfader position `p`, or null without both banks. */
  frame(p) {
    if (!this.canCrossfade) return null;
    if (!frames) {
      frames = new Array(CROSSFADER_MAX + 1).fill(null);
      frames.a = presetStore.get(presetConfig.slotA).state;
      frames.b = presetStore.get(presetConfig.slotB).state;
    }
    return frames[p] ??= interpolate(frames.a, frames.b, p / CROSSFADER_MAX);
  },
  // --- JSON ---
  /** The current sound as a JSON document (what the JSON view shows). */
  toJSON() {
    return JSON.stringify({ twig: PRESET_VERSION, ...capture() }, null, 2);
  },
  /** Apply a pasted JSON document to the sound; false when unparseable. */
  applyJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      showStatus(`Not valid JSON: ${err.message}`, "error");
      return false;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      showStatus("Expected a JSON object", "error");
      return false;
    }
    const snapshot = parsed.state && typeof parsed.state === "object" ? parsed.state : parsed;
    applySnapshot(sanitize(snapshot), { immediate: true });
    before = null;
    showStatus("Applied JSON state", "success");
    this._scheduleDirtyCheck();
    return true;
  },
  // --- dirty tracking ---
  /** Call once at boot: any sound change re-evaluates "dirty". */
  watch(events) {
    for (const name of events) document.addEventListener(name, () => this._scheduleDirtyCheck());
  },
  _markLoaded(index) {
    state3.loaded = index;
    state3.loadedState = capture();
    state3.dirty = false;
  },
  _scheduleDirtyCheck() {
    if (dirtyCheck !== null) return;
    dirtyCheck = requestAnimationFrame(() => {
      dirtyCheck = null;
      if (performance.now() - lastCrossfadeAt > 250) before = null;
      if (state3.loaded === null) return;
      const dirty = !snapshotsEqual(capture(), state3.loadedState);
      if (dirty !== state3.dirty) {
        state3.dirty = dirty;
        emit2();
      }
    });
  },
  _invalidateFrames(index) {
    if (index === presetConfig.slotA || index === presetConfig.slotB) frames = null;
  }
};

export {
  PATTERNS,
  patternById,
  patternPeriod,
  patternIdFromName,
  patternParams,
  Q_MAX,
  DRIVE_MAX,
  ENV_TIME_MAX,
  CONV_FEEDBACK_MAX,
  OvertoneSignalActions,
  themeColor,
  partialColor,
  Sketch,
  strokePath,
  withAlpha,
  TonewheelActions,
  getWaveValue,
  layoutMode,
  SURFACES,
  surfaceState,
  MANAGE_FILES_OPTION,
  mountSettings,
  openSettings,
  CURRENT_WAVEFORM_CHANGED,
  waveformMenuNames,
  handleWaveformChange,
  setCurrentWaveform,
  handleAddToWaveforms,
  syncWaveformOptions,
  restoreWaveformOptions,
  BANK_COUNT,
  presetStore,
  CROSSFADER_MAX,
  PresetActions
};
