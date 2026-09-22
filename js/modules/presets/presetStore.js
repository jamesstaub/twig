/**
 * PRESET STORE — the 32 storage banks, in localStorage.
 *
 * A bank holds { name, savedAt, state } where state is a snapshot
 * (presetSchema). Frontend-only for now: this is the one place a backend
 * datastore will later replace. Storage can be unavailable (a blocked
 * webview, private mode); then the banks live for the session.
 */

import { sanitize } from './presetSchema.js';

export const BANK_COUNT = 32;

const STORAGE_KEY = 'twig.presets';

const banks = new Array(BANK_COUNT).fill(null);

export const presetStore = {
    /** Bank `index` (0-based), or null when empty. */
    get(index) {
        return banks[index] ?? null;
    },

    /** Every bank, empty ones as null, in order. */
    list() {
        return banks.slice();
    },

    has(index) {
        return Boolean(banks[index]);
    },

    set(index, { name, state }) {
        banks[index] = { name: String(name || '').slice(0, 40), savedAt: Date.now(), state: sanitize(state) };
        write();
    },

    rename(index, name) {
        if (!banks[index]) return;
        banks[index] = { ...banks[index], name: String(name || '').slice(0, 40) };
        write();
    },

    clear(index) {
        banks[index] = null;
        write();
    },

    /** Restore the stored banks. Call once at boot. */
    load() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            return;
        }
        if (!Array.isArray(saved?.banks)) return;
        for (let i = 0; i < BANK_COUNT; i++) {
            const bank = saved.banks[i];
            banks[i] = bank && typeof bank === 'object' && bank.state
                ? { name: String(bank.name || ''), savedAt: Number(bank.savedAt) || 0, state: sanitize(bank.state) }
                : null;
        }
    },
};

function write() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, banks }));
    } catch {
        // Storage unavailable — banks stay session-only
    }
}
