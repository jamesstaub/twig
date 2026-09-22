/**
 * PRESET ACTIONS — store, recall, and interpolate between the banks.
 *
 * State (UI-only, never bridged): the selected bank, the loaded bank and
 * whether the sound has drifted from it ("dirty"). The crossfader's A/B
 * banks and position are app configuration (presetConfig, persisted).
 * Every change dispatches PRESETS_CHANGED.
 *
 * Interpolation: the 128 crossfader positions map onto frames between
 * bank A and bank B (presetSchema.interpolate). Frames are computed on
 * first visit and memoized until A, B or their banks change — a frame is
 * a few hundred lerps, far cheaper than shipping it to a worker and
 * back, and a full sweep fills the table once. Applying a frame is the
 * fast path in presetApply.js. The sound as it was before the fader first
 * moved is kept, so clearing the crossfade can put it back.
 */

import { persistAppConfig, presetConfig } from '../../appConfig.js';
import { PRESETS_CHANGED } from '../../events.js';
import { showStatus } from '../../domUtils.js';
import { applySnapshot } from './presetApply.js';
import { capture, interpolate, PRESET_VERSION, sanitize, snapshotsEqual } from './presetSchema.js';
import { BANK_COUNT, presetStore } from './presetStore.js';

export const CROSSFADER_MAX = 127;

const state = {
    selected: 0,     // bank the Store/Recall buttons act on
    loaded: null,    // bank the sound came from, or null
    loadedState: null,
    dirty: false,
};

let frames = null; // memoized crossfader frames, indexed by position
let dirtyCheck = null;
// The last non-interpolated sound: captured when the fader first moves,
// dropped again once the sound changes by any other means
let before = null;
let lastCrossfadeAt = -Infinity;

function emit() {
    document.dispatchEvent(new CustomEvent(PRESETS_CHANGED));
}

const validBank = (index) => Number.isInteger(index) && index >= 0 && index < BANK_COUNT;

export const PresetActions = {
    get selected() { return state.selected; },
    get loaded() { return state.loaded; },
    get dirty() { return state.dirty; },
    get slotA() { return presetConfig.slotA; },
    get slotB() { return presetConfig.slotB; },
    get position() { return presetConfig.position; },

    /** Both crossfader banks assigned and stored. */
    get canCrossfade() {
        return presetStore.has(presetConfig.slotA) && presetStore.has(presetConfig.slotB);
    },

    select(index) {
        if (!validBank(index) || index === state.selected) return;
        state.selected = index;
        emit();
    },

    /** Save the current sound into the selected bank. */
    store(name) {
        const index = state.selected;
        const existing = presetStore.get(index);
        presetStore.set(index, { name: name ?? existing?.name ?? '', state: capture() });
        before = null;
        this._markLoaded(index);
        this._invalidateFrames(index);
        showStatus(`Stored preset ${index + 1}`, 'success');
        emit();
    },

    /** Load the selected bank (or `index`) into the sound. */
    recall(index = state.selected) {
        const bank = presetStore.get(index);
        if (!bank) return;
        state.selected = index;
        applySnapshot(bank.state, { immediate: true });
        before = null;
        this._markLoaded(index);
        emit();
    },

    rename(index, name) {
        presetStore.rename(index, name);
        emit();
    },

    clear(index = state.selected) {
        if (!presetStore.has(index)) return;
        presetStore.clear(index);
        if (state.loaded === index) {
            state.loaded = null;
            state.loadedState = null;
            state.dirty = false;
        }
        if (presetConfig.slotA === index) presetConfig.slotA = null;
        if (presetConfig.slotB === index) presetConfig.slotB = null;
        persistAppConfig();
        this._invalidateFrames(index);
        emit();
    },

    // --- interpolation ---

    setSlotA(index) { this._setSlot('slotA', index); },
    setSlotB(index) { this._setSlot('slotB', index); },

    _setSlot(key, index) {
        const next = validBank(index) && presetStore.has(index) ? index : null;
        if (presetConfig[key] === next) return;
        presetConfig[key] = next;
        persistAppConfig();
        frames = null;
        emit();
    },

    /**
     * Move the crossfader (0-127) and sound the frame there. Position 0
     * is bank A exactly, 127 bank B exactly.
     */
    setCrossfade(position) {
        const p = Math.max(0, Math.min(CROSSFADER_MAX, Math.round(Number(position) || 0)));
        presetConfig.position = p;
        persistAppConfig();
        const frame = this.frame(p);
        if (frame) {
            before ??= capture();
            lastCrossfadeAt = performance.now();
            applySnapshot(frame);
        }
        emit();
    },

    /** A crossfade is set up (both banks assigned) or has been sounded since. */
    get crossfading() {
        return this.canCrossfade || before !== null;
    },

    /**
     * Unassign A and B and put the sound back to what it was before the
     * fader first moved (the last non-interpolated state).
     */
    clearInterpolation() {
        presetConfig.slotA = null;
        presetConfig.slotB = null;
        presetConfig.position = 0;
        persistAppConfig();
        frames = null;
        if (before) {
            applySnapshot(before, { immediate: true });
            before = null;
        }
        this._scheduleDirtyCheck();
        emit();
    },

    /** The snapshot at crossfader position `p`, or null without both banks. */
    frame(p) {
        if (!this.canCrossfade) return null;
        if (!frames) {
            frames = new Array(CROSSFADER_MAX + 1).fill(null);
            frames.a = presetStore.get(presetConfig.slotA).state;
            frames.b = presetStore.get(presetConfig.slotB).state;
        }
        return (frames[p] ??= interpolate(frames.a, frames.b, p / CROSSFADER_MAX));
    },

    // --- JSON ---

    /** The current sound as a JSON document (what the JSON view shows). */
    toJSON() {
        return JSON.stringify({ twig: PRESET_VERSION, ...capture() }, null, 2);
    },

    /** Apply a pasted JSON document to the sound; false when unparseable. */
    applyJSON(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            showStatus(`Not valid JSON: ${err.message}`, 'error');
            return false;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            showStatus('Expected a JSON object', 'error');
            return false;
        }
        // A whole preset bank pastes too
        const snapshot = parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
        applySnapshot(sanitize(snapshot), { immediate: true });
        before = null;
        showStatus('Applied JSON state', 'success');
        this._scheduleDirtyCheck();
        return true;
    },

    // --- dirty tracking ---

    /** Call once at boot: any sound change re-evaluates "dirty". */
    watch(events) {
        for (const name of events) document.addEventListener(name, () => this._scheduleDirtyCheck());
    },

    _markLoaded(index) {
        state.loaded = index;
        // What could actually be applied (a missing wave or IR falls back)
        state.loadedState = capture();
        state.dirty = false;
    },

    _scheduleDirtyCheck() {
        if (dirtyCheck !== null) return;
        dirtyCheck = requestAnimationFrame(() => {
            dirtyCheck = null;
            // A sound change that isn't a crossfade step (its events land
            // within a frame of the apply — the throttled system event up
            // to 150 ms later) is an edit: the sound is now a new
            // non-interpolated state, so the old one is forgotten
            if (performance.now() - lastCrossfadeAt > 250) before = null;
            if (state.loaded === null) return;
            const dirty = !snapshotsEqual(capture(), state.loadedState);
            if (dirty !== state.dirty) {
                state.dirty = dirty;
                emit();
            }
        });
    },

    _invalidateFrames(index) {
        if (index === presetConfig.slotA || index === presetConfig.slotB) frames = null;
    },
};
