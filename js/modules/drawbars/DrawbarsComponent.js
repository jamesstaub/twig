import { AppState } from "../../config.js";
import { partialColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { getVoiceLevel, triggerHarmonicAttack, triggerHarmonicRelease } from "../../audio.js";
import { OvertoneSignalActions } from "../overtoneSignal/overtoneSignalActions.js";
import { drawShapeContour, shapeIconDataURL } from "../overtoneSignal/sequencePreview.js";
import { shapedRow, stepShapeCycles } from "./rowShape.js";
import { FAMILIES, quantize } from "./drawbarParams.js";
import { Dial } from "../generic/dial/Dial.js";
import { voiceTargets } from "../generic/linkAll.js";
import { openOvertoneMenu, closeOvertoneMenu, armLongPress } from "../generic/overtoneMenu.js";
import { irManager } from "../../dsp/IRManager.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

/**
 * The drawbar strip: one column per overtone of the current system,
 * editing one parameter FAMILY (drawbarParams.js) at a time. The
 * family's chosen parameter (`paramIndex`) is on the bars; the family's
 * other parameters are dials under each bar — unless the strip is
 * `compact` (too short for them), in which case only the bars show and
 * the controller offers the parameters as tabs instead.
 *
 * Props: { family, paramIndex, compact, isSubharmonic }. Callbacks set by
 * the controller: onInspect(index), onShapeModeChange(on, panelEl).
 */
export class DrawbarsComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.family = "gain";
        this.paramIndex = 0;
        this.compact = false;
        this.sliders = [];
        this._dials = [];       // per column: { [param.key]: Dial }
        this._irSteppers = [];
        this._dots = [];
        this._dotLevels = [];
        this._meterRaf = null;
        this._trackResizeObserver = null;
        // Row sculpting ("shape"): on while the tool row's shape toggle is
        // pressed — every drag then shapes the whole row — or for the
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
     * under the strip (this scrolling row is no place for it):
     * onShapeModeChange(on, panelEl | null).
     */
    setShapeMode(on) {
        on = Boolean(on);
        if (on === this.shapeMode) return;
        this.shapeMode = on;
        this.el.classList.toggle("shape-mode", on);
        this.onShapeModeChange?.(on, on ? this.shapePanel() : null);
    }

    /** Back to defaults (one cycle, the oscillator's own contour) — leaving the strip's surfaces. */
    resetShape() {
        this.setShapeMode(false);
        this._shapeCycles = 1;
        this._rowShape = null;
        this._lastShaped = null;
    }

    render({ family = this.family, paramIndex = this.paramIndex, compact = this.compact, isSubharmonic } = {}) {
        // Unbind the previous render's listeners before discarding its DOM —
        // relying on the caller (BaseController.update()) to do this first
        // is an unwritten invariant; calling it here matches every other
        // component and keeps this one correct even if called directly.
        this.teardown();
        this.family = FAMILIES[family] ? family : "gain";
        this.paramIndex = paramIndex;
        this.compact = Boolean(compact);
        this.el.innerHTML = "";
        this.sliders = [];
        this._dials = [];
        this._irSteppers = [];
        this._dots = [];

        this.setupDrawbars();
        this.updateDrawbarLabels(isSubharmonic);
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
            // also edit the parameter.
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
        // A plain window-resize listener isn't enough: the strip's available
        // height depends on the OTHER rows (full-height flex chain,
        // page-arrangement.css) — a system switch adding a param-dial row, a
        // late web-font swap reflowing label text, etc. all change it with
        // no window resize at all. Left stale, the visible track
        // (.drawbar-track, height: 100% of the wrapper — always current) and
        // the slider's actual draggable length (.drawbar-slider, sized from
        // the cached --drawbar-track-length var) drift apart. ResizeObserver
        // watches the wrapper's box directly, however it changes.
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
        if (this.isShapeGesture(e)) {
            // Shape: sculpt the whole row with the contour, peak on the
            // pointed column — in the bar parameter's own units
            this.shapeParamRow(Number(slider.dataset.index), param, newValue);
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
        this._irSteppers[index]?._refresh();
        this.applyEnabled(index);
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
            this.el.appendChild(this.createDrawbar(i));
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

    createDrawbar(index) {
        const wrapper = document.createElement("div");
        wrapper.className = "drawbar";
        wrapper.dataset.index = index;
        // Color by the partial's consonance against the fundamental (matches
        // its ring in the p5 tonewheel), and expose the value as --drawbar-fill
        // so the track can render its meter lines up to the handle.
        wrapper.style.setProperty("--drawbar-color", partialColor(AppState.currentSystem.ratios[index]));
        // The column's label/aux areas keep horizontal panning so an
        // overflowing strip can still be scrolled from there; the track
        // itself is touch-action:none (CSS) — the strip owns that gesture.
        wrapper.style.touchAction = 'pan-x';

        const label = document.createElement("span");
        label.className = "drawbar-label";
        label.id = `drawbar-label-${index}`;
        this.updateContent(label, AppState.currentSystem.labels[index] || "");
        wrapper.appendChild(label);

        const param = this.barParam;
        const value = param.get(index);
        wrapper.appendChild(this.createSliderWrap(index, param, value));
        wrapper.style.setProperty("--drawbar-fill", (value - param.min) / (param.max - param.min || 1));
        // Always-visible readout under the bar; syncFill keeps it current
        const readout = document.createElement("span");
        readout.className = "drawbar-value";
        readout.textContent = param.format(index, value);
        wrapper.appendChild(readout);

        wrapper.appendChild(this.createAux(index));
        this.applyEnabled(index, wrapper);
        return wrapper;
    }

    createSliderWrap(index, { min, max, step }, value) {
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
     * Below every column: the live amplitude dot, the ADSR trigger pad,
     * the family's IR stepper (convolution), and — when the strip has the
     * height — the family's other parameters as dials.
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

        if (this.familyDef.irStepper) {
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

        const dialParams = this.dialParams;
        if (dialParams.length) {
            const dials = document.createElement("div");
            dials.className = "drawbar-aux-dials";
            this._dials[index] = {};
            for (const param of dialParams) {
                const dial = new Dial({
                    min: param.min, max: param.max, step: param.step, value: param.get(index),
                    label: param.label,
                    ...(param.color ? { color: param.color } : {}),
                    format: (v) => param.format(index, v),
                    fineOnShift: false, // shift = shaped row
                    onChange: (v, e) => {
                        if (this.isShapeGesture(e)) this.shapeParamRow(index, param, v);
                        else voiceTargets(index, e).forEach((i) => param.set(i, v));
                    },
                });
                this._dials[index][param.key] = dial;
                dials.appendChild(dial.el);
            }
            aux.appendChild(dials);
        }

        return aux;
    }

    /**
     * Row sculpting (see rowShape.js): the gestured control's value sets
     * the anchor position; every voice gets its shaped position mapped
     * back into the parameter's own range. Remembered so the shape
     * panel's contour/cycle controls can re-apply it live.
     */
    shapeParamRow(index, param, value) {
        const span = param.max - param.min || 1;
        const t = (value - param.min) / span;
        this.applyShapedRow(index, t, (i, ti) => param.set(i, quantize(param, param.min + ti * span)));
    }

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
     * Shape panel — docked under the strip while shape mode is on: the
     * contour tiled at the current cycle count, a ‹›-stepper picking the
     * sculpt contour (defaults to the oscillator waveform, without touching
     * it), and ÷2/×2 cycle buttons. Changing either re-applies the last
     * gesture, so the row follows live. Built once; its state is the
     * gesture's, so it survives strip re-renders. The controller docks it
     * (see setShapeMode).
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
        const param = this.barParam;
        const value = parseFloat(slider.value);
        const bar = slider.closest(".drawbar");
        if (!bar) return;
        bar.style.setProperty("--drawbar-fill", (value - param.min) / (param.max - param.min || 1));
        const readout = bar.querySelector(".drawbar-value");
        if (readout) readout.textContent = param.format(Number(slider.dataset.index), value);
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

    /** Full per-overtone editor (the inspector) — label click, context menu. */
    openOvertoneSettings(index) {
        this.onInspect?.(index);
    }

    /** The shared overtone menu, wherever it was summoned from. */
    showContextMenu(index, x, y) {
        openOvertoneMenu(index, x, y, { onInspect: (i) => this.openOvertoneSettings(i) });
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
}
