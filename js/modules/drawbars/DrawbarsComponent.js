import { AppState } from "../../config.js";
import { partialColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { calculateFrequency } from "../../utils.js";
import { getVoiceLevel, triggerHarmonicAttack, triggerHarmonicRelease, MAX_FILTER_PARTIALS } from "../../audio.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { OvertoneSignalActions } from "../overtoneSignal/overtoneSignalActions.js";
import { drawSequencePreview, drawShapeContour, shapeIconDataURL } from "../overtoneSignal/sequencePreview.js";
import { shapedRow, stepShapeCycles } from "./rowShape.js";
import { showStatus } from "../../domUtils.js";
import { voiceTargets } from "../generic/linkAll.js";
import { openOvertoneMenu, closeOvertoneMenu, armLongPress } from "../generic/overtoneMenu.js";
import { irManager } from "../../dsp/IRManager.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

// Tab views over the same overtone columns: which parameter the column's
// main control edits. 'gain' is the classic drawbar amplitude view.
export const DRAWBAR_VIEWS = ["gain", "filter", "sequence", "convolution"];

// Sequence modes, short enough for a column-width summary line
const SEQ_MODE_SHORT = ["off", "alt", "euclid", "prob", "seq"];

export class DrawbarsComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.sliders = [];
        this.view = "gain";
        this._seqSummaries = [];
        this._irSteppers = [];
        this._dots = [];
        this._dotLevels = [];
        this._meterRaf = null;
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
        this._seqSummaries = [];
        this._irSteppers = [];
        this._dots = [];

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

        // Right-click anywhere on a column: the overtone menu. Touch has
        // no right-click, so a press-and-hold on the bar or the trigger
        // pad opens the same menu (see armLongPress below).
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

        // Keyboard (arrow keys) still uses the native range input event
        this.sliders.forEach((slider) => {
            this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));
        });

        // Pointer drag (mouse, touch, pen): ONE handler for the whole strip,
        // so a finger can swipe ACROSS the columns and draw the spectrum —
        // every move applies to whichever column is under the pointer.
        // (We'd own the gesture anyway: the slider renders rotated -90deg
        // and the browser's native drag tracking works in its pre-rotation
        // space, so vertical movement barely registers. Each wrapper's
        // getBoundingClientRect() is in screen coordinates — clientY maps
        // into the value range, top = max.) Column geometry is snapshotted
        // once per gesture; touch-action:none on the tracks keeps the
        // browser from turning a sideways finger into a scroll.
        this.bindEvent(this.el, "pointerdown", (e) => {
            if (e.button !== 0) return; // right-click stays with the context menu
            const startWrapper = e.target.closest(".drawbar-input-wrapper");
            if (!startWrapper || !this.el.contains(startWrapper)) return;
            e.preventDefault(); // suppress the native (mis-mapped) slider drag
            startWrapper.querySelector(DRAWBAR_SLIDER_SELECTOR)?.focus({ preventScroll: true }); // keyboard arrows keep working

            const columns = this.qAll(".drawbar-input-wrapper")
                .map((wrapper) => ({ wrapper, slider: wrapper.querySelector(DRAWBAR_SLIDER_SELECTOR), rect: wrapper.getBoundingClientRect() }))
                .filter((c) => c.slider && !c.slider.disabled);
            if (!columns.length) return;

            const apply = (ev) => {
                const col = this.columnAt(columns, ev.clientX);
                if (col) this.applyPointerToColumn(col, ev);
            };
            try {
                this.el.setPointerCapture(e.pointerId);
            } catch { /* synthetic pointer — drag still works */ }

            const onMove = (ev) => apply(ev);
            let cancelPress = () => {};
            const end = () => {
                cancelPress();
                this.el.removeEventListener("pointermove", onMove);
                this.el.removeEventListener("pointerup", end);
                this.el.removeEventListener("pointercancel", end);
            };

            // Touch press-and-hold opens the overtone menu. The pointer-down
            // has already drawn the bar to the finger, so snapshot the row
            // first and put it back: a press that opens a menu must not
            // also edit the spectrum.
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
        const pitch = columns.length > 1
            ? Math.abs(columns[1].rect.left - columns[0].rect.left)
            : columns[0].rect.width * 2;
        return bestDist <= pitch ? best : null;
    }

    /**
     * Put a snapshot of the row's slider values back (an aborted gesture —
     * see the long press above). Routed through handleDrawbarChange so
     * whichever view is showing writes through its own parameter.
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
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        const step = parseFloat(slider.step) || 0.01;
        const newValue = Math.round((min + t * (max - min)) / step) * step;
        if (String(newValue) === slider.value) return;
        slider.value = newValue;
        if (this.isShapeGesture(e) && this.view !== "sequence") {
            // Shape: sculpt the whole row with the contour, peak on the
            // pointed column. Gain shapes amplitudes, convolution shapes
            // wet/dry, filter shapes series steps.
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
    }

    /**
     * External updates (inspector edits, OSC/Max) → the strip's visible
     * controls. Pan, resonance, drive and the convolution send dials have
     * no control here any more — the inspector shows them.
     */
    syncSignal(index, kind) {
        if (kind === "conv") {
            this._irSteppers[index]?._refresh();
            this.applyConvEnabled(index);
            if (this.view === "convolution" && this.sliders[index]) {
                this.sliders[index].value = OvertoneSignalActions.getConvolution(index).wet;
                this.syncFill(this.sliders[index]);
            }
        } else if (kind === "filter") {
            if (this.view === "filter" && this.sliders[index]) {
                this.sliders[index].value = OvertoneSignalActions.getFilter(index).multiplier;
                this.syncFill(this.sliders[index]);
            }
        } else if (kind === "gate" || kind === "seq") {
            this.refreshSequenceSummary(index);
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
            wrapper.appendChild(this.createSequenceSummary(index));
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

        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);
        return wrap;
    }

    /**
     * Sequence view: a read-only summary of the column's sequencer — the
     * same preview the inspector draws, plus mode and stretch — that opens
     * the inspector on tap. Editing lives there; the per-column dials were
     * unusable on touch and hard to read anywhere.
     */
    createSequenceSummary(index) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "drawbar-seq-summary";
        btn.title = "open in the inspector";
        btn.setAttribute("aria-label", `Sequence of overtone ${index + 1} — open in the inspector`);

        const canvas = document.createElement("canvas");
        canvas.className = "drawbar-seq-preview";
        canvas.width = 56;
        canvas.height = 44;
        const text = document.createElement("span");
        text.className = "drawbar-seq-text";
        btn.append(canvas, text);
        btn.addEventListener("click", () => this.openOvertoneSettings(index));

        this._seqSummaries[index] = { canvas, text };
        this.refreshSequenceSummary(index);
        return btn;
    }

    refreshSequenceSummary(index) {
        const s = this._seqSummaries[index];
        if (!s) return;
        const gate = OvertoneSignalActions.getGate(index);
        const seq = OvertoneSignalActions.getSequencer(index);
        drawSequencePreview(s.canvas, index);
        const stretch = seq.stretch >= 1 ? `×${seq.stretch}` : `÷${1 / seq.stretch}`;
        let params = "";
        if (gate.mode === 1 || gate.mode === 2) params = ` ${Math.round(gate.x)}/${Math.round(gate.y)}`;
        else if (gate.mode === 3) params = ` ${Math.round(gate.x)}%`;
        else if (gate.mode === 4) params = ` ${(gate.seq || []).length}`;
        s.text.textContent = `${SEQ_MODE_SHORT[gate.mode] || "off"}${params}\n${stretch}`;
    }

    /**
     * Below every column: the live amplitude dot and the ADSR trigger pad;
     * in the convolution view also the per-voice IR stepper (assigning
     * IRs across the row is a strip job — everything else per voice is
     * the inspector's).
     */
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

        if (this.view === "convolution") {
            // ‹ IR n › stepper over the session IRs (buttons — native
            // selects don't open inside jweb)
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
            // Press-and-hold = the overtone menu (touch's right-click).
            // Let the note go first, or it would sustain under the menu.
            armLongPress(pad, e, (x, y) => {
                release();
                this.showContextMenu(index, x, y);
            });
            pad.addEventListener("pointerup", release, { once: true });
            pad.addEventListener("pointercancel", release, { once: true });
        });
        pad.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            release();
            this.showContextMenu(index, e.clientX, e.clientY);
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

    /** The shared overtone menu, wherever it was summoned from. */
    showContextMenu(index, x, y) {
        openOvertoneMenu(index, x, y, { onInspect: (i) => this.openOvertoneSettings(i) });
    }

    closeContextMenu() {
        closeOvertoneMenu();
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
