/**
 * Fundamental of a sound file.
 *
 * A file of one second or less is taken to be ONE PERIOD (a single-cycle
 * wavetable): its fundamental is 1 / duration, known at once. A longer
 * file is analyzed by YIN (yin.js) over its first 4096 samples — off the
 * main thread, in the pitch worker (workers/pitch-worker.js), so a decode
 * never stalls the UI. A RANGE of the file ([start, end] fractions) is
 * always analyzed by YIN, over the range's first 4096 samples. Resolves
 * null when nothing periodic stands out.
 */

const SINGLE_CYCLE_MAX_S = 1;
const ANALYSIS_SAMPLES = 4096;
const WORKER_URL = 'js/dsp/workers/pitch-worker.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function pitchWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (e) => {
        const { id, hz } = e.data;
        pending.get(id)?.(hz);
        pending.delete(id);
    };
    worker.onerror = (err) => {
        console.warn('[pitch] worker failed — no fundamental detected:', err.message);
        for (const resolve of pending.values()) resolve(null);
        pending.clear();
    };
    return worker;
}

/**
 * @param {AudioBuffer} buffer
 * @param {number[]|null} [range] - [start, end] fractions of the file to analyze
 * @returns {Promise<number|null>} Hz
 */
export function detectFundamental(buffer, range = null) {
    const { length, sampleRate } = buffer;
    if (length < 2) return Promise.resolve(null);
    if (!range && length <= sampleRate * SINGLE_CYCLE_MAX_S) return Promise.resolve(sampleRate / length);

    const from = range ? Math.floor(range[0] * length) : 0;
    const to = range ? Math.max(from + 1, Math.floor(range[1] * length)) : length;
    const data = monoMix(buffer, Math.min(to - from, ANALYSIS_SAMPLES), from);
    return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        pitchWorker().postMessage({ id, data, sampleRate }, [data.buffer]);
    });
}

/** `count` samples of an AudioBuffer from `offset` as one mono channel (channels averaged). */
export function monoMix(buffer, count = buffer.length, offset = 0) {
    const n = buffer.numberOfChannels;
    const out = new Float32Array(count);
    for (let c = 0; c < n; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < count; i++) out[i] += d[offset + i] / n;
    }
    return out;
}
