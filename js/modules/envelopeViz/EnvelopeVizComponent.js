import BaseComponent from '../base/BaseComponent.js';
import { themeColor, partialColor } from '../../theme.js';

// Matches the fixed height the ADSR panel gives #envelope-canvas-area.
const HEIGHT = 96;
const PAD = 4;

/**
 * Seconds the drawn sustain plateau holds after decay, before release
 * starts — a constant for the drawing only (the real envelope sustains
 * until note-off; this is just how long we render the flat "s" segment
 * so a decay->release transition is visible on a fixed time axis).
 */
export const HOLD = 0.35;

/**
 * Pure ADSR polyline for one voice, in (seconds, 0-1) space:
 * (0,0) -> attack peak -> decay to sustain -> held plateau -> release to 0.
 * No canvas, no theme, no AppState — easy to unit-test on its own.
 */
export function envelopeCurvePoints(env, hold = HOLD) {
    const { a, d, s, r } = env;
    return [
        { t: 0, v: 0 },
        { t: a, v: 1 },
        { t: a + d, v: s },
        { t: a + d + hold, v: s },
        { t: a + d + hold + r, v: 0 },
    ];
}

/** Total drawn duration (seconds) of one voice's curve. */
export function envelopeDuration(env, hold = HOLD) {
    const points = envelopeCurvePoints(env, hold);
    return points[points.length - 1].t;
}

/**
 * Scale one voice's (seconds, 0-1) curve into canvas pixel space against a
 * SHARED duration (so every voice sits on one common time axis, not its
 * own) — x over [pad, width - pad], y inverted over [pad, height - pad].
 */
export function scaleEnvelopePoints(points, sharedDuration, width, height, pad = PAD) {
    const span = sharedDuration || 1;
    const innerW = Math.max(0, width - 2 * pad);
    const innerH = Math.max(0, height - 2 * pad);
    return points.map(({ t, v }) => ({
        x: pad + (t / span) * innerW,
        y: pad + (1 - v) * innerH,
    }));
}

/**
 * EnvelopeVizComponent — every voice's ADSR curve on one shared time axis,
 * one canvas. Mirrors SpectrumComponent's DPR-backed canvas handling.
 */
export default class EnvelopeVizComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.dpr = window.devicePixelRatio || 1;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'envelope-viz-canvas';
        this.el.appendChild(this.canvas);
    }

    resize() {
        const width = this.el.clientWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(HEIGHT * dpr);
        // !important: the app's global `canvas { width:100% !important }`
        // rule would otherwise stretch/blur this backing store (see
        // Dial.js and the CLAUDE.md gotcha this component was briefed on).
        this.canvas.style.setProperty('width', '100%', 'important');
        this.canvas.style.setProperty('height', `${HEIGHT}px`, 'important');
        this.canvas.style.setProperty('min-height', `${HEIGHT}px`, 'important');
        this.dpr = dpr;
        this.width = width;
    }

    render(props) {
        this.resize();
        const ctx = this.canvas.getContext('2d');
        const { width, dpr } = this;
        const height = HEIGHT;
        // Explicit DPR transform every draw — crisp on retina, immune to
        // any context-state loss (same convention as Dial.js).
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = themeColor('--viz-bg');
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = themeColor('--viz-grid');
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const voices = props.voices || [];
        if (!voices.length) return;

        const sharedDuration = Math.max(...voices.map(({ env }) => envelopeDuration(env)));

        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        for (const { ratio, env } of voices) {
            const points = scaleEnvelopePoints(envelopeCurvePoints(env), sharedDuration, width, height);
            ctx.strokeStyle = partialColor(ratio);
            ctx.beginPath();
            points.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
}
