import BaseComponent from '../base/BaseComponent.js';
import { drawSequencePreview } from '../overtoneSignal/sequencePreview.js';

// Matches the fixed height the side column gives a .viz-canvas canvas.
const HEIGHT = 96;

/**
 * SequenceVizComponent — the selected voice's sequence (gate pattern ×
 * shape × stretch) on one canvas. Mirrors EnvelopeVizComponent's
 * DPR-backed canvas handling; the drawing itself is sequencePreview.js.
 */
export default class SequenceVizComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'sequence-viz-canvas';
        this.el.appendChild(this.canvas);
    }

    resize() {
        const width = this.el.clientWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(HEIGHT * dpr);
        // !important: the app's global `canvas { width:100% !important }`
        // rule would otherwise stretch/blur this backing store.
        this.canvas.style.setProperty('width', '100%', 'important');
        this.canvas.style.setProperty('height', `${HEIGHT}px`, 'important');
        this.canvas.style.setProperty('min-height', `${HEIGHT}px`, 'important');
        this.dpr = dpr;
        this.width = width;
    }

    render({ index }) {
        this.resize();
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        drawSequencePreview(ctx, index, this.width, HEIGHT);
    }
}
