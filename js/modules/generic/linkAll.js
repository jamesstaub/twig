import { AppState } from '../../config.js';

/**
 * Cmd/Ctrl "link" gestures: holding the modifier while editing any
 * per-overtone control applies the value to every overtone voice.
 *
 * Controls whose triggering event carries modifier keys (pointer, mouse)
 * pass it to voiceTargets; controls whose events don't (select/range
 * change events) fall back to the tracked key state. body.link-all is set
 * while the modifier is held so CSS can tint the linkable controls.
 *
 * RULE for linked writes: copy the control's stored PARAMETER (slider
 * position, partial index, ratio), never a derived output. A filter
 * cutoff links as the same series step on every voice — each voice then
 * computes its own Hz from its own pitch — not as one absolute frequency.
 */

let active = false;

function set(on) {
    if (on === active) return;
    active = on;
    document.body.classList.toggle('link-all', on);
}

export function initLinkAll() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Meta' || e.key === 'Control') set(true);
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Meta' || e.key === 'Control') set(e.metaKey || e.ctrlKey);
    });
    window.addEventListener('blur', () => set(false));
}

/** True when the gesture (or, lacking one, the keyboard state) links all voices. */
export function isLinkAll(e) {
    if (e && typeof e.metaKey === 'boolean') return e.metaKey || e.ctrlKey;
    return active;
}

/**
 * The voice indices a gesture on `index` addresses: every partial of the
 * current system when the link modifier is held, else just the one.
 */
export function voiceTargets(index, e) {
    if (!isLinkAll(e)) return [index];
    return Array.from({ length: AppState.currentSystem.ratios.length }, (_, i) => i);
}
