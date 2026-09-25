/**
 * SKETCH — the app's canvas runtime: one canvas, its 2D context, a frame
 * loop, and device-pixel-correct sizing. It replaces p5 for the two
 * animated visualizations (the tonewheel and the waveform previews); the
 * other canvases in the app already draw on a raw context and can adopt
 * this when it suits them.
 *
 * Why own it: p5 cost 1.3 MB of bundle and ~350 ms of mobile boot for a
 * few dozen 2D calls. Owning the canvas also keeps the door open for the
 * things p5 would have made harder, not easier:
 *   - EFFECTS: `ctx.filter` (blur, brightness…) applies to any drawing
 *     here; a post-pass or a WebGL variant can be added behind the same
 *     `draw(ctx, sketch)` contract without touching callers.
 *   - VIDEO EXPORT: the canvas is owned and stable, so
 *     `sketch.canvas.captureStream(fps)` into a MediaRecorder is a
 *     capability of every sketch rather than a rewrite.
 *
 * Sizing: the canvas BACKING STORE is `size × devicePixelRatio` and the
 * context is pre-scaled, so `draw` works in CSS pixels and the result is
 * sharp on any screen. The app's global `canvas { width: 100% !important }`
 * rule would otherwise hijack the element, so the CSS size is written with
 * `important` (see viz.css).
 */

/** How the canvas takes its size from its container. */
export const FIT = {
    /** The container's box (the waveform previews stretch with their panel). */
    BOX: 'box',
    /** A square of the container's smaller side (the tonewheel is a circle). */
    SQUARE: 'square',
};

export class Sketch {
    /**
     * @param {HTMLElement} container - The canvas is appended here
     * @param {Object} opts
     * @param {function(CanvasRenderingContext2D, Sketch)} opts.draw - One frame
     * @param {string} [opts.fit=FIT.BOX] - See FIT
     * @param {boolean} [opts.loop=true] - Animate; false draws only on redraw()
     * @param {number} [opts.fallbackSize=0] - Size to use while the container measures 0
     */
    constructor(container, { draw, fit = FIT.BOX, loop = true, fallbackSize = 0 }) {
        this.container = container;
        this.drawFrame = draw;
        this.fit = fit;
        this.looping = loop;
        this.fallbackSize = fallbackSize;
        /** Frames drawn — the animations count their rotation in these. */
        this.frameCount = 0;
        this.width = 0;
        this.height = 0;
        this._raf = null;
        this._pending = false;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        // Round caps are what these visualizations were drawn against (it
        // was p5's renderer default); Canvas2D's own default is butt
        this.ctx.lineCap = 'round';
        container.appendChild(this.canvas);

        // The container's own reflows (a panel shown, the shell's synthetic
        // resize, a window resize) — resizing inside the callback would
        // change the observed box in the same frame, so it defers a frame
        this._observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => { if (this._raf === null) requestAnimationFrame(() => this.resize()); })
            : null;
        this._observer?.observe(container);
        this._onWindowResize = () => this.resize();
        window.addEventListener('resize', this._onWindowResize);

        this.resize();
        if (loop) this.start();
        else this.redraw();
    }

    /** Measure the container and re-fit the canvas; redraws when stopped. */
    resize() {
        const box = this.measure();
        if (box.width <= 0 || box.height <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        const changed = box.width !== this.width || box.height !== this.height || dpr !== this._dpr;
        this.width = box.width;
        this.height = box.height;
        this._dpr = dpr;
        if (changed) {
            this.canvas.width = Math.round(box.width * dpr);
            this.canvas.height = Math.round(box.height * dpr);
            // Out-specify the global `canvas { width: 100% !important }`
            this.canvas.style.setProperty('width', `${box.width}px`, 'important');
            this.canvas.style.setProperty('height', `${box.height}px`, 'important');
            this.onResize?.(this);
            if (!this.looping) this.redraw();
        }
    }

    measure() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (this.fit === FIT.SQUARE) {
            const size = w > 0 && h > 0 ? Math.min(w, h) : (w || h || this.fallbackSize);
            return { width: size, height: size };
        }
        return { width: w || this.fallbackSize, height: h || this.fallbackSize };
    }

    /** Draw one frame now (the only path that paints). */
    render() {
        if (this.width <= 0 || this.height <= 0) return;
        const { ctx } = this;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.lineCap = 'round';
        this.frameCount++;
        this.drawFrame(ctx, this);
    }

    /** Draw once, coalesced onto the next frame (for a stopped sketch). */
    redraw() {
        if (this.looping || this._pending) return;
        this._pending = true;
        requestAnimationFrame(() => {
            this._pending = false;
            this.render();
        });
    }

    start() {
        if (this._raf !== null) return;
        this.looping = true;
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            this.render();
        };
        this._raf = requestAnimationFrame(tick);
    }

    stop() {
        if (this._raf !== null) cancelAnimationFrame(this._raf);
        this._raf = null;
        this.looping = false;
    }

    destroy() {
        this.stop();
        this._observer?.disconnect();
        window.removeEventListener('resize', this._onWindowResize);
        this.canvas.remove();
    }
}

/**
 * Stroke a closed polygon through `points` — the shape both visualizations
 * draw (p5's beginShape/vertex/endShape(CLOSE) in one call).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} points - Flat x, y pairs
 */
export function strokeClosedPath(ctx, points) {
    if (points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.stroke();
}

/** Stroke an open polyline through `points` (flat x, y pairs). */
export function strokePath(ctx, points) {
    if (points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.stroke();
}

/**
 * A CSS color with its alpha replaced (0-1) — p5's `color(c).setAlpha(a)`.
 * Values are cached: the visualizations ask for the same few colors every
 * frame.
 */
const alphaCache = new Map();
export function withAlpha(color, alpha) {
    const key = `${color}|${alpha.toFixed(3)}`;
    let out = alphaCache.get(key);
    if (out === undefined) {
        out = toRgba(color, alpha);
        alphaCache.set(key, out);
    }
    return out;
}

let probeCtx = null;
function toRgba(color, alpha) {
    // Resolve any CSS color form (hex, hsl, color-mix…) through a canvas
    probeCtx = probeCtx || document.createElement('canvas').getContext('2d');
    probeCtx.fillStyle = '#000';
    probeCtx.fillStyle = color;
    const resolved = probeCtx.fillStyle; // always #rrggbb or rgba(...)
    if (resolved.startsWith('#')) {
        const n = parseInt(resolved.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    const parts = resolved.match(/[\d.]+/g) || [0, 0, 0];
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}
