import { AppState } from '../../config.js';
import { SHAPE_MODE_CHANGED } from '../../events.js';
import { shapedRow, stepShapeCycles } from './rowShape.js';

/**
 * "Shape" — editing one overtone's control sculpts that parameter across
 * EVERY overtone along a waveform contour (rowShape.js), anchored on the
 * edited voice. Two ways in, like link-all: hold shift during the gesture
 * (desktop), or switch the lock on (the overtone toolbar's shape toggle —
 * the only way on touch). UI-only, never persisted.
 *
 * Holds what the gesture needs and the shape panel edits: the contour
 * (null = follow the main oscillator waveform), how many cycles of it
 * span the row, and the last gesture — so changing either re-applies it
 * live. Emits SHAPE_MODE_CHANGED { on, held } on any change.
 */

let locked = false; // the toggle
let held = false;   // shift currently down
let cycles = 1;
let contour = null;
let last = null;    // { index, t, setNorm }

function emit() {
    document.dispatchEvent(new CustomEvent(SHAPE_MODE_CHANGED, { detail: { on: locked, held } }));
}

function setHeld(on) {
    if (on === held) return;
    held = on;
    emit(); // the toolbar's shape toggle mirrors the held key
}

export function initShapeMode() {
    document.addEventListener('keydown', (e) => { if (e.key === 'Shift') setHeld(true); });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') setHeld(e.shiftKey); });
    window.addEventListener('blur', () => setHeld(false));
}

export const shapeMode = {
    get on() {
        return locked;
    },
    /** Shift is down right now (desktop). */
    get held() {
        return held;
    },
    get cycles() {
        return cycles;
    },
    /** The contour's waveform name. */
    get contour() {
        return contour || AppState.currentWaveform;
    },

    /** Does this gesture sculpt the row? The lock, or shift (the event's, else the tracked key). */
    isGesture(e) {
        if (locked) return true;
        if (e && typeof e.shiftKey === 'boolean') return e.shiftKey;
        return held;
    },

    set(on) {
        on = Boolean(on);
        if (on === locked) return;
        locked = on;
        emit();
    },

    /**
     * Sculpt a row: `t` is the edited control's 0-1 position within its
     * range; `setNorm(i, ti)` maps each voice's shaped position back into
     * the caller's parameter. Remembered for re-application.
     */
    applyRow(index, t, setNorm) {
        const positions = shapedRow({
            count: AppState.currentSystem.ratios.length,
            index, t, cycles,
            shapeName: this.contour,
        });
        positions.forEach((ti, i) => setNorm(i, ti));
        last = { index, t, setNorm };
    },

    /** `applyRow` for a parameter with a range: `set(i, value)` gets values, not positions. */
    applyParam(index, { min, max }, value, set) {
        const span = max - min || 1;
        this.applyRow(index, (value - min) / span, (i, ti) => set(i, min + ti * span));
    },

    setContour(name) {
        contour = name;
        this._reapply();
    },

    stepCycles(factor) {
        cycles = stepShapeCycles(cycles, factor);
        this._reapply();
    },

    _reapply() {
        if (last) this.applyRow(last.index, last.t, last.setNorm);
        emit();
    },

    /** Off, and back to defaults (one cycle, the oscillator's own contour). */
    reset() {
        cycles = 1;
        contour = null;
        last = null;
        locked = false;
        emit();
    },
};
