import { AppState } from '../../config.js';
import { LINK_ALL_CHANGED } from '../../events.js';

/**
 * "Link all" — editing any per-overtone control applies the value to
 * every overtone voice. Two ways in: hold cmd/ctrl during the gesture
 * (desktop), or switch the lock on (the Mix header's link toggle — the
 * only way on touch). body.link-all is set while either is active so CSS
 * can tint the linkable controls.
 *
 * Controls whose triggering event carries modifier keys (pointer, mouse)
 * pass it to voiceTargets; controls whose events don't (select/range
 * change events) fall back to the tracked key state.
 *
 * RULE for linked writes: copy the control's stored PARAMETER (slider
 * position, partial index, ratio), never a derived output. A filter
 * cutoff links as the same series step on every voice — each voice then
 * computes its own Hz from its own pitch — not as one absolute frequency.
 */

let held = false;   // modifier key currently down
let locked = false; // the toggle

function sync() {
    document.body.classList.toggle('link-all', held || locked);
}

function emit() {
    document.dispatchEvent(new CustomEvent(LINK_ALL_CHANGED, { detail: { locked, held } }));
}

function setHeld(on) {
    if (on === held) return;
    held = on;
    sync();
    emit(); // the Mix link toggle mirrors the held key
}

export function initLinkAll() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Meta' || e.key === 'Control') setHeld(true);
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Meta' || e.key === 'Control') setHeld(e.metaKey || e.ctrlKey);
    });
    window.addEventListener('blur', () => setHeld(false));
}

/** True when the gesture (or, lacking one, the keyboard/lock state) links all voices. */
export function isLinkAll(e) {
    if (locked) return true;
    if (e && typeof e.metaKey === 'boolean') return e.metaKey || e.ctrlKey;
    return held;
}

/**
 * The voice indices a gesture on `index` addresses: every partial of the
 * current system when linked, else just the one.
 */
export function voiceTargets(index, e) {
    if (!isLinkAll(e)) return [index];
    return Array.from({ length: AppState.currentSystem.ratios.length }, (_, i) => i);
}

/** The lock (UI-only, never persisted). Emits LINK_ALL_CHANGED { locked }. */
export const linkLock = {
    get on() {
        return locked;
    },
    /** The modifier key is down right now (desktop). */
    get held() {
        return held;
    },
    set(on) {
        on = Boolean(on);
        if (on === locked) return;
        locked = on;
        sync();
        emit();
    },
    toggle() {
        this.set(!locked);
    },
};
