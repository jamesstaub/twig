import { AppState } from "../../config.js";
import { partialColor, themeColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { calculateFrequency, formatHz, getVoicePan } from "../../utils.js";
import { getVoiceLevel, harmonicFilterCutoff, triggerHarmonicAttack, triggerHarmonicRelease, MAX_FILTER_PARTIALS } from "../../audio.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { OvertoneSignalActions, Q_MAX, DRIVE_MAX, CONV_FEEDBACK_MAX } from "../overtoneSignal/overtoneSignalActions.js";
import { Dial } from "../generic/dial/Dial.js";
import { ValueTip } from "../generic/valueTip.js";
import { drawSequencePreview, shapeIconDataURL, shapeSampler } from "../overtoneSignal/sequencePreview.js";
import { showStatus } from "../../domUtils.js";
import OvertoneSignalModalComponent from "../generic/modal/OvertoneSignalModalComponent.js";
import { openModal, closeModal } from "../generic/modal/modalActions.js";
import { voiceTargets } from "../generic/linkAll.js";
import { irManager } from "../../dsp/IRManager.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

// Tab views over the same overtone columns: which parameter the column's
// main control edits. 'gain' is the classic drawbar amplitude view.
export const DRAWBAR_VIEWS = ["gain", "filter", "sequence", "convolution"];

// Sequence modes as single letters for the per-column cycle button
const SEQ_MODE_LETTERS = ["O", "A", "E", "P", "S"];
const SEQ_MODE_NAMES = ["off", "alternating", "euclidean", "probability", "sequence"];

// What the x/y dials mean per mode; null = the dial does nothing there.
// (Probability uses only x; off and 0/1-sequence use neither.)
const SEQ_PARAM_LABELS = [
    [null, null],                 // off
    ["cycles on", "cycles off"],  // alternating
    ["pulses", "steps"],          // euclidean
    ["probability %", null],      // probability
    [null, null],                 // sequence (pattern comes from the 0/1 string)
];

async function copyFrequency(freq) {
    const text = freq.toFixed(4).replace(/\.?0+$/, '');
    try {
        await navigator.clipboard.writeText(text);
        showStatus(`Copied ${text} Hz`, 'success');
    } catch {
        // Clipboard API unavailable (insecure context / embedded webview)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        showStatus(ok ? `Copied ${text} Hz` : 'Copy failed', ok ? 'success' : 'error');
    }
}

export class DrawbarsComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.sliders = [];
        this.view = "gain";
        this._dials = { pan: [], res: [], drive: [], x: [], y: [], convfb: [], convgain: [] };
        this._irSteppers = [];
        this._dots = [];
        this._dotLevels = [];
        this._meterRaf = null;
        this._waveSteppers = [];
        this._modeSteppers = [];
        // Shift+drag row sculpting: shape period in row-widths, the last
        // gesture so the tip controls can re-apply it, and an optional
        // contour override (null = follow the main oscillator waveform)
        this._shapeCycles = 1;
        this._lastShaped = null;
        this._rowShape = null;
    }

    /** Contour used for shift+drag sculpting. */
    rowShapeName() {
        return this._rowShape || AppState.currentWaveform;
    }

    render(props = {}) {
        // Unbind the previous render's listeners before discarding its DOM —
        // relying on the caller (BaseController.update()) to do this first
        // is an unwritten invariant; calling it here matches every other
        // component and keeps this one correct even if called directly.
        this.teardown();
        this.el.innerHTML = "";
        this.sliders = [];
        this._dials = { pan: [], res: [], drive: [], x: [], y: [], convfb: [], convgain: [] };
        this._irSteppers = [];
        this._dots = [];
        this._waveSteppers = [];
        this._modeSteppers = [];

        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
    }

    /**
     * Called by BaseComponent AFTER render().
     */
    bindRenderedEvents() {
        this.sliders = this.qAll(DRAWBAR_SLIDER_SELECTOR);

        // Right-click on any drawbar: frequency context menu
        this.bindEvent(this.el, "contextmenu", (e) => {
            const drawbar = e.target.closest(".drawbar");
            if (!drawbar || drawbar.dataset.index === undefined) return;
            e.preventDefault();
            this.showContextMenu(Number(drawbar.dataset.index), e.clientX, e.clientY);
        });

        this.sliders.forEach(slider => {
            // Keyboard (arrow keys) still uses the native range input event
            this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));

            // Pointer drag (mouse, touch, pen): the slider renders rotated
            // -90deg, but the browser's native drag tracking works in the
            // element's pre-rotation coordinate space — vertical pointer
            // movement barely registers. We own the whole gesture instead:
            // the wrapper's getBoundingClientRect() is in screen coordinates,
            // so map absolute clientY into the value range (top = max).
            // Vertical scroll is already blocked by touch-action: pan-x on
            // the .drawbar column.
            const wrapper = slider.parentElement; // .drawbar-input-wrapper

            const applyPointer = (e) => {
                const rect = wrapper.getBoundingClientRect();
                // Map pointer Y to the thumb CENTER's travel range
                // [thumb/2, height - thumb/2] — same geometry the value tip
                // uses, so grabbing the handle never jumps the value.
                const thumb = parseFloat(getComputedStyle(slider).getPropertyValue("--drawbar-thumb-length")) || 32;
                const travel = Math.max(1, rect.height - thumb);
                const offset = e.clientY - rect.top - thumb / 2;
                const t = 1 - Math.max(0, Math.min(1, offset / travel));
                const min = parseFloat(slider.min) || 0;
                const max = parseFloat(slider.max) || 1;
                const step = parseFloat(slider.step) || 0.01;
                const newValue = Math.round((min + t * (max - min)) / step) * step;
                if (String(newValue) !== slider.value) {
                    slider.value = newValue;
                    if (e.shiftKey && this.view !== "sequence") {
                        // Shift+drag: sculpt the whole row with the current
                        // oscillator waveform, peak on the dragged column.
                        // Gain shapes amplitudes; filter shapes series steps.
                        const idx = Number(slider.dataset.index);
                        const v = Number(slider.value);
                        if (this.view === "gain") {
                            this.applyShapedRow(idx, v, (i, ti) =>
                                this.onChange?.(i, Math.round(ti * 100) / 100));
                        } else {
                            this.applyShapedRow(idx, v / MAX_FILTER_PARTIALS, (i, ti) =>
                                OvertoneSignalActions.setFilter(i, {
                                    ...OvertoneSignalActions.getFilter(i),
                                    multiplier: Math.round(ti * MAX_FILTER_PARTIALS),
                                }));
                        }
                        slider.setAttribute("aria-valuenow", slider.value);
                        this.showShapeTip(slider);
                    } else {
                        // The pointer event carries the cmd/ctrl link modifier
                        this.handleDrawbarChange({ target: slider }, e);
                    }
                }
            };

            this.bindEvent(wrapper, "pointerdown", (e) => {
                if (e.button !== 0) return; // right-click stays with the context menu
                e.preventDefault(); // suppress the native (mis-mapped) slider drag
                slider.focus({ preventScroll: true }); // keep keyboard arrows working
                try {
                    wrapper.setPointerCapture(e.pointerId);
                } catch { /* synthetic pointer — drag still works */ }
                applyPointer(e);
                if (e.shiftKey && this.view !== "sequence") {
                    this.showShapeTip(slider);
                } else {
                    this.showSliderTip(slider);
                }
                const onMove = (ev) => applyPointer(ev);
                wrapper.addEventListener("pointermove", onMove);
                wrapper.addEventListener("pointerup", () => {
                    wrapper.removeEventListener("pointermove", onMove);
                }, { once: true });
            });
        });

        // Shift alone (before any drag) previews the shape tip over the
        // hovered column, so the gesture is discoverable and the cycle
        // buttons are reachable without committing a drag first
        this.bindEvent(document, "keydown", (e) => {
            if (e.key === "Shift" && !e.repeat && this.view !== "sequence") {
                const bar = this.el.querySelector(".drawbar:hover");
                if (bar) this.showShapeTip(bar);
            }
        });

        this.startMeterLoop();
        this.syncTrackLengths();
        this.bindEvent(window, "resize", () => this.syncTrackLengths());
    }

    /**
     * Publishes each column's actual rendered track length as
     * --drawbar-track-length, a CSS custom property on the wrapper
     * (inherited by its slider child) — the same JS↔CSS contract as
     * --drawbar-thumb-length. Runs unconditionally; only the embed
     * stylesheet reads it (the desktop slider keeps a fixed length), so
     * this component stays unaware of which layout is active. A rotated
     * slider's pre-rotation width becomes its visual length after the
     * -90deg transform — CSS alone can't derive that from a flex/grid-
     * stretched wrapper's height (percentages resolve against the same
     * axis, not the transposed one), so this measures post-layout instead.
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

    /** External updates (modal edits, OSC/Max) → refresh visible controls. */
    syncSignal(index, kind) {
        if (kind === "pan") {
            this._dials.pan[index]?.setValue(getVoicePan(index));
        } else if (kind === "conv") {
            const c = OvertoneSignalActions.getConvolution(index);
            this._dials.convfb[index]?.setValue(c.feedback);
            this._dials.convgain[index]?.setValue(c.gain);
            this._irSteppers[index]?._refresh();
            if (this.view === "convolution" && this.sliders[index]) {
                this.sliders[index].value = c.wet;
                this.syncFill(this.sliders[index]);
            }
        } else if (kind === "filter") {
            const f = OvertoneSignalActions.getFilter(index);
            this._dials.res[index]?.setValue(f.q);
            if (this.view === "filter" && this.sliders[index]) {
                this.sliders[index].value = f.multiplier;
                this.syncFill(this.sliders[index]);
            }
        } else if (kind === "drive") {
            this._dials.drive[index]?.setValue(OvertoneSignalActions.getDrive(index));
        } else if (kind === "gate" || kind === "seq") {
            const g = OvertoneSignalActions.getGate(index);
            this._dials.x[index]?.setValue(g.x);
            this._dials.y[index]?.setValue(g.y);
            this.applyModeToDials(index, g.mode);
            this._modeSteppers[index]?._refresh();
            this._waveSteppers[index]?._refresh();
        }
    }

    setupDrawbars() {
        const numPartials = AppState.currentSystem.ratios.length;

        // Grow-only, never wipe: a longer store than the current system
        // means hidden partials are keeping their state for later
        if (!Array.isArray(AppState.harmonicAmplitudes)) {
            AppState.harmonicAmplitudes = [];
        }
        for (let i = AppState.harmonicAmplitudes.length; i < numPartials; i++) {
            AppState.harmonicAmplitudes[i] = i === 0 ? 1.0 : 0.0;
        }

        for (let i = 0; i < numPartials; i++) {
            const value = AppState.harmonicAmplitudes[i];
            this.el.appendChild(this.createDrawbar(i, value));
        }
    }

    updateDrawbarLabels(isSubharmonic) {
        const labels = (isSubharmonic && AppState.currentSystem.subharmonicLabels)
            ? AppState.currentSystem.subharmonicLabels
            : AppState.currentSystem.labels;

        labels.forEach((txt, idx) => {
            const el = this.q(`#drawbar-label-${idx}`);
            this.updateContent(el, txt);
        });
    }

    createDrawbar(index, value) {
        const wrapper = document.createElement("div");
        wrapper.className = "drawbar";
        wrapper.dataset.index = index;
        // Color by the partial's consonance against the fundamental (matches
        // its ring in the p5 tonewheel), and expose the value as --drawbar-fill
        // so the track can render its meter lines up to the handle.
        wrapper.style.setProperty("--drawbar-color", partialColor(AppState.currentSystem.ratios[index]));
        // Disable browser touch handling for the entire drawbar column (label
        // area included) so our custom touch handler gets every gesture.
        wrapper.style.touchAction = 'pan-x';

        const label = document.createElement("span");
        label.className = "drawbar-label";
        label.id = `drawbar-label-${index}`;

        // TODO:
        // create a function to convert math labels into HTML formulas like 3^(4/13) would render as
        /**
         *   <msup>
                <mn>3</mn>
                <mfrac>
                <mn>4</mn>
                <mn>13</mn>
                </mfrac>
            </msup>
            </math>
         */

        this.updateContent(label, AppState.currentSystem.labels[index] || "");
        wrapper.appendChild(label);

        // Main control area — depends on the active view
        if (this.view === "sequence") {
            wrapper.appendChild(this.createSequenceStack(index));
            wrapper.style.setProperty("--drawbar-fill", 0);
        } else {
            const conf = this.view === "filter"
                ? { min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: OvertoneSignalActions.getFilter(index).multiplier }
                : this.view === "convolution"
                    ? { min: 0, max: 1, step: 0.01, value: OvertoneSignalActions.getConvolution(index).wet }
                    : { min: 0, max: 1, step: 0.01, value };
            wrapper.appendChild(this.createSliderWrap(index, conf));
            wrapper.style.setProperty("--drawbar-fill", (conf.value - conf.min) / (conf.max - conf.min || 1));
        }

        wrapper.appendChild(this.createAux(index));
        return wrapper;
    }

    createSliderWrap(index, { min, max, step, value }) {
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
        // Override CSS touch-action: pan-x so the browser doesn't intercept
        // the gesture before our touchstart fires.
        slider.style.touchAction = 'pan-x';

        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);
        return wrap;
    }

    /** Sequence view: X and Y pattern-parameter dials fill the column. */
    /**
     * Interactive tip content for the sequence view: the live sequence
     * preview with the ×2/÷2 stretch buttons beneath it. One shared
     * instance — only one control is adjusted at a time; button handlers
     * follow this._tipIndex.
     */
    seqTipContent(index) {
        this._tipIndex = index;
        if (!this._tipContent) {
            const wrap = document.createElement("div");
            wrap.className = "value-tip-seq";

            const canvas = document.createElement("canvas");
            canvas.className = "value-tip-preview";
            canvas.width = 160;
            canvas.height = 36;
            // Escape the global viz-canvas sizing, same as the dials
            canvas.style.setProperty("width", "160px", "important");
            canvas.style.setProperty("height", "36px", "important");
            wrap.appendChild(canvas);

            // 0/1 pattern input — only meaningful (and shown) in sequence
            // gate mode; the drawbar view otherwise has no way to type it
            const seqInput = document.createElement("input");
            seqInput.type = "text";
            seqInput.inputMode = "numeric";
            seqInput.className = "signal-seq-input tip-seq-input";
            seqInput.placeholder = "e.g. 10110";
            seqInput.addEventListener("input", () => {
                const clean = seqInput.value.replace(/[^01]/g, "");
                if (clean !== seqInput.value) seqInput.value = clean;
                const g = OvertoneSignalActions.getGate(this._tipIndex);
                OvertoneSignalActions.setGate(this._tipIndex, { ...g, seq: clean.split("").map(Number) });
                drawSequencePreview(canvas, this._tipIndex);
            });
            wrap.appendChild(seqInput);

            // No waveform stepper here — the column's own stepper covers it
            const row = document.createElement("div");
            row.className = "signal-stretch-row";
            const label = document.createElement("span");
            label.className = "signal-stretch-label";
            const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
            const refresh = () => {
                label.textContent = fmt(OvertoneSignalActions.getSequencer(this._tipIndex).stretch);
                const gate = OvertoneSignalActions.getGate(this._tipIndex);
                seqInput.style.display = gate.mode === 4 ? "" : "none";
                // Don't clobber in-progress typing
                if (document.activeElement !== seqInput) {
                    seqInput.value = (gate.seq || []).join("");
                }
                drawSequencePreview(canvas, this._tipIndex);
            };
            const mkBtn = (text, factor) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "action-btn signal-stretch-btn";
                b.textContent = text;
                b.addEventListener("click", () => {
                    const current = OvertoneSignalActions.getSequencer(this._tipIndex).stretch;
                    OvertoneSignalActions.setSequencerStretch(this._tipIndex, current * factor);
                    refresh();
                });
                return b;
            };
            row.append(mkBtn("÷2", 0.5), label, mkBtn("×2", 2));
            wrap.appendChild(row);

            this._tipContent = { wrap, refresh };
        }
        this._tipContent.refresh();
        return this._tipContent.wrap;
    }

    /**
     * Interactive tip (preview + stretch) BESIDE the column — interactive
     * tips must never cover the controls they describe (in the embed band
     * "above" clamps down onto them and steals the pointer).
     */
    showSeqTip(el, label, text, index) {
        const bar = el.closest(".drawbar") || el;
        const r = bar.getBoundingClientRect();
        ValueTip.show(text, r.left, r.top + r.height / 2, {
            label,
            interactive: true,
            autoHideMs: 1600,
            placement: "left",
            attachTo: bar,
            holdWhile: this.seqEngaged,
            onExpand: () => this.openOvertoneSettings(index),
            extra: this.seqTipContent(index),
        });
    }

    /** Apply mode-specific labels to a column's x/y dials, disabling unused ones. */
    applyModeToDials(index, mode) {
        const [xLabel, yLabel] = SEQ_PARAM_LABELS[mode] || [null, null];
        const x = this._dials.x[index];
        const y = this._dials.y[index];
        if (x) {
            x.setLabel(xLabel || "x");
            x.setDisabled(xLabel === null);
        }
        if (y) {
            y.setLabel(yLabel || "y");
            y.setDisabled(yLabel === null);
        }
    }

    createSequenceStack(index) {
        const stack = document.createElement("div");
        stack.className = "drawbar-dial-stack";
        const gate = OvertoneSignalActions.getGate(index);
        const tipExtra = () => this.seqTipContent(index);

        // Vertical stack: waveform stepper, mode stepper, then x/y dials
        const wave = this.waveStepper(
            () => OvertoneSignalActions.getSequencer(index).shape,
            (name, e) => {
                voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setSequencerShape(i, name));
                this.showSeqTip(wave, "wave", name, index);
            },
            "seq-stepper"
        );
        this._waveSteppers[index] = wave;

        const mode = this.cycleStepper({
            options: () => SEQ_MODE_LETTERS.map((_, m) => m),
            get: () => OvertoneSignalActions.getGate(index).mode,
            set: (m, e) => {
                voiceTargets(index, e).forEach((i) =>
                    OvertoneSignalActions.setGate(i, { ...OvertoneSignalActions.getGate(i), mode: m }));
                this.applyModeToDials(index, m);
                this.showSeqTip(mode, "mode", SEQ_MODE_NAMES[m], index);
            },
            className: "seq-stepper",
            render: (el, m) => {
                el.textContent = SEQ_MODE_LETTERS[m] || "O";
                el.title = `mode: ${SEQ_MODE_NAMES[m] || "off"}`;
            },
        });
        this._modeSteppers[index] = mode;

        const dials = document.createElement("div");
        dials.className = "drawbar-seq-controls";
        const gateDial = (key, label, getValue) => new Dial({
            min: 0, max: 32, step: 1, value: getValue, label,
            tipExtra,
            tipAnchor: this.dialTipAnchorLeft,
            tipPlacement: "left",
            grabFocus: true,
            tipHold: this.seqEngaged,
            fineOnShift: false, // shift = shaped row
            hostTip: (e) => e.shiftKey,
            onExpand: () => this.openOvertoneSettings(index),
            onChange: (v, e) => {
                if (e?.shiftKey) {
                    this.shapeDialRow(index, stack, v, 0, 32, (i, val) =>
                        OvertoneSignalActions.setGate(i, { ...OvertoneSignalActions.getGate(i), [key]: Math.round(val) }));
                } else {
                    voiceTargets(index, e).forEach((i) =>
                        OvertoneSignalActions.setGate(i, { ...OvertoneSignalActions.getGate(i), [key]: v }));
                }
            },
        });
        const x = gateDial("x", "x", gate.x);
        const y = gateDial("y", "y", gate.y);
        this._dials.x[index] = x;
        this._dials.y[index] = y;
        dials.append(x.el, y.el);
        this.applyModeToDials(index, gate.mode);

        stack.append(wave, mode, dials);
        return stack;
    }

    /** Below every column: live amplitude dot, plus the view's aux dial. */
    createAux(index) {
        const aux = document.createElement("div");
        aux.className = "drawbar-aux";

        const dot = document.createElement("span");
        dot.className = "drawbar-amp";
        this._dots[index] = dot;
        aux.appendChild(dot);

        // ADSR trigger pad: hold = attack/sustain, let go = release.
        // Always in the DOM; CSS shows it only under body.adsr-mode.
        aux.appendChild(this.createTriggerPad(index));

        if (this.view === "gain") {
            const pan = new Dial({
                min: -1, max: 1, step: 0.01, value: getVoicePan(index), label: "pan",
                format: (v) => (Math.abs(v) < 0.005 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`),
                tipAnchor: this.dialTipAnchor,
                fineOnShift: false, // shift = shaped row
                hostTip: (e) => e.shiftKey, // shape tip owns shift gestures
                onExpand: () => this.openOvertoneSettings(index),
                onChange: (v, e) => {
                    if (e?.shiftKey) {
                        this.shapeDialRow(index, aux, v, -1, 1, (i, val) => OvertoneSignalActions.setPan(i, val));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setPan(i, v));
                    }
                },
            });
            this._dials.pan[index] = pan;
            aux.appendChild(pan.el);
        } else if (this.view === "filter") {
            const res = new Dial({
                min: 0.1, max: Q_MAX, step: 0.05, value: OvertoneSignalActions.getFilter(index).q, label: "res",
                color: "--accent-negative",
                format: (v) => `Q ${v.toFixed(2)}`,
                fineOnShift: false, // shift = shaped row
                hostTip: (e) => e.shiftKey, // shape tip owns shift gestures
                onExpand: () => this.openOvertoneSettings(index),
                onChange: (v, e) => {
                    if (e?.shiftKey) {
                        this.shapeDialRow(index, aux, v, 0.1, Q_MAX, (i, val) =>
                            OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), q: val }));
                    } else {
                        voiceTargets(index, e).forEach((i) =>
                            OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), q: v }));
                    }
                },
            });
            const drive = new Dial({
                min: 0, max: DRIVE_MAX, step: 0.05, value: OvertoneSignalActions.getDrive(index), label: "drive",
                color: "--accent-positive",
                format: (v) => (v > 0 ? `${Math.round(v * 100)}%` : "clean"),
                fineOnShift: false, // shift = shaped row
                hostTip: (e) => e.shiftKey, // shape tip owns shift gestures
                onExpand: () => this.openOvertoneSettings(index),
                onChange: (v, e) => {
                    if (e?.shiftKey) {
                        this.shapeDialRow(index, aux, v, 0, DRIVE_MAX, (i, val) => OvertoneSignalActions.setDrive(i, val));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setDrive(i, v));
                    }
                },
            });
            this._dials.res[index] = res;
            this._dials.drive[index] = drive;
            const dials = document.createElement("div");
            dials.className = "drawbar-aux-dials";
            dials.append(res.el, drive.el);
            aux.appendChild(dials);
        } else if (this.view === "convolution") {
            const conv = OvertoneSignalActions.getConvolution(index);
            // Per-overtone IR picker: ‹ IR n › stepper over the session IRs
            // (buttons — native selects don't open inside jweb)
            const irStepper = this.cycleStepper({
                options: () => [null, ...irManager.list().map((ir) => ir.key)],
                get: () => OvertoneSignalActions.getConvolution(index).ir,
                set: (key, e) => {
                    voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { ir: key }));
                    this._irSteppers.forEach((st) => st?._refresh());
                },
                className: "conv-ir-stepper",
                render: (el, key) => {
                    const i = irManager.indexOf(key);
                    el.textContent = i < 0 ? "—" : `IR${i + 1}`;
                    el.title = i < 0 ? "no IR" : irManager.list()[i].name;
                },
            });
            this._irSteppers[index] = irStepper;
            aux.appendChild(irStepper);
            const fb = new Dial({
                min: 0, max: CONV_FEEDBACK_MAX, step: 0.01, value: conv.feedback, label: "feedback",
                color: "--accent-negative",
                format: (v) => `fb ${Math.round(v * 100)}`,
                fineOnShift: false, // shift = shaped row
                hostTip: (e) => e.shiftKey,
                onChange: (v, e) => {
                    if (e?.shiftKey) {
                        this.shapeDialRow(index, aux, v, 0, CONV_FEEDBACK_MAX, (i, val) =>
                            OvertoneSignalActions.setConvolution(i, { feedback: val }));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { feedback: v }));
                    }
                },
            });
            const cgain = new Dial({
                min: -1, max: 1, step: 0.01, value: conv.gain, label: "gain",
                color: "--accent-positive",
                format: (v) => v.toFixed(2),
                fineOnShift: false, // shift = shaped row
                hostTip: (e) => e.shiftKey,
                onChange: (v, e) => {
                    if (e?.shiftKey) {
                        this.shapeDialRow(index, aux, v, -1, 1, (i, val) =>
                            OvertoneSignalActions.setConvolution(i, { gain: val }));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { gain: v }));
                    }
                },
            });
            this._dials.convfb[index] = fb;
            this._dials.convgain[index] = cgain;
            const dials = document.createElement("div");
            dials.className = "drawbar-aux-dials";
            dials.append(fb.el, cgain.el);
            aux.appendChild(dials);
        }

        return aux;
    }

    /**
     * Shift+drag row sculpting: the dragged control tracks the pointer
     * exactly; every other voice blends between the oscillator waveform's
     * contour (its peak anchored on the dragged column, same 0-1 shapes the
     * sequencer uses) and that contour's inverse. Dragging to the top draws
     * the shape itself; to the bottom its negative; mid positions flatten
     * toward an even row.
     *
     * Works on normalized 0-1 POSITIONS: `t` is the dragged control's
     * position within its range, and `setNorm(i, ti)` maps each voice's
     * shaped position back into the parameter — so a shaped filter row sets
     * series steps (each voice's own Hz follows), not absolute outputs.
     */
    applyShapedRow(index, t, setNorm) {
        const count = AppState.currentSystem.ratios.length;
        const sample = shapeSampler(this.rowShapeName());

        // Anchor the contour's maximum on the dragged column
        let maxPhase = 0;
        let maxVal = -Infinity;
        for (let i = 0; i < 128; i++) {
            const s = sample(i / 128);
            if (s > maxVal) {
                maxVal = s;
                maxPhase = i / 128;
            }
        }

        for (let i = 0; i < count; i++) {
            const phase = ((maxPhase + ((i - index) / count) * this._shapeCycles) % 1 + 1) % 1;
            const s = sample(phase);
            setNorm(i, s * t + (1 - s) * (1 - t));
        }
        this._lastShaped = { index, t, setNorm };
    }

    /**
     * Shift-drag handler for a voice dial: normalize the dial value into
     * its range, shape the row, and show the interactive shape tip.
     */
    shapeDialRow(index, anchorEl, value, min, max, set) {
        const t = (value - min) / (max - min || 1);
        this.applyShapedRow(index, t, (i, ti) => set(i, min + ti * (max - min)));
        this.showShapeTip(anchorEl);
    }

    /**
     * Generic ‹ [current] › stepper: arrows step through options(), and
     * clicking the center cycles forward (multi-toggle behavior). Buttons
     * because native select dropdowns don't open inside jweb. Click events
     * ride along to set() so cmd-link (apply to all voices) works.
     */
    cycleStepper({ options, get, set, render, className = "" }) {
        const row = document.createElement("div");
        row.className = `cycle-stepper ${className}`.trim();
        const center = document.createElement("button");
        center.type = "button";
        center.className = "cycle-stepper-current";
        const refresh = () => render(center, get());
        const move = (step, e) => {
            const list = options();
            const i = Math.max(0, list.indexOf(get()));
            set(list[(i + step + list.length) % list.length], e);
            refresh();
        };
        const mkArrow = (text, step) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "cycle-stepper-arrow";
            b.textContent = text;
            b.addEventListener("click", (e) => move(step, e));
            return b;
        };
        center.addEventListener("click", (e) => move(1, e));
        row.append(mkArrow("‹", -1), center, mkArrow("›", 1));
        refresh();
        row._refresh = refresh;
        return row;
    }

    /** Waveform option list — always the main oscillator menu (customs included). */
    waveformNames() {
        const source = document.getElementById("waveform-select");
        return source ? [...source.options].map((o) => o.value) : ["sine", "square", "triangle", "sawtooth"];
    }

    /** ‹ [icon] › stepper over the waveform options. */
    waveStepper(getSelected, onPick, className) {
        return this.cycleStepper({
            options: () => this.waveformNames(),
            get: getSelected,
            set: onPick,
            className,
            render: (el, name) => {
                el.innerHTML = "";
                const img = document.createElement("img");
                img.src = shapeIconDataURL(name, { width: 22, height: 12, color: "--text-accent" });
                img.alt = name;
                el.title = name;
                el.appendChild(img);
            },
        });
    }

    /**
     * Interactive tip for the shape gesture: the waveform contour at the
     * current cycle count, a ‹›-stepper picking the sculpt contour (defaults
     * to the oscillator waveform, without touching it), and the same ÷2/×2
     * stretch controls as the sequencer tip.
     */
    shapeTipContent() {
        if (!this._shapeTip) {
            const wrap = document.createElement("div");
            wrap.className = "value-tip-seq";

            const canvas = document.createElement("canvas");
            canvas.className = "value-tip-preview";
            canvas.width = 160;
            canvas.height = 36;
            canvas.style.setProperty("width", "160px", "important");
            canvas.style.setProperty("height", "36px", "important");
            wrap.appendChild(canvas);

            const row = document.createElement("div");
            row.className = "signal-stretch-row";
            const label = document.createElement("span");
            label.className = "signal-stretch-label";
            const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
            let stepper;
            const refresh = () => {
                label.textContent = fmt(this._shapeCycles);
                stepper?._refresh();
                this.drawShapeTip(canvas);
            };
            const reapply = () => {
                if (this._lastShaped) {
                    const { index, t, setNorm } = this._lastShaped;
                    this.applyShapedRow(index, t, setNorm);
                }
            };
            stepper = this.waveStepper(
                () => this.rowShapeName(),
                (name) => {
                    this._rowShape = name;
                    refresh();
                    reapply();
                }
            );
            const mkBtn = (text, factor) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "action-btn signal-stretch-btn";
                b.textContent = text;
                b.addEventListener("click", () => {
                    this._shapeCycles = Math.max(0.25, Math.min(8, this._shapeCycles * factor));
                    refresh();
                    reapply();
                });
                return b;
            };
            // Stepper and stretch controls vertically stacked
            row.append(mkBtn("÷2", 0.5), label, mkBtn("×2", 2));
            wrap.append(stepper, row);

            this._shapeTip = { wrap, refresh };
        }
        this._shapeTip.refresh();
        return this._shapeTip.wrap;
    }

    /** The oscillator waveform's contour, tiled at the current cycle count. */
    drawShapeTip(canvas) {
        const ctx = canvas.getContext("2d");
        const { width: w, height: h } = canvas;
        ctx.fillStyle = themeColor("--viz-bg");
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = themeColor("--viz-grid");
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        const sample = shapeSampler(this.rowShapeName());
        ctx.strokeStyle = themeColor("--viz-trace");
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= w; i++) {
            const s = sample(((i / w) * this._shapeCycles) % 1);
            const y = 3 + (1 - s) * (h - 6);
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();
    }

    /**
     * Beside (left of) the gestured column, not above it: the interactive
     * tip must never cover the slider being dragged — in the short embed
     * band "above" clamps down onto the controls and steals the pointer.
     */
    showShapeTip(el) {
        const bar = el.closest(".drawbar") || el;
        const r = bar.getBoundingClientRect();
        ValueTip.show(this.rowShapeName(), r.left, r.top + r.height / 2, {
            label: "shape row",
            interactive: true,
            autoHideMs: 1600,
            placement: "left", // TODO: should auto choose L or R depending on space
            attachTo: bar,
            onExpand: () => this.openOvertoneSettings(Number(bar.dataset.index) || 0),
            extra: this.shapeTipContent(),
        });
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
            } catch { /* synthetic pointer — hold still works */ }
            pad.classList.add("held");
            triggerHarmonicAttack(index);
            pad.addEventListener("pointerup", release, { once: true });
            pad.addEventListener("pointercancel", release, { once: true });
        });
        return pad;
    }

    /** Keep the track's meter fill in sync with a slider's value. */
    syncFill(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        const t = (parseFloat(slider.value) - min) / (max - min || 1);
        slider.closest(".drawbar")?.style.setProperty("--drawbar-fill", t);
    }

    updateSingleDrawbar(index, value) {
        // rather than a full rerender, just set one slider value
        // (amplitude values only apply to the gain view's sliders)
        if (this.view === "gain" && this.sliders[index]) {
            this.sliders[index].value = value;
            this.syncFill(this.sliders[index]);
        }
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

        for (const i of targets) {
            if (this.view === "filter") {
                OvertoneSignalActions.setFilter(i, {
                    ...OvertoneSignalActions.getFilter(i),
                    multiplier: value,
                });
            } else if (this.view === "convolution") {
                OvertoneSignalActions.setConvolution(i, { wet: value });
            } else {
                this.onChange?.(i, value);
            }
        }
        e.target.setAttribute("aria-valuenow", value);
        this.syncFill(e.target);
        this.showSliderTip(e.target);
    }

    /**
     * The cutoff position's display text: the current overtone system's own
     * partial label plus the resulting frequency, matching the modal's dial
     * (e.g. "φ^2 · 660 Hz" on the golden ratio system).
     */
    filterTipText(index, step) {
        if (step === 0) return "open";
        const labels = AppState.currentSystem.labels;
        const label = step <= labels.length ? labels[step - 1] : `+${step - labels.length}`;
        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        return `${label} · ${formatHz(harmonicFilterCutoff(index, voiceFreq))}`;
    }

    /**
     * Floating readout (parameter name over value), pinned to one spot per
     * column (see columnTipPoint) so it never covers the controls.
     */
    showSliderTip(slider) {
        const bar = slider.closest(".drawbar");
        if (!bar) return;
        const value = parseFloat(slider.value);
        const text = this.view === "filter"
            ? this.filterTipText(Number(slider.dataset.index), Math.round(value))
            : `${Math.round(value * 100)}%`;
        const point = this.columnTipPoint(bar);
        ValueTip.show(text, point.x, point.y, {
            label: this.view === "filter" ? "cutoff" : this.view === "convolution" ? "wet/dry" : "gain",
            onExpand: () => this.openOvertoneSettings(Number(slider.dataset.index)),
        });
    }

    /**
     * Where a column's pinned tip goes: centered, at the top of the column —
     * except in the sequence view, where the controls sit vertically centered
     * inside the fixed-height dial stack; there the tip hugs the topmost
     * visible control instead of floating high above the empty space.
     */
    columnTipPoint(bar) {
        const rect = bar.getBoundingClientRect();
        let top = rect.top;
        const stack = bar.querySelector(".drawbar-dial-stack");
        if (stack) {
            const items = stack.querySelectorAll(".cycle-stepper, .mini-dial");
            const tops = Array.from(items, (el) => el.getBoundingClientRect().top);
            if (tops.length) top = Math.min(...tops);
        }
        return { x: rect.left + rect.width / 2, y: top };
    }

    /** Pins a dial's tip to its column's tip point (see columnTipPoint). */
    dialTipAnchor = (dial) => {
        const bar = dial.el.closest(".drawbar");
        return bar ? this.columnTipPoint(bar) : null;
    };

    /** Left-center of the dial's column — for left-placed interactive tips. */
    dialTipAnchorLeft = (dial) => {
        const bar = dial.el.closest(".drawbar");
        if (!bar) return null;
        const r = bar.getBoundingClientRect();
        return { x: r.left, y: r.top + r.height / 2 };
    };

    /**
     * True while any sequence-view control (x/y dial, mode button, wave
     * icon) or the tip itself holds focus — the seq tip stays open for as
     * long as this does. Focus lands on the buttons via click and on the
     * dials via grabFocus.
     */
    seqEngaged = () => {
        const a = document.activeElement;
        if (!a || a === document.body) return false;
        if (a.closest?.(".value-tip")) return true;
        return this.el.contains(a) && Boolean(a.closest(".drawbar-dial-stack"));
    };

    setValue(index, value) {
        if (this.view === "gain" && this.sliders[index]) {
            this.sliders[index].value = value;
            this.syncFill(this.sliders[index]);
        }
    }

    /** Full per-overtone editor — context menu and every tip's corner. */
    openOvertoneSettings(index) {
        const modal = new OvertoneSignalModalComponent(document.createElement('div'));
        openModal(modal, { index, onClose: () => closeModal() });
    }

    showContextMenu(index, x, y) {
        this.closeContextMenu();

        const ratio = AppState.currentSystem.ratios[index];
        if (!(ratio > 0)) return;
        const freq = calculateFrequency(ratio);
        const freqLabel = `${freq.toFixed(freq >= 100 ? 2 : 3)} Hz`;

        const menu = document.createElement("div");
        menu.className = "drawbar-context-menu";

        const addItem = (label, action) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "drawbar-context-menu-item";
            btn.textContent = label;
            btn.addEventListener("click", () => {
                this.closeContextMenu();
                action();
            });
            menu.appendChild(btn);
        };

        addItem(`Copy Frequency (${freqLabel})`, () => copyFrequency(freq));
        addItem("Set as Fundamental", () => DrawbarsActions.setDrawbarAsFundamental(index));
        addItem("Overtone Settings", () => this.openOvertoneSettings(index));

        // Body-attached + fixed so the drawbar strip's overflow can't clip it
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - rect.width - 4))}px`;
        menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - rect.height - 4))}px`;

        this._contextMenu = menu;
        this._menuDismiss = (e) => {
            if (!menu.contains(e.target)) this.closeContextMenu();
        };
        this._menuEsc = (e) => {
            if (e.key === "Escape") this.closeContextMenu();
        };
        // Defer so the opening right-click doesn't immediately dismiss
        setTimeout(() => {
            document.addEventListener("mousedown", this._menuDismiss);
            document.addEventListener("keydown", this._menuEsc);
        }, 0);
    }

    closeContextMenu() {
        if (this._contextMenu) {
            this._contextMenu.remove();
            this._contextMenu = null;
        }
        if (this._menuDismiss) {
            document.removeEventListener("mousedown", this._menuDismiss);
            this._menuDismiss = null;
        }
        if (this._menuEsc) {
            document.removeEventListener("keydown", this._menuEsc);
            this._menuEsc = null;
        }
    }

    teardown() {
        this.closeContextMenu();
        if (this._meterRaf) {
            cancelAnimationFrame(this._meterRaf);
            this._meterRaf = null;
        }
        super.teardown();
    }
}
