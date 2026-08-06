/**
 * CONSONANCE SCORING
 * -----------------------------------------------------------------------------
 * Rates how consonant an interval is against the fundamental, used to color
 * partials (drawbars, tonewheel rings) the way Hammond drawbars encode
 * harmonic role: octaves read as "white", simple ratios as consonant shades,
 * complex or irrational intervals as dissonant shades.
 *
 * Method: octave-reduce the ratio into [1, 2), then find the simplest
 * rational p/q within a small tolerance via continued fractions. The score
 * comes from Tenney height log2(p·q) — the standard measure of a just
 * interval's complexity — so 1/1 and every 2^k scores 1.0, 3/2 scores high,
 * 21/20 low, and anything with no close small rational (φ, stretched
 * pseudo-octaves) scores 0.
 */

/** Relative tolerance for "is this ratio effectively p/q". ~7 cents: wide
 *  enough that worn-tonewheel detunes (≤0.2%) keep their base color, tight
 *  enough that φ and Sethares stretches don't pass as just intervals. */
const REL_TOLERANCE = 0.004;

/** Denominator cap for the search; with p < 2q this bounds Tenney height. */
const MAX_DENOMINATOR = 32;
const MAX_HEIGHT = Math.log2(2 * MAX_DENOMINATOR * MAX_DENOMINATOR);

/** Fold a ratio into [1, 2) — octave equivalence, as on a Hammond where
 *  16', 8', 4', 2', 1' are all "white". */
function octaveReduce(ratio) {
    let r = ratio;
    while (r >= 2) r /= 2;
    while (r < 1) r *= 2;
    return r;
}

/**
 * Best rational approximation p/q to x (x in [1, 2)) with q ≤ maxDen,
 * via continued-fraction convergents. Returns [p, q] or null if no
 * convergent lands within the relative tolerance.
 */
function bestRational(x, maxDen, tolerance) {
    let h0 = 1, k0 = 0;
    let h1 = Math.floor(x), k1 = 1;
    let frac = x - Math.floor(x);

    for (let i = 0; i < 24; i++) {
        if (Math.abs(h1 / k1 - x) / x <= tolerance) return [h1, k1];
        if (frac < 1e-12) break;
        const a = Math.floor(1 / frac);
        frac = 1 / frac - a;
        const h2 = a * h1 + h0;
        const k2 = a * k1 + k0;
        if (k2 > maxDen) break;
        h0 = h1; k0 = k1; h1 = h2; k1 = k2;
    }
    return null;
}

/**
 * Consonance of a ratio against 1/1, in [0, 1].
 * 1 = octave-equivalent to the fundamental, 0 = no simple rational nearby.
 * Symmetric under inversion (r and 1/r score the same), so subharmonic
 * (utonality) mode keeps identical colors.
 */
export function consonance(ratio) {
    if (!(ratio > 0) || !isFinite(ratio)) return 0;

    const reduced = octaveReduce(ratio);
    const approx = bestRational(reduced, MAX_DENOMINATOR, REL_TOLERANCE);
    if (!approx) return 0;

    const [p, q] = approx;
    const height = Math.log2(p * q);
    return Math.max(0, 1 - height / MAX_HEIGHT);
}
