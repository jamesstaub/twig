import { themeNumber } from '../../theme.js';
import { LAYOUT_MODE_CHANGED } from '../../events.js';

/**
 * Layout mode — which shell the app renders in, and how dense its controls
 * are. UI-only state: never bridged, never persisted.
 *
 *   shell:  'embed'    — Max4Live jweb band (viewport ≤ --embed-max-height
 *                        tall, or ?embed=1): css/embed.css flattens the
 *                        whole app into one ~150px horizontal row.
 *           'surfaces' — everything else: left toolbar + one surface at a
 *                        time (desktop and touch alike).
 *   roomy:  true when the Source panel fits on screen TOGETHER with
 *           another surface (surfaceState docks it there): the embed
 *           band, which is as wide as it needs to be, or a viewport both
 *           tall and wide enough (ROOMY_QUERY).
 *   coarse: true when the primary pointer is a finger (`pointer: coarse`,
 *           or ?coarse=1 to preview touch layouts with a mouse) — swaps
 *           control density (bigger sliders and targets)
 *           without changing the shell.
 *
 * Exposed to CSS as body.embed | body.surfaces, plus body.coarse
 * (roomy reaches CSS through the surface shell's body.source-docked).
 * --embed-max-height (css/theme.css) is the single source of truth for the
 * shell boundary.
 */

// Source above a surface takes ~320px, and the drawbar strip under it must
// stay out of its compact mode (420px); its three-across row needs a
// stack ~50rem wide even with the side column open beside it — a desktop
// window (a taller one under 85rem, where the navbar wraps to two rows —
// navbar.css). Tablets and phones keep one surface at a time.
const ROOMY_QUERY = '(min-height: 54rem) and (min-width: 85.01rem), (min-height: 57rem) and (min-width: 80rem)';

const state = { shell: 'surfaces', coarse: false, roomy: false };

function queryFlag(name) {
    const raw = new URLSearchParams(window.location.search).get(name);
    if (raw === null) return null;
    return raw !== '0' && raw !== 'false';
}

function detect() {
    const embed = queryFlag('embed')
        ?? (window.innerHeight > 0 && window.innerHeight <= themeNumber('--embed-max-height'));
    const coarse = queryFlag('coarse')
        ?? window.matchMedia('(pointer: coarse)').matches;
    const roomy = embed || window.matchMedia(ROOMY_QUERY).matches;
    return { shell: embed ? 'embed' : 'surfaces', coarse, roomy };
}

function apply(next) {
    const changed = next.shell !== state.shell || next.coarse !== state.coarse || next.roomy !== state.roomy;
    state.shell = next.shell;
    state.coarse = next.coarse;
    state.roomy = next.roomy;
    document.body.classList.toggle('embed', state.shell === 'embed');
    document.body.classList.toggle('surfaces', state.shell === 'surfaces');
    document.body.classList.toggle('coarse', state.coarse);
    if (changed) {
        document.dispatchEvent(new CustomEvent(LAYOUT_MODE_CHANGED, { detail: { ...state } }));
    }
}

export const layoutMode = {
    /** Detect and apply now; call before components measure their containers. */
    init() {
        apply(detect());
        window.addEventListener('resize', () => apply(detect()));
        window.matchMedia('(pointer: coarse)').addEventListener('change', () => apply(detect()));
    },
    get shell() { return state.shell; },
    get coarse() { return state.coarse; },
    get roomy() { return state.roomy; },
    get isEmbed() { return state.shell === 'embed'; },
};
