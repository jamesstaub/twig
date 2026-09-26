import { strokePath } from "../generic/sketch/Sketch.js";

/**
 * Drawing shared by every waveform view: the Source panel's preview of the
 * loaded sound file and the library's preview of whatever is selected. Takes
 * a context already transformed to CSS pixels (Sketch does that) and draws
 * in the box it is given — it owns no canvas and reads no state.
 */

/** Background and the zero line, under any of the traces below. */
export function drawWaveformFrame(ctx, width, height, { background, grid }) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}

/**
 * A min/max overview (js/dsp/overview.js) across the box: the envelope
 * filled, plus its midline as a stroke — which is what keeps a short file
 * (a single cycle, one sample per bin) visible at all.
 */
export function drawOverview(ctx, overview, width, height, color) {
    const ampScale = height * 0.4;
    const bin = (x) => Math.floor((x / width) * overview.max.length);
    const envelope = [];
    for (let x = 0; x < width; x++) envelope.push(x, height / 2 - overview.max[bin(x)] * ampScale);
    for (let x = width - 1; x >= 0; x--) envelope.push(x, height / 2 - overview.min[bin(x)] * ampScale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(envelope[0], envelope[1]);
    for (let i = 2; i < envelope.length; i += 2) ctx.lineTo(envelope[i], envelope[i + 1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    const mid = [];
    for (let x = 0; x < width; x++) mid.push(x, height / 2 - ((overview.max[bin(x)] + overview.min[bin(x)]) / 2) * ampScale);
    strokePath(ctx, mid);
}

/**
 * One pass of a lookup table (a baked waveform's cycle) across the box.
 * @param {Float32Array} table - One period, sampled evenly
 */
export function drawCycle(ctx, table, width, height, color, cycles = 1) {
    const ampScale = height * 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const points = [];
    for (let x = 0; x < width; x++) {
        const at = ((x / width) * cycles * table.length) % table.length;
        const i0 = Math.floor(at);
        const i1 = (i0 + 1) % table.length;
        const frac = at - i0;
        points.push(x, height / 2 - (table[i0] * (1 - frac) + table[i1] * frac) * ampScale);
    }
    strokePath(ctx, points);
}
