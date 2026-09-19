import { SURFACE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * Surface state — which full-screen surface is showing and whether its
 * side column is open. UI-only: never bridged, never persisted.
 *
 * A surface is a named group of existing panel roots (by element id). The
 * shell shows exactly one surface's panels at a time (modeled as a set so
 * multi-surface layouts are a policy change later, not a model change).
 * A surface with `side` has a side column — that visualization panel over
 * the SIDE_ROOTS (the tonewheel) — which the panel's own toggle opens and
 * closes as a whole; surfaces without one have no side column at all.
 * A surface with `family` puts the drawbar strip into that
 * parameter family (drawbarParams.js); `tools` marks the per-overtone
 * surfaces, whose panels carry the overtone toolbar (link / shape).
 * Presentation (toolbar, hiding panels, body classes) lives in the
 * surfaces controller/components — this module only holds the state and
 * the registry.
 */

export const SURFACES = [
    // Fundamental, signal source, overtone system
    { id: 'source', label: 'Source', roots: ['fundamental-control-root', 'oscillator-control-root', 'spectral-system-root'] },
    // The drawbar strip in each of its parameter families, each with its
    // own visualization in the side column
    { id: 'gain', label: 'Gain', roots: ['drawbars-control-root'], side: 'gain-viz-root', family: 'gain', tools: true },
    // One pad per overtone
    { id: 'trigger', label: 'Trigger', roots: ['pad-grid-root'] },
    { id: 'adsr', label: 'ADSR', roots: ['drawbars-control-root'], side: 'adsr-viz-root', family: 'adsr', tools: true },
    { id: 'filter', label: 'Filter', roots: ['drawbars-control-root'], side: 'filter-viz-root', family: 'filter', tools: true },
    // `label` is what fits the rail; `title` is the full name (tooltip)
    { id: 'convolution', label: 'Conv', title: 'Convolution', roots: ['drawbars-control-root'], side: 'conv-viz-root', family: 'convolution', tools: true },
    // The inspector: one voice's sequence, modulation and pulse outs,
    // that sequence drawn in the side column
    { id: 'sequence', label: 'Sequence', roots: ['sequence-control-root'], side: 'sequence-viz-root', tools: true },
    { id: 'settings', label: 'Settings', roots: ['settings-control-root'] },
];

/** Panels every side column shows under the surface's own visualization. */
export const SIDE_ROOTS = ['tonewheel-container'];

const DEFAULT_SURFACE = 'gain';

const state = {
    visible: new Set([DEFAULT_SURFACE]),
    // null = "not chosen yet": the default depends on the pointer density,
    // which layoutMode only knows after init() — later than this module
    // is imported — so it's resolved on first read, not here. Desktop
    // starts with the side column open beside the strip (the layout users
    // know); a finger-driven screen has no room to spare.
    side: null,
};

function sideDefault() {
    return !layoutMode.coarse;
}

function emit() {
    document.dispatchEvent(new CustomEvent(SURFACE_CHANGED, {
        detail: { active: surfaceState.active, side: surfaceState.side },
    }));
}

export const surfaceState = {
    get active() {
        return [...state.visible][0];
    },
    get side() {
        return state.side ?? sideDefault();
    },
    /** The active surface's side visualization panel id, if it has a side column. */
    get sidePanel() {
        return SURFACES.find((s) => s.id === this.active)?.side ?? null;
    },
    /** The toggle is on AND the active surface has a side column. */
    get sideShown() {
        return this.side && this.sidePanel !== null;
    },

    /** Make `id` the (only) visible surface. Unknown ids are ignored. */
    show(id) {
        if (!SURFACES.some((s) => s.id === id) || state.visible.has(id) && state.visible.size === 1) return;
        state.visible = new Set([id]);
        emit();
    },

    setSide(on) {
        const next = Boolean(on);
        if (next === this.side) return;
        state.side = next;
        emit();
    },

    toggleSide() {
        this.setSide(!this.side);
    },

    /** Element ids that should be visible right now (active surface + its side column). */
    visibleRoots() {
        const ids = new Set();
        for (const s of SURFACES) {
            if (state.visible.has(s.id)) s.roots.forEach((r) => ids.add(r));
        }
        if (this.sideShown) [this.sidePanel, ...SIDE_ROOTS].forEach((r) => ids.add(r));
        return ids;
    },

    /** Every panel root any surface or side column can show. */
    allRoots() {
        const ids = new Set(SIDE_ROOTS);
        for (const s of SURFACES) [...s.roots, ...(s.side ? [s.side] : [])].forEach((r) => ids.add(r));
        return ids;
    },
};
