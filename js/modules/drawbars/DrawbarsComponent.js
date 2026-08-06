import { AppState } from "../../config.js";
import { partialColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { calculateFrequency, formatHz, getVoicePan } from "../../utils.js";
import { getVoiceLevel, harmonicFilterCutoff, MAX_FILTER_PARTIALS } from "../../audio.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { OvertoneSignalActions, Q_MAX } from "../overtoneSignal/overtoneSignalActions.js";
import { Dial } from "../generic/dial/Dial.js";
import { ValueTip } from "../generic/valueTip.js";
import { drawSequencePreview, shapeIconDataURL } from "../overtoneSignal/sequencePreview.js";
import { showStatus } from "../../domUtils.js";
import OvertoneSignalModalComponent from "../generic/modal/OvertoneSignalModalComponent.js";
import { openModal, closeModal } from "../generic/modal/modalActions.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

// Tab views over the same overtone columns: which parameter the column's
// main control edits. 'gain' is the classic drawbar amplitude view.
export const DRAWBAR_VIEWS = ["gain", "filter", "sequence"];

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
        this._dials = { pan: [], res: [], x: [], y: [] };
        this._dots = [];
        this._dotLevels = [];
        this._meterRaf = null;
        this._waveStrips = [];
        this._modeBtns = [];
    }

    render(props = {}) {
        this.el.innerHTML = "";
        this.sliders = [];
        this._dials = { pan: [], res: [], x: [], y: [] };
        this._dots = [];
        this._waveStrips = [];
        this._modeBtns = [];

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
                    this.handleDrawbarChange({ target: slider });
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
                this.showSliderTip(slider);
                const onMove = (ev) => applyPointer(ev);
                wrapper.addEventListener("pointermove", onMove);
                wrapper.addEventListener("pointerup", () => {
                    wrapper.removeEventListener("pointermove", onMove);
                }, { once: true });
            });
        });

        this.startMeterLoop();
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
        } else if (kind === "filter") {
            const f = OvertoneSignalActions.getFilter(index);
            this._dials.res[index]?.setValue(f.q);
            if (this.view === "filter" && this.sliders[index]) {
                this.sliders[index].value = f.multiplier;
                this.syncFill(this.sliders[index]);
            }
        } else if (kind === "gate" || kind === "seq") {
            const g = OvertoneSignalActions.getGate(index);
            this._dials.x[index]?.setValue(g.x);
            this._dials.y[index]?.setValue(g.y);
            this.applyModeToDials(index, g.mode);
            const btn = this._modeBtns[index];
            if (btn) {
                btn.textContent = SEQ_MODE_LETTERS[g.mode] || "O";
                btn.title = `mode: ${SEQ_MODE_NAMES[g.mode] || "off"} (click to cycle)`;
            }
            const strip = this._waveStrips[index];
            if (strip) {
                const shape = OvertoneSignalActions.getSequencer(index).shape;
                strip.querySelectorAll(".seq-wave-icon").forEach((b) =>
                    b.classList.toggle("active", b.dataset.shape === shape));
            }
        }
    }

    setupDrawbars() {
        const numPartials = AppState.currentSystem.ratios.length;

        if (!Array.isArray(AppState.harmonicAmplitudes) ||
            AppState.harmonicAmplitudes.length !== numPartials) {

            AppState.harmonicAmplitudes = Array(numPartials).fill(0);
            AppState.harmonicAmplitudes[0] = 1.0;
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
        this.updateContent(label, AppState.currentSystem.labels[index] || "");
        wrapper.appendChild(label);

        // Main control area — depends on the active view
        if (this.view === "sequence") {
            wrapper.appendChild(this.createSequenceStack(index));
            wrapper.style.setProperty("--drawbar-fill", 0);
        } else {
            const conf = this.view === "filter"
                ? { min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: OvertoneSignalActions.getFilter(index).multiplier }
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

            const row = document.createElement("div");
            row.className = "signal-stretch-row";
            const label = document.createElement("span");
            label.className = "signal-stretch-label";
            const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
            const refresh = () => {
                label.textContent = fmt(OvertoneSignalActions.getSequencer(this._tipIndex).stretch);
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

    /** Show an interactive tip (preview + stretch) above a column control. */
    showSeqTip(el, label, text, index) {
        const r = el.getBoundingClientRect();
        ValueTip.show(text, r.left + r.width / 2, r.top, {
            label,
            interactive: true,
            autoHideMs: 1600,
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
        const seq = OvertoneSignalActions.getSequencer(index);
        const tipExtra = () => this.seqTipContent(index);

        // Column: [waveform icon strip] | [mode + x/y dials]
        const strip = this.createWaveStrip(index, seq.shape);
        this._waveStrips[index] = strip;

        const controls = document.createElement("div");
        controls.className = "drawbar-seq-controls";

        controls.appendChild(this.createModeButton(index, gate.mode));

        const x = new Dial({
            min: 0, max: 32, step: 1, value: gate.x, label: "x",
            tipExtra,
            onChange: (v) => OvertoneSignalActions.setGate(index, { ...OvertoneSignalActions.getGate(index), x: v }),
        });
        const y = new Dial({
            min: 0, max: 32, step: 1, value: gate.y, label: "y",
            tipExtra,
            onChange: (v) => OvertoneSignalActions.setGate(index, { ...OvertoneSignalActions.getGate(index), y: v }),
        });
        this._dials.x[index] = x;
        this._dials.y[index] = y;
        controls.append(x.el, y.el);
        this.applyModeToDials(index, gate.mode);

        stack.append(strip, controls);
        return stack;
    }

    /**
     * Thin vertical waveform selector: one PNG icon per option from the
     * oscillator menu (customs included), click to select. Icons instead
     * of words, and no native dropdown — those don't open inside jweb.
     */
    createWaveStrip(index, selectedShape) {
        const strip = document.createElement("div");
        strip.className = "seq-wave-strip";
        const source = document.getElementById("waveform-select");
        const names = source ? Array.from(source.options).map((o) => o.value) : ["square", "sine", "triangle", "sawtooth"];

        for (const name of names) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "seq-wave-icon";
            btn.dataset.shape = name;
            btn.title = name;
            btn.classList.toggle("active", name === selectedShape);
            const img = document.createElement("img");
            img.src = shapeIconDataURL(name, { width: 16, height: 9 });
            img.alt = name;
            btn.appendChild(img);
            btn.addEventListener("click", () => {
                OvertoneSignalActions.setSequencerShape(index, name);
                strip.querySelectorAll(".seq-wave-icon").forEach((b) => b.classList.toggle("active", b === btn));
                this.showSeqTip(btn, "wave", name, index);
            });
            strip.appendChild(btn);
        }
        return strip;
    }

    /** Sequence-mode control: single letter, click cycles O→A→E→P→S. */
    createModeButton(index, mode) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seq-mode-btn";
        const apply = (m) => {
            btn.textContent = SEQ_MODE_LETTERS[m] || "O";
            btn.title = `mode: ${SEQ_MODE_NAMES[m] || "off"} (click to cycle)`;
        };
        apply(mode);
        btn.addEventListener("click", () => {
            const next = (OvertoneSignalActions.getGate(index).mode + 1) % SEQ_MODE_LETTERS.length;
            OvertoneSignalActions.setGate(index, { ...OvertoneSignalActions.getGate(index), mode: next });
            apply(next);
            this.applyModeToDials(index, next);
            this.showSeqTip(btn, "mode", SEQ_MODE_NAMES[next], index);
        });
        this._modeBtns[index] = btn;
        return btn;
    }

    /** Below every column: live amplitude dot, plus the view's aux dial. */
    createAux(index) {
        const aux = document.createElement("div");
        aux.className = "drawbar-aux";

        const dot = document.createElement("span");
        dot.className = "drawbar-amp";
        this._dots[index] = dot;
        aux.appendChild(dot);

        if (this.view === "gain") {
            const pan = new Dial({
                min: -1, max: 1, step: 0.01, value: getVoicePan(index), label: "pan",
                format: (v) => (Math.abs(v) < 0.005 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`),
                onChange: (v) => OvertoneSignalActions.setPan(index, v),
            });
            this._dials.pan[index] = pan;
            aux.appendChild(pan.el);
        } else if (this.view === "filter") {
            const res = new Dial({
                min: 0.1, max: Q_MAX, step: 0.05, value: OvertoneSignalActions.getFilter(index).q, label: "res",
                color: "--accent-negative",
                format: (v) => `Q ${v.toFixed(2)}`,
                onChange: (v) => OvertoneSignalActions.setFilter(index, { ...OvertoneSignalActions.getFilter(index), q: v }),
            });
            this._dials.res[index] = res;
            aux.appendChild(res.el);
        }

        return aux;
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

    handleDrawbarChange(e) {
        const index = Number(e.target.dataset.index);
        const value = Number(e.target.value);

        if (this.view === "filter") {
            OvertoneSignalActions.setFilter(index, {
                ...OvertoneSignalActions.getFilter(index),
                multiplier: value,
            });
        } else {
            this.onChange?.(index, value);
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

    /** Floating readout (parameter name over value) tracking the thumb. */
    showSliderTip(slider) {
        const wrap = slider.closest(".drawbar-input-wrapper");
        if (!wrap) return;
        const value = parseFloat(slider.value);
        const text = this.view === "filter"
            ? this.filterTipText(Number(slider.dataset.index), Math.round(value))
            : `${Math.round(value * 100)}%`;
        const rect = wrap.getBoundingClientRect();
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        const t = (value - min) / (max - min || 1);
        // Top edge of the thumb: its center travels through
        // [thumb/2, height - thumb/2] with top of wrapper = max
        const thumb = parseFloat(getComputedStyle(slider).getPropertyValue("--drawbar-thumb-length")) || 32;
        const y = rect.top + (1 - t) * (rect.height - thumb);
        ValueTip.show(text, rect.left + rect.width / 2, y, {
            label: this.view === "filter" ? "cutoff" : "gain",
        });
    }

    setValue(index, value) {
        if (this.view === "gain" && this.sliders[index]) {
            this.sliders[index].value = value;
            this.syncFill(this.sliders[index]);
        }
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
        addItem("Overtone Settings", () => {
            const modal = new OvertoneSignalModalComponent(document.createElement('div'));
            openModal(modal, { index, onClose: () => closeModal() });
        });

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
