import { AppState } from "../../config.js";
import { partialColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { calculateFrequency, formatHz, getVoicePan } from "../../utils.js";
import { getVoiceLevel, partialFrequency, triggerHarmonicAttack, triggerHarmonicRelease, MAX_FILTER_PARTIALS } from "../../audio.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { OvertoneSignalActions, Q_MAX, DRIVE_MAX, CONV_FEEDBACK_MAX } from "../overtoneSignal/overtoneSignalActions.js";
import { Dial } from "../generic/dial/Dial.js";
import { drawShapeContour, shapeIconDataURL } from "../overtoneSignal/sequencePreview.js";
import { shapedRow, stepShapeCycles } from "./rowShape.js";
import { showStatus } from "../../domUtils.js";
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
        this._dials = { pan: [], res: [], drive: [], x: [], y: [], convfb: [], convgain: [], convtune: [] };
        this._irSteppers = [];
        this._dots = [];
        this._dotLevels = [];
        this._meterRaf = null;
        this._waveSteppers = [];
        this._modeSteppers = [];
        this._trackResizeObserver = null;
        // Row sculpting ("shape"): on while the Mix header's shape toggle
        // is pressed — every drag then shapes the whole row — or for the
        // duration of a shift-drag. Shape period in row-widths, the last
        // gesture so the panel's controls can re-apply it, and an optional
        // contour override (null = follow the main oscillator waveform).
        this.shapeMode = false;
        this._shapeCycles = 1;
        this._lastShaped = null;
        this._rowShape = null;
        this._shapePanel = null;
        // Assigned by the controller
        this.onInspect = null;
        this.onShapeModeChange = null;
    }

    /** Contour used for row sculpting. */
    rowShapeName() {
        return this._rowShape || AppState.currentWaveform;
    }

    /** Does this gesture sculpt the row? The toggle, or shift held. */
    isShapeGesture(e) {
        return this.shapeMode || Boolean(e?.shiftKey);
    }

    /**
     * Shape mode on/off. Marks the strip so CSS can flag the bars as
     * row-linked, and hands the panel to the controller, which docks it
     * above the strip (this scrolling row is no place for it):
     * onShapeModeChange(on, panelEl | null).
     */
    setShapeMode(on) {
        on = Boolean(on);
        if (on === this.shapeMode) return;
        this.shapeMode = on;
        this.el.classList.toggle("shape-mode", on);
        this.onShapeModeChange?.(on, on ? this.shapePanel() : null);
    }

    /** Back to defaults (one cycle, the oscillator's own contour) — leaving the Mix surface. */
    resetShape() {
        this.setShapeMode(false);
        this._shapeCycles = 1;
        this._rowShape = null;
        this._lastShaped = null;
    }

    render(props = {}) {
        // Unbind the previous render's listeners before discarding its DOM —
        // relying on the caller (BaseController.update()) to do this first
        // is an unwritten invariant; calling it here matches every other
        // component and keeps this one correct even if called directly.
        this.teardown();
        this.el.innerHTML = "";
        this.sliders = [];
        this._dials = { pan: [], res: [], drive: [], x: [], y: [], convfb: [], convgain: [], convtune: [] };
        this._irSteppers = [];
        this._dots = [];
        this._waveSteppers = [];
        this._modeSteppers = [];

        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
        // Re-renders keep shape mode (and the docked panel, which lives
        // outside this element) — only the strip's marker needs restating
        this.el.classList.toggle("shape-mode", this.shapeMode);
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

        // Column label: open that overtone in the inspector (touch has no
        // right-click; the label is the one always-present tap target)
        this.bindEvent(this.el, "click", (e) => {
            const label = e.target.closest(".drawbar-label");
            const drawbar = label?.closest(".drawbar");
            if (!drawbar || drawbar.dataset.index === undefined) return;
            this.openOvertoneSettings(Number(drawbar.dataset.index));
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
                    if (this.isShapeGesture(e) && this.view !== "sequence") {
                        // Shape: sculpt the whole row with the contour, peak
                        // on the dragged column. Gain shapes amplitudes,
                        // convolution shapes wet/dry, filter shapes series
                        // steps.
                        const idx = Number(slider.dataset.index);
                        const v = Number(slider.value);
                        if (this.view === "gain") {
                            this.applyShapedRow(idx, v, (i, ti) =>
                                this.onChange?.(i, Math.round(ti * 100) / 100));
                        } else if (this.view === "convolution") {
                            this.applyShapedRow(idx, v, (i, ti) =>
                                OvertoneSignalActions.setConvolution(i, { wet: Math.round(ti * 100) / 100 }));
                        } else {
                            this.applyShapedRow(idx, v / MAX_FILTER_PARTIALS, (i, ti) =>
                                OvertoneSignalActions.setFilter(i, {
                                    ...OvertoneSignalActions.getFilter(i),
                                    multiplier: Math.round(ti * MAX_FILTER_PARTIALS),
                                }));
                        }
                        slider.setAttribute("aria-valuenow", slider.value);
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
                const onMove = (ev) => applyPointer(ev);
                wrapper.addEventListener("pointermove", onMove);
                wrapper.addEventListener("pointerup", () => {
                    wrapper.removeEventListener("pointermove", onMove);
                }, { once: true });
            });
        });

        this.startMeterLoop();
        this.syncTrackLengths();
        // A plain window-resize listener isn't enough: on both desktop and
        // embed, #drawbars-control-root's available height now depends on
        // the OTHER rows (full-height flex chain, page-arrangement.css) —
        // a system switch adding a param-dial row, a late web-font swap
        // reflowing label text, etc. all change it with no window resize
        // at all. Left stale, the visible track (.drawbar-track, height:
        // 100% of the wrapper — always current) and the slider's actual
        // draggable length (.drawbar-slider, sized from the cached
        // --drawbar-track-length var) drift apart: the focus ring lands on
        // the OLD, shorter length while the groove is drawn at the new
        // one. ResizeObserver watches the wrapper's box directly, however
        // it changes.
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

    /** External updates (modal edits, OSC/Max) → refresh visible controls. */
    /**
     * Convolution view: a column's wet slider and dials are disabled while
     * it has no IR (the engine bypasses the stage). The IR stepper stays
     * live so the column can be enabled.
     */
    applyConvEnabled(index, column = null) {
        if (this.view !== "convolution") return;
        const enabled = Boolean(OvertoneSignalActions.getConvolution(index).ir);
        const col = column || this.el.querySelector(`.drawbar[data-index="${index}"]`);
        const slider = col?.querySelector(".drawbar-slider");
        if (slider) slider.disabled = !enabled;
        col?.querySelector(".drawbar-input-wrapper")?.classList.toggle("drawbar-disabled", !enabled);
        for (const key of ["convfb", "convgain", "convtune"]) this._dials[key][index]?.setDisabled(!enabled);
    }

    syncSignal(index, kind) {
        if (kind === "pan") {
            this._dials.pan[index]?.setValue(getVoicePan(index));
        } else if (kind === "conv") {
            const c = OvertoneSignalActions.getConvolution(index);
            this._dials.convfb[index]?.setValue(c.feedback);
            this._dials.convgain[index]?.setValue(c.gain);
            this._dials.convtune[index]?.setValue(c.tune);
            this._irSteppers[index]?._refresh();
            this.applyConvEnabled(index);
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
            // Always-visible readout under the bar; syncFill keeps it current
            const readout = document.createElement("span");
            readout.className = "drawbar-value";
            readout.textContent = this.barValueText(index, conf.value);
            wrapper.appendChild(readout);
        }

        wrapper.appendChild(this.createAux(index));
        // Without an IR the convolution chain is bypassed — the column's
        // send controls read as inert until the stepper assigns one
        this.applyConvEnabled(index, wrapper);
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

        // Vertical stack: waveform stepper, mode stepper, then x/y dials.
        // Stretch, the 0/1 pattern and the modulation amounts are the
        // inspector's (column label opens it).
        const wave = this.waveStepper(
            () => OvertoneSignalActions.getSequencer(index).shape,
            (name, e) => {
                voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setSequencerShape(i, name));
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
            fineOnShift: false, // shift = shaped row
            onChange: (v, e) => {
                if (this.isShapeGesture(e)) {
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
                fineOnShift: false, // shift = shaped row
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, -1, 1, (i, val) => OvertoneSignalActions.setPan(i, val));
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
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, 0.1, Q_MAX, (i, val) =>
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
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, 0, DRIVE_MAX, (i, val) => OvertoneSignalActions.setDrive(i, val));
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
                min: -CONV_FEEDBACK_MAX, max: CONV_FEEDBACK_MAX, step: 0.01, value: conv.feedback, label: "feedback",
                color: "--accent-negative",
                format: (v) => `fb ${v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`,
                fineOnShift: false, // shift = shaped row
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, -CONV_FEEDBACK_MAX, CONV_FEEDBACK_MAX, (i, val) =>
                            OvertoneSignalActions.setConvolution(i, { feedback: val }));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { feedback: v }));
                    }
                },
            });
            const cgain = new Dial({
                min: 0, max: 1, step: 0.01, value: conv.gain, label: "gain",
                color: "--accent-positive",
                format: (v) => `${Math.round(v * 100)}%`,
                fineOnShift: false, // shift = shaped row
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, 0, 1, (i, val) =>
                            OvertoneSignalActions.setConvolution(i, { gain: val }));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { gain: v }));
                    }
                },
            });
            // Feedback comb tuning: 0 = the IR's own period, else a series
            // partial of the voice (the filter cutoff's convention)
            const tune = new Dial({
                min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: conv.tune, label: "tune",
                format: (v) => (v === 0 ? "period" : this.filterTipText(index, v)),
                fineOnShift: false, // shift = shaped row
                onChange: (v, e) => {
                    if (this.isShapeGesture(e)) {
                        this.shapeDialRow(index, v, 0, MAX_FILTER_PARTIALS, (i, val) =>
                            OvertoneSignalActions.setConvolution(i, { tune: Math.round(val) }));
                    } else {
                        voiceTargets(index, e).forEach((i) => OvertoneSignalActions.setConvolution(i, { tune: v }));
                    }
                },
            });
            this._dials.convfb[index] = fb;
            this._dials.convgain[index] = cgain;
            this._dials.convtune[index] = tune;
            const dials = document.createElement("div");
            dials.className = "drawbar-aux-dials";
            dials.append(fb.el, cgain.el, tune.el);
            aux.appendChild(dials);
        }

        return aux;
    }

    /**
     * Row sculpting (see rowShape.js): `t` is the dragged control's 0-1
     * position within its range; `setNorm(i, ti)` maps each voice's shaped
     * position back into the parameter. The gesture is remembered so the
     * shape panel's contour/cycle controls can re-apply it live.
     */
    applyShapedRow(index, t, setNorm) {
        const positions = shapedRow({
            count: AppState.currentSystem.ratios.length,
            index, t,
            cycles: this._shapeCycles,
            shapeName: this.rowShapeName(),
        });
        positions.forEach((ti, i) => setNorm(i, ti));
        this._lastShaped = { index, t, setNorm };
    }

    /** Shape gesture on a voice dial: normalize its value into its range and shape the row. */
    shapeDialRow(index, value, min, max, set) {
        const t = (value - min) / (max - min || 1);
        this.applyShapedRow(index, t, (i, ti) => set(i, min + ti * (max - min)));
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
     * Shape panel — docked in the strip while shape mode is on: the
     * contour tiled at the current cycle count, a ‹›-stepper picking the
     * sculpt contour (defaults to the oscillator waveform, without touching
     * it), and ÷2/×2 cycle buttons. Changing either re-applies the last
     * gesture, so the row follows live. Built once; its state is the
     * gesture's, so it survives strip re-renders. The controller docks it
     * above the strip (see setShapeMode).
     */
    shapePanel() {
        if (!this._shapePanel) {
            const el = document.createElement("div");
            el.className = "drawbar-shape-panel";

            const title = document.createElement("span");
            title.className = "drawbar-shape-title";
            title.textContent = "shape row";

            const canvas = document.createElement("canvas");
            canvas.className = "drawbar-shape-preview";
            canvas.width = 160;
            canvas.height = 44;
            // Escape the global viz-canvas sizing, same as the dials
            canvas.style.setProperty("width", "160px", "important");
            canvas.style.setProperty("height", "44px", "important");

            const cycles = document.createElement("div");
            cycles.className = "drawbar-shape-cycles";
            const label = document.createElement("span");
            label.className = "drawbar-shape-cycles-label";
            const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
            let stepper;
            const refresh = () => {
                label.textContent = fmt(this._shapeCycles);
                stepper?._refresh();
                drawShapeContour(canvas, this.rowShapeName(), this._shapeCycles);
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
                },
                "drawbar-shape-stepper"
            );
            const mkBtn = (text, factor) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "action-btn drawbar-shape-btn";
                b.textContent = text;
                b.title = text === "×2" ? "twice as many cycles across the row" : "half as many cycles across the row";
                b.addEventListener("click", () => {
                    this._shapeCycles = stepShapeCycles(this._shapeCycles, factor);
                    refresh();
                    reapply();
                });
                return b;
            };
            cycles.append(mkBtn("÷2", 0.5), label, mkBtn("×2", 2));
            el.append(title, canvas, stepper, cycles);

            this._shapePanel = { el, refresh };
        }
        this._shapePanel.refresh();
        return this._shapePanel.el;
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

    /** Keep the track's meter fill and the under-bar readout in sync with a slider's value. */
    syncFill(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        const value = parseFloat(slider.value);
        const bar = slider.closest(".drawbar");
        if (!bar) return;
        bar.style.setProperty("--drawbar-fill", (value - min) / (max - min || 1));
        const readout = bar.querySelector(".drawbar-value");
        if (readout) readout.textContent = this.barValueText(Number(slider.dataset.index), value);
    }

    /**
     * Short readout for the active view's bar value — fits under a 64px
     * column. The filter view shows the series partial the cutoff sits on
     * (its Hz belongs to the inspector, not a one-line label).
     */
    barValueText(index, value) {
        if (this.view !== "filter") return `${Math.round(value * 100)}%`;
        const step = Math.round(value);
        if (step === 0) return "open";
        const labels = AppState.currentSystem.labels;
        return step <= labels.length ? labels[step - 1] : `+${step - labels.length}`;
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
        return `${label} · ${formatHz(partialFrequency(voiceFreq, step))}`;
    }

    setValue(index, value) {
        if (this.view === "gain" && this.sliders[index]) {
            this.sliders[index].value = value;
            this.syncFill(this.sliders[index]);
        }
    }

    /** Full per-overtone editor (the inspector) — label click, context menu. */
    openOvertoneSettings(index) {
        this.onInspect?.(index);
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
        addItem("Inspect Overtone", () => this.openOvertoneSettings(index));

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
        if (this._trackResizeObserver) {
            this._trackResizeObserver.disconnect();
            this._trackResizeObserver = null;
        }
        super.teardown();
    }
}
