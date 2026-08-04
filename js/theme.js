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

/** Color for a partial by index, cycling through the harmonic palette. */
export function harmonicColor(index) {
    return themeColor(`--harmonic-${(index % HARMONIC_COLOR_COUNT) + 1}`);
}

/** Drop memoized values (only needed after swapping themes at runtime). */
export function refreshTheme() {
    cache = new Map();
}
