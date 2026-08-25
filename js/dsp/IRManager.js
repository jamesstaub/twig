/**
 * IR MANAGER
 *
 * Store for convolution impulse responses created from the current timbre
 * (or any AudioBuffer). Mirrors WavetableManager's role: a session store
 * keyed by generated ids, listed for the convolution view's IR menu.
 */

export class IRManager {

    constructor() {
        this.irs = new Map(); // key → { name, buffer }
        this.count = 0;
    }

    /**
     * @param {AudioBuffer} buffer
     * @param {string} name - Display name for the IR menu
     * @returns {string} key
     */
    add(buffer, name) {
        this.count++;
        const key = `ir_${this.count}`;
        this.irs.set(key, { name: name || `IR ${this.count}`, buffer });
        return key;
    }

    /** @returns {AudioBuffer|null} */
    get(key) {
        return this.irs.get(key)?.buffer || null;
    }

    /** @returns {Array<{key: string, name: string}>} in creation order */
    list() {
        return [...this.irs].map(([key, v]) => ({ key, name: v.name }));
    }

    /** Key by creation index (for the bridge's /twig/convir [i]). */
    keyAt(index) {
        return this.list()[index]?.key ?? null;
    }

    indexOf(key) {
        return this.list().findIndex((ir) => ir.key === key);
    }
}

export const irManager = new IRManager();
