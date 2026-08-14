/**
 * THEME BRIDGE
 * -----------------------------------------------------------------------------
 * The design tokens live in css/theme.css as CSS custom properties — the
 * single source of truth for the app's look. This module exposes them to
 * JS so the p5 sketches draw with the exact same values the stylesheets use.
 *
 * Values are memoized after the first read (getComputedStyle is not free
 * and the sketches ask every frame). Call refreshTheme() if tokens are
 * ever swapped at runtime.
 */

import { consonance } from './consonance.js';

/** Number of --harmonic-N tokens defined in css/theme.css. */
export const HARMONIC_COLOR_COUNT = 12;

let cache = new Map();

/**
 * Read a design token, e.g. themeColor('--viz-grid').
 * Returns the raw token string (hex/rgb), directly usable by p5.color().
 */
export function themeColor(token) {
    let value = cache.get(token);
    if (value === undefined) {
        value = getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim();
        cache.set(token, value);
    }
    return value;
}

/**
 * Read a token as a number, e.g. themeNumber('--embed-max-height') → 220.
 * Strips whatever CSS unit it carries (px, rem, …) — callers that need
 * unit-awareness should read themeColor() directly instead.
 */
export function themeNumber(token) {
    return parseFloat(themeColor(token));
}

/**
 * Color for a partial by its interval against the fundamental: the
 * consonance score picks a step on the --harmonic-1..N ramp (ordered
 * dissonant → consonant), Hammond-style — octave partials land on the
 * lightest "white" end, complex/irrational intervals on the dark end.
 * Shared by the drawbars and the p5 tonewheel rings so they always match.
 */
export function partialColor(ratio) {
    const key = `partial:${ratio}`;
    let color = cache.get(key);
    if (color === undefined) {
        const step = 1 + Math.round(consonance(ratio) * (HARMONIC_COLOR_COUNT - 1));
        color = themeColor(`--harmonic-${step}`);
        cache.set(key, color);
    }
    return color;
}

/** Drop memoized values (only needed after swapping themes at runtime). */
export function refreshTheme() {
    cache = new Map();
}
