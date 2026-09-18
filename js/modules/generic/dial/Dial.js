import { themeColor } from '../../../theme.js';

/**
 * Dial — minimal rotary control for tight spaces (drawbar columns).
 *
 * Canvas-drawn arc dial with vertical-drag interaction:
 *   drag up/down to change, shift-drag for fine control, double-click to
 *   reset (to `resetValue`, else the initial value). Exposes .el (mount
 *   it anywhere) and .setValue() for external state sync (no onChange echo).
 *
 * Its name and current value are part of the widget — a caption above the
 * arc and a readout below it, always visible, always in the same place.
 * Nothing floats or follows the pointer.
 *
 * const dial = new Dial({ min: -1, max: 1, value: 0, label: 'pan',
 *                         onChange: (v) => … });
 * parent.appendChild(dial.el);
 */
export class Dial {

    constructor({
        min = 0,
        max = 1,
        step = 0.01,
        value = min,
        size = 20,
        label = '',
        color = '--accent-primary',
        format = null,
        onChange = null,
        fineOnShift = true,
        resetValue = null,
    } = {}) {
        this.min = min;
        this.max = max;
        this.step = step;
        this.value = this._quantize(value);
        // Double-click returns here: the parameter's default when the host
        // names one (`resetValue`), else whatever it was built with
        this.initialValue = resetValue === null ? this.value : this._quantize(resetValue);
        this.size = size;
        this.label = label;
        this.color = color;
        this.format = format;
        this.onChange = onChange;
        // Hosts that give shift-drag their own meaning (shaped row apply)
        // pass false so shift moves at normal speed
        this.fineOnShift = fineOnShift;

        this.el = document.createElement('div');
        this.el.className = 'mini-dial';

        this.labelEl = document.createElement('span');
        this.labelEl.className = 'mini-dial-label';
        this.labelEl.textContent = label;
        this.el.appendChild(this.labelEl);

        // Backing store at device resolution; drawn through an explicit DPR
        // transform every frame so strokes stay crisp on any display
        this.dpr = window.devicePixelRatio || 1;
        this.canvas = document.createElement('canvas');
        this.canvas.width = Math.round(size * this.dpr);
        this.canvas.height = Math.round(size * this.dpr);
        // !important: the app has a global `canvas { width:100% !important }`
        // rule for the viz canvases that would stretch (and blur) dials
        this.canvas.style.setProperty('width', `${size}px`, 'important');
        this.canvas.style.setProperty('height', `${size}px`, 'important');
        this.el.appendChild(this.canvas);

        this.valueEl = document.createElement('span');
        this.valueEl.className = 'mini-dial-value';
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
            // Full range over ~128px of vertical travel; shift = 8× finer
            const scale = range / (e.shiftKey && this.fineOnShift ? 1024 : 128);
            const next = this._quantize(startValue + (startY - e.clientY) * scale);
            if (next !== this.value) {
                this.value = next;
                // Host first, then draw: a `format` that reads host state
                // (the modal's cutoff → "φ^2 · 660 Hz") must see the new
                // value when the readout renders. The event rides along so
                // hosts can read gesture modifiers (cmd/ctrl-drag = apply
                // to all overtones).
                this.onChange?.(this.value, e);
                this.draw();
            }
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.disabled) return;
            e.preventDefault();
            startY = e.clientY;
            startValue = this.value;
            try {
                this.canvas.setPointerCapture(e.pointerId);
            } catch { /* synthetic or already-released pointer — drag still works */ }
            this.canvas.addEventListener('pointermove', onMove);
            this.canvas.addEventListener('pointerup', () => {
                this.canvas.removeEventListener('pointermove', onMove);
            }, { once: true });
        });

        this.canvas.addEventListener('dblclick', (e) => {
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
        this.draw(); // refreshes the hover title
    }

    /** Disabled dials ignore interaction and render dimmed. */
    setDisabled(disabled) {
        this.disabled = Boolean(disabled);
        this.el.classList.toggle('mini-dial-disabled', this.disabled);
    }

    _display(v) {
        if (this.format) return this.format(v);
        const decimals = this.step >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(this.step)));
        return v.toFixed(decimals);
    }

    /** External state sync — updates the needle without firing onChange. */
    setValue(v) {
        this.value = this._quantize(v);
        this.draw();
    }

    draw() {
        const ctx = this.canvas.getContext('2d');
        const s = this.size;
        const c = s / 2;
        const r = s / 2 - 1.5;
        // 270° sweep, gap at the bottom
        const start = 0.75 * Math.PI;
        const end = 2.25 * Math.PI;
        const t = (this.value - this.min) / (this.max - this.min || 1);

        // Explicit DPR transform per frame — crisp on retina, and immune
        // to any context-state loss
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, s, s);

        ctx.lineCap = 'round';
        ctx.strokeStyle = themeColor('--viz-grid');
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(c, c, r, start, end);
        ctx.stroke();

        ctx.strokeStyle = themeColor(this.color);
        ctx.beginPath();
        ctx.arc(c, c, r, start, start + (end - start) * t);
        ctx.stroke();

        // Needle
        const angle = start + (end - start) * t;
        ctx.strokeStyle = themeColor('--text-primary');
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(angle) * (r - 4), c + Math.sin(angle) * (r - 4));
        ctx.lineTo(c + Math.cos(angle) * r, c + Math.sin(angle) * r);
        ctx.stroke();

        const text = this._display(this.value);
        this.valueEl.textContent = text;
        this.canvas.title = text;
    }
}
