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
 *   coarse: true when the primary pointer is a finger (`pointer: coarse`,
 *           or ?coarse=1 to preview touch layouts with a mouse) — swaps
 *           control density (bigger sliders, sheet instead of popover)
 *           without changing the shell.
 *
 * Exposed to CSS as body.embed | body.surfaces, plus body.coarse.
 * --embed-max-height (css/theme.css) is the single source of truth for the
 * shell boundary.
 */

const state = { shell: 'surfaces', coarse: false };

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
    return { shell: embed ? 'embed' : 'surfaces', coarse };
}

function apply(next) {
    const changed = next.shell !== state.shell || next.coarse !== state.coarse;
    state.shell = next.shell;
    state.coarse = next.coarse;
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
    get isEmbed() { return state.shell === 'embed'; },
};
