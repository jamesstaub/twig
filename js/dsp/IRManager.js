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

// Memory guards for pitched copies. Pitching an IR down lengthens it (two
// octaves down = 4× longer), and every distinct pitch is another buffer —
// unbounded, a fundamental glide across twelve voices can allocate
// hundreds of MB of AudioBuffers plus each ConvolverNode's FFT state.
const PITCHED_MAX_SECONDS = 4;   // truncate (with a short fade) beyond this
const PITCHED_CACHE_MAX = 48;    // LRU entries kept across all IRs
const PITCHED_FADE_SECONDS = 0.02;

export class IRManager {

    constructor() {
        this.irs = new Map();      // key → { name, buffer, bakeFrequency, pcm, sampleRate }
        this.pitchedCache = new Map(); // `${key}@${cents}` → AudioBuffer (LRU by insertion)
        this.count = 0;
        this.ctx = null;
    }

    /**
     * The context IR buffers are built on. Set when the engine starts;
     * anything adopted before then is built on first use.
     */
    useContext(ctx) {
        this.ctx = ctx;
    }

    /**
     * Take a stored IR (assetLibrary) as samples, without an AudioBuffer:
     * at boot there is no AudioContext, and the steppers only need to know
     * it exists. The buffer is made when a voice first rings through it.
     */
    adopt(key, { pcm, sampleRate, bakeFrequency, name }) {
        this.count++;
        this.irs.set(key, { name: name || `IR ${this.count}`, buffer: null, bakeFrequency, pcm, sampleRate });
    }

    /**
     * @param {AudioBuffer} buffer
     * @param {string} name - Display name
     * @param {number} bakeFrequency - Fundamental (Hz) the IR was baked at
     * @returns {string} key
     */
    add(buffer, name, bakeFrequency, key = null) {
        this.count++;
        // The caller passes the content id (assetLibrary.saveIR); without
        // one — an IR that is not being stored — fall back to a serial key
        const id = key || `ir_${this.count}`;
        this.irs.set(id, { name: name || `IR ${this.count}`, buffer, bakeFrequency, pcm: null, sampleRate: 0 });
        return id;
    }

    /**
     * Is this IR in the session's library? True for a stored IR whose
     * buffer has not been built yet — existence is not the same question
     * as "can it play right now", which needs a context.
     */
    has(key) {
        return Boolean(key) && this.irs.has(key);
    }

    /** @returns {AudioBuffer|null} the IR as baked; built on first use when adopted */
    get(key) {
        const ir = this.irs.get(key);
        if (!ir) return null;
        if (!ir.buffer && ir.pcm && this.ctx) {
            ir.buffer = this.ctx.createBuffer(1, ir.pcm.length, ir.sampleRate);
            ir.buffer.copyToChannel(ir.pcm, 0);
        }
        return ir.buffer || null;
    }

    setName(key, name) {
        const ir = this.irs.get(key);
        if (ir) ir.name = name;
    }

    /**
     * Forget an IR (the library deleted it), along with every pitched copy
     * cached for it — those hold an AudioBuffer each.
     */
    remove(key) {
        this.irs.delete(key);
        for (const cacheKey of [...this.pitchedCache.keys()]) {
            if (cacheKey.startsWith(`${key}@`)) this.pitchedCache.delete(cacheKey);
        }
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
        // Through get(), so an IR restored from the library is built here
        // rather than read as a null buffer
        const base = this.get(key);
        if (!ir || !base) return null;
        if (!(frequency > 0) || !(ir.bakeFrequency > 0)) return base;

        const cents = Math.round((1200 * Math.log2(frequency / ir.bakeFrequency)) / 10) * 10;
        if (cents === 0) return base;
        const cacheKey = `${key}@${cents}`;
        const cached = this.pitchedCache.get(cacheKey);
        if (cached) {
            // Refresh LRU position
            this.pitchedCache.delete(cacheKey);
            this.pitchedCache.set(cacheKey, cached);
            return cached;
        }

        const factor = Math.pow(2, cents / 1200); // playback speed-up
        const src = base.getChannelData(0);
        const wanted = Math.max(2, Math.round(src.length / factor));
        const maxLength = Math.round(PITCHED_MAX_SECONDS * ctx.sampleRate);
        const length = Math.min(wanted, maxLength);
        const out = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = out.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const pos = i * factor;
            const i0 = Math.floor(pos);
            const i1 = Math.min(src.length - 1, i0 + 1);
            const frac = pos - i0;
            data[i] = (src[i0] ?? 0) * (1 - frac) + (src[i1] ?? 0) * frac;
        }
        if (length < wanted) {
            // Truncated: fade the cut so the tail doesn't end in a step
            const fade = Math.min(length, Math.round(PITCHED_FADE_SECONDS * ctx.sampleRate));
            for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
        }
        this.pitchedCache.set(cacheKey, out);
        while (this.pitchedCache.size > PITCHED_CACHE_MAX) {
            this.pitchedCache.delete(this.pitchedCache.keys().next().value);
        }
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
