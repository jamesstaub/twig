import BaseComponent from "../base/BaseComponent.js";
import { themeColor } from "../../theme.js";
import { irTimeConstant, logFrequencies, resonanceCurve, timbreLines } from "../../dsp/spectrumPreview.js";

const HEIGHT = 120; // matches the global canvas min-height so bitmap and box agree
const POINTS = 360;
const DB_FLOOR = -48;

/**
 * SpectrumComponent — log-frequency magnitude view of the current timbre
 * as the IR bake will capture it: each partial (with its primitive's
 * harmonics) drawn as a resonance whose width follows the ring time.
 * Plain Canvas2D, redrawn on demand by the controller.
 */
export default class SpectrumComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.canvas = document.createElement("canvas");
        this.canvas.className = "spectrum-canvas";
        this.el.appendChild(this.canvas);
    }

    resize() {
        const width = this.el.clientWidth || 400;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(HEIGHT * dpr);
        // The app's global `canvas { width: 100% !important }` rule would
        // stretch the bitmap; pin the CSS size explicitly
        this.canvas.style.setProperty("width", `${width}px`, "important");
        this.canvas.style.setProperty("height", `${HEIGHT}px`, "important");
        this.canvas.style.setProperty("min-height", `${HEIGHT}px`, "important");
        this.dpr = dpr;
        this.width = width;
    }

    render(props) {
        this.props = props;
        this.resize();
        const ctx = this.canvas.getContext("2d");
        const { width, dpr } = this;
        const height = HEIGHT;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = themeColor("--viz-bg");
        ctx.fillRect(0, 0, width, height);

        const f0 = props.f0 || 130.81;
        const fmin = Math.max(20, f0 / 2);
        const fmax = 20000;
        const freqs = logFrequencies(fmin, fmax, POINTS);
        const xOf = (f) => (Math.log(f / fmin) / Math.log(fmax / fmin)) * width;

        // Octave grid from the fundamental
        ctx.strokeStyle = themeColor("--viz-grid");
        ctx.lineWidth = 1;
        for (let f = f0; f < fmax; f *= 2) {
            const x = Math.round(xOf(f)) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }

        const lines = timbreLines(props);
        if (lines.length === 0) return;

        const tau = irTimeConstant(props.ringSeconds, 1 / f0);
        const mag = resonanceCurve(lines, tau, freqs);
        const yOf = (m) => {
            const db = 20 * Math.log10(Math.max(m, 1e-6));
            const t = Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));
            return height - 4 - t * (height - 10);
        };

        // Filled resonance curve
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let i = 0; i < POINTS; i++) ctx.lineTo((i / (POINTS - 1)) * width, yOf(mag[i]));
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = themeColor("--viz-trace");
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let i = 0; i < POINTS; i++) {
            const x = (i / (POINTS - 1)) * width;
            const y = yOf(mag[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = themeColor("--viz-trace");
        ctx.lineWidth = 2;
        ctx.stroke();

        // Ring readout
        ctx.fillStyle = themeColor("--viz-grid");
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(props.ringSeconds > 0 ? `ring ${props.ringSeconds.toFixed(1)} s` : "one loop", width - 6, 14);
    }
}
