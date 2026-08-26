/**
 * IR MANAGER
 *
 * Store for convolution impulse responses created from the current timbre.
 * Mirrors WavetableManager's role: a session store keyed by generated ids,
 * listed for the per-overtone IR steppers. Each IR remembers the
 * fundamental it was baked at so voices can be given a pitched copy —
 * resampled by (voice frequency / bake frequency) — and ring through the
 * timbre transposed to their own pitch.
 */

export class IRManager {

    constructor() {
        this.irs = new Map();      // key → { name, buffer, bakeFrequency }
        this.pitchedCache = new Map(); // `${key}@${cents}` → AudioBuffer
        this.count = 0;
    }

    /**
     * @param {AudioBuffer} buffer
     * @param {string} name - Display name
     * @param {number} bakeFrequency - Fundamental (Hz) the IR was baked at
     * @returns {string} key
     */
    add(buffer, name, bakeFrequency) {
        this.count++;
        const key = `ir_${this.count}`;
        this.irs.set(key, { name: name || `IR ${this.count}`, buffer, bakeFrequency });
        return key;
    }

    /** @returns {AudioBuffer|null} the IR as baked */
    get(key) {
        return this.irs.get(key)?.buffer || null;
    }

    /** @returns {number} fundamental the IR was baked at (0 if unknown) */
    bakeFrequency(key) {
        return this.irs.get(key)?.bakeFrequency || 0;
    }

    /**
     * The IR resampled so its resonances land on `frequency` instead of the
     * bake fundamental: a voice at 3× the bake pitch gets the IR played 3×
     * faster. Quantized to 10-cent steps and cached, so pitch glides reuse
     * buffers instead of rebuilding (and re-triggering the convolver) per
     * update.
     *
     * @param {string} key
     * @param {number} frequency - Target fundamental (Hz)
     * @param {AudioContext} ctx
     * @returns {AudioBuffer|null}
     */
    pitched(key, frequency, ctx) {
        const ir = this.irs.get(key);
        if (!ir) return null;
        if (!(frequency > 0) || !(ir.bakeFrequency > 0)) return ir.buffer;

        const cents = Math.round((1200 * Math.log2(frequency / ir.bakeFrequency)) / 10) * 10;
        if (cents === 0) return ir.buffer;
        const cacheKey = `${key}@${cents}`;
        const cached = this.pitchedCache.get(cacheKey);
        if (cached) return cached;

        const factor = Math.pow(2, cents / 1200); // playback speed-up
        const src = ir.buffer.getChannelData(0);
        const length = Math.max(2, Math.round(src.length / factor));
        const out = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = out.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const pos = i * factor;
            const i0 = Math.floor(pos);
            const i1 = Math.min(src.length - 1, i0 + 1);
            const frac = pos - i0;
            data[i] = (src[i0] ?? 0) * (1 - frac) + (src[i1] ?? 0) * frac;
        }
        this.pitchedCache.set(cacheKey, out);
        return out;
    }

    /** @returns {Array<{key: string, name: string}>} in creation order */
    list() {
        return [...this.irs].map(([key, v]) => ({ key, name: v.name }));
    }

    /** Key by creation index (for the bridge's /twig/convir/<n> [i]). */
    keyAt(index) {
        return this.list()[index]?.key ?? null;
    }

    indexOf(key) {
        return this.list().findIndex((ir) => ir.key === key);
    }
}

export const irManager = new IRManager();
