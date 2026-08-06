import { themeColor } from '../../../theme.js';
import { ValueTip } from '../valueTip.js';

/**
 * Dial — minimal rotary control for tight spaces (drawbar columns).
 *
 * Canvas-drawn arc dial with vertical-drag interaction:
 *   drag up/down to change, shift-drag for fine control, double-click to
 *   reset to the initial value. Exposes .el (mount it anywhere) and
 *   .setValue() for external state sync (no onChange echo).
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
        tipExtra = null,
        tipAnchor = null,
    } = {}) {
        this.min = min;
        this.max = max;
        this.step = step;
        this.value = this._quantize(value);
        this.initialValue = this.value;
        this.size = size;
        this.label = label;
        this.color = color;
        this.format = format;
        this.onChange = onChange;
        this.tipExtra = tipExtra; // () => HTMLElement embedded in the tip
        this.tipAnchor = tipAnchor; // Element | (dial) => Element to pin the tip to

        this.el = document.createElement('div');
        this.el.className = 'mini-dial';

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
            const scale = range / (e.shiftKey ? 1024 : 128);
            const next = this._quantize(startValue + (startY - e.clientY) * scale);
            if (next !== this.value) {
                this.value = next;
                this.draw();
                this.onChange?.(this.value);
            }
            this._showTip();
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.disabled) return;
            e.preventDefault();
            startY = e.clientY;
            startValue = this.value;
            // Show the tip on grab: the control's name lives here, not in the DOM
            this._showTip();
            try {
                this.canvas.setPointerCapture(e.pointerId);
            } catch { /* synthetic or already-released pointer — drag still works */ }
            this.canvas.addEventListener('pointermove', onMove);
            this.canvas.addEventListener('pointerup', () => {
                this.canvas.removeEventListener('pointermove', onMove);
                // Grace period instead of instant hide, so interactive tip
                // content (e.g. the stretch buttons) stays reachable
                ValueTip.release();
            }, { once: true });
        });

        this.canvas.addEventListener('dblclick', () => {
            if (this.disabled) return;
            this.setValue(this.initialValue);
            this.onChange?.(this.value);
        });
    }

    /** Rename the control (e.g. mode-specific sequencer param names). */
    setLabel(text) {
        this.label = text;
        this.draw(); // refreshes the hover title
    }

    /** Disabled dials ignore interaction and render dimmed. */
    setDisabled(disabled) {
        this.disabled = Boolean(disabled);
        this.el.classList.toggle('mini-dial-disabled', this.disabled);
    }

    /**
     * Floating readout: control name over current value. Anchored above the
     * dial itself, or wherever `tipAnchor` says — an Element, an {x, y}
     * viewport point, or a function of this dial returning either — so a
     * host can pin every tip to one spot clear of the controls (e.g. the
     * top of a drawbar column).
     */
    _showTip() {
        const anchor = (typeof this.tipAnchor === 'function' ? this.tipAnchor(this) : this.tipAnchor) || this.canvas;
        let point = anchor;
        if (typeof anchor.x !== 'number') {
            const r = anchor.getBoundingClientRect();
            point = { x: r.left + r.width / 2, y: r.top };
        }
        ValueTip.show(this._display(this.value), point.x, point.y, {
            label: this.label,
            autoHideMs: 0,
            extra: this.tipExtra ? this.tipExtra() : null,
        });
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

        this.canvas.title = this._display(this.value);
    }
}
