import BaseComponent from '../base/BaseComponent.js';
import { themeColor } from '../../theme.js';
import { getOutputAnalyser } from '../../audio.js';

const HEIGHT = 96; // matches the root's fixed viz-canvas height
const TRACE_SAMPLES = 1024;

/**
 * ScopeComponent — oscilloscope of the live master output (post-limiter),
 * for the Filter surface: shows what the per-overtone filters do to the
 * sound. Plain Canvas2D, driven by its own rAF loop while playing.
 *
 * Trigger: the first rising zero-crossing within the first half of the
 * analyser buffer, so a periodic signal holds still instead of scrolling.
 * Stopped/no analyser: a single flat center line, no loop running.
 */
export default class ScopeComponent extends BaseComponent {

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
        this.canvas = document.createElement('canvas');
        this.el.appendChild(this.canvas);
        this.dpr = window.devicePixelRatio || 1;
    }

    /** Recompute the backing store from the root's current width, then redraw. */
    _resize() {
        const width = this.el.clientWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(HEIGHT * dpr);
        // The global `canvas { width:100% !important; height:… !important;
        // min-height:120px }` rule would otherwise hijack this canvas — see
        // Dial.js for the same escape.
        this.canvas.style.setProperty('width', '100%', 'important');
        this.canvas.style.setProperty('height', `${HEIGHT}px`, 'important');
        this.canvas.style.setProperty('min-height', `${HEIGHT}px`, 'important');
        this.dpr = dpr;
        this.width = width;
        this._draw();
    }

    render({ playing }) {
        this.playing = playing;
        this._ensureCanvas();

        // teardown() (called by BaseController.update() just before this)
        // clears bound events and disconnects the previous observer, so
        // both are re-armed here rather than once at construction time.
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._resize());
            this._resizeObserver.observe(this.el);
        }
        // The surfaces shell dispatches a synthetic resize when a hidden
        // panel becomes visible again; width may be unchanged, so
        // recompute the backing store defensively rather than just redraw.
        this.bindEvent(window, 'resize', () => this._resize());

        this._resize(); // sizes the canvas and draws the initial frame

        if (playing) this._start();
        else this._stop(); // _resize() above already drew the flat line
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
        // Surface hidden (`hidden` attribute) — skip the draw but keep the
        // loop itself cheap; it resumes drawing once shown again.
        if (this.el.offsetParent === null) return;

        const ctx = this.canvas.getContext('2d');
        const width = this.width || this.el.clientWidth || 300;
        const height = HEIGHT;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        ctx.fillStyle = themeColor('--viz-bg');
        ctx.fillRect(0, 0, width, height);

        const midY = Math.round(height / 2) + 0.5;
        ctx.strokeStyle = themeColor('--viz-grid');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const analyser = this.playing ? getOutputAnalyser() : null;
        if (!analyser) return; // flat center line only

        if (!this.buffer || this.buffer.length !== analyser.fftSize) {
            this.buffer = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(this.buffer);

        const trigger = this._findTrigger(this.buffer);
        const count = Math.min(TRACE_SAMPLES, this.buffer.length - trigger);
        if (count < 2) return;

        ctx.strokeStyle = themeColor('--viz-trace');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const v = this.buffer[trigger + i];
            const x = (i / (count - 1)) * width;
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
}
