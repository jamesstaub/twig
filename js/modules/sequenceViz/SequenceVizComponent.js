import BaseComponent from '../base/BaseComponent.js';
import { drawSequencePreview } from '../overtoneSignal/sequencePreview.js';
import { themeColor } from '../../theme.js';

// Matches the fixed height the side column gives a .viz-canvas canvas.
const HEIGHT = 96;

/**
 * SequenceVizComponent — the selected voice's sequence (gate pattern ×
 * shape × stretch, with its modulation layers) on one canvas, and a
 * PLAYHEAD over it while playing: the voice's cycle clock, folded into
 * the drawn cycles. The static drawing (sequencePreview.js) is rendered
 * once into an offscreen canvas; the rAF loop only blits it and draws the
 * line, and runs only while playing and laid out. Mirrors
 * EnvelopeVizComponent's DPR-backed canvas handling.
 *
 * Props: { index, cycles, playing, positionOf() } — positionOf returns
 * the voice's position in cycles now, or null.
 */
export default class SequenceVizComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'sequence-viz-canvas';
        this.el.appendChild(this.canvas);
        this.base = document.createElement('canvas');
        this._raf = null;
    }

    resize() {
        const width = this.el.clientWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        for (const c of [this.canvas, this.base]) {
            c.width = Math.round(width * dpr);
            c.height = Math.round(HEIGHT * dpr);
        }
        // !important: the app's global `canvas { width:100% !important }`
        // rule would otherwise stretch/blur this backing store.
        this.canvas.style.setProperty('width', '100%', 'important');
        this.canvas.style.setProperty('height', `${HEIGHT}px`, 'important');
        this.canvas.style.setProperty('min-height', `${HEIGHT}px`, 'important');
        this.dpr = dpr;
        this.width = width;
    }

    render({ index, cycles, playing, positionOf }) {
        this.cycles = Math.max(1, cycles || 1);
        this.positionOf = positionOf;
        this.resize();
        const ctx = this.base.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        drawSequencePreview(ctx, index, this.width, HEIGHT);
        this.stop();
        this.frame();
        if (playing) this.start();
    }

    /** The static drawing, then the playhead where the clock stands. */
    frame() {
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.base, 0, 0);
        const position = this.positionOf?.();
        if (position === null || position === undefined) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // On a pixel column, so the line is crisp rather than a 2px smear
        const x = Math.floor(((position % this.cycles) / this.cycles) * this.width) + 0.5;
        ctx.strokeStyle = themeColor('--viz-playhead');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
    }

    start() {
        const tick = () => {
            // Laid out? A hidden panel's canvas has no width to draw into
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
}
