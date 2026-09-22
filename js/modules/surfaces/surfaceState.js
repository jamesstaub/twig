import { SURFACE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * Surface state — which surface is showing, whether the Source panel
 * accompanies it, and whether its side column is open. UI-only: never
 * bridged, never persisted.
 *
 * A surface is a named group of existing panel roots (by element id). One
 * MAIN surface is active at a time. SOURCE is the exception: where the
 * layout is roomy (layoutMode.roomy) it DOCKS — shown together with the
 * active surface, toggled independently by its own toolbar button — and
 * everywhere else (a short or narrow screen, or beside a surface without
 * `withSource`) it is a surface like the others, shown ALONE.
 *
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

export const SOURCE = 'source';

export const SURFACES = [
    // Fundamental, signal source, overtone system
    { id: 'source', label: 'Source', roots: ['fundamental-control-root', 'oscillator-control-root', 'spectral-system-root'] },
    // The drawbar strip in each of its parameter families, each with its
    // own visualization in the side column
    { id: 'gain', label: 'Gain', roots: ['drawbars-control-root'], side: 'gain-viz-root', family: 'gain', tools: true, withSource: true },
    // One pad per overtone
    { id: 'trigger', label: 'Trigger', roots: ['pad-grid-root'], withSource: true },
    { id: 'adsr', label: 'ADSR', roots: ['drawbars-control-root'], side: 'adsr-viz-root', family: 'adsr', tools: true, withSource: true },
    { id: 'filter', label: 'Filter', roots: ['drawbars-control-root'], side: 'filter-viz-root', family: 'filter', tools: true, withSource: true },
    // `label` is what fits the rail; `title` is the full name (tooltip)
    { id: 'convolution', label: 'Conv', title: 'Convolution', roots: ['drawbars-control-root'], side: 'conv-viz-root', family: 'convolution', tools: true, withSource: true },
    // The inspector: one voice's sequence, modulation and pulse outs,
    // that sequence drawn in the side column
    { id: 'sequence', label: 'Sequence', roots: ['sequence-control-root'], side: 'sequence-viz-root', tools: true, withSource: true },
    // Storage banks, the A/B crossfader and the JSON state view
    { id: 'presets', label: 'Presets', roots: ['presets-control-root'] },
    { id: 'settings', label: 'Settings', roots: ['settings-control-root'] },
];

/** Panels every side column shows under the surface's own visualization. */
export const SIDE_ROOTS = ['tonewheel-container'];

const state = {
    // The main surface — never SOURCE
    active: 'gain',
    // The Source panel accompanies the active surface wherever it can dock
    // (the page opens on Source + Gain where there is room, on Gain alone
    // where there isn't)
    dock: true,
    // Source is THE surface right now (only where it can't dock)
    alone: false,
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

function def(id) {
    return SURFACES.find((s) => s.id === id);
}

function emit() {
    document.dispatchEvent(new CustomEvent(SURFACE_CHANGED));
}

export const surfaceState = {
    /** The main surface (never SOURCE — see `sourceAlone`). */
    get active() {
        return state.active;
    },
    /** Source may sit together with the active surface right now. */
    get canDock() {
        return layoutMode.roomy && Boolean(def(state.active).withSource);
    },
    get sourceDocked() {
        return state.dock && this.canDock;
    },
    /** Source is showing INSTEAD of the active surface. */
    get sourceAlone() {
        return state.alone && !this.canDock;
    },
    /** Is `id`'s panel on screen? */
    showing(id) {
        if (id === SOURCE) return this.sourceDocked || this.sourceAlone;
        return id === state.active && !this.sourceAlone;
    },
    /** The showing surface carries the overtone toolbar (link / shape). */
    get tools() {
        return !this.sourceAlone && Boolean(def(state.active).tools);
    },
    get side() {
        return state.side ?? sideDefault();
    },
    /** The showing surface's side visualization panel id, if it has a side column. */
    get sidePanel() {
        return this.sourceAlone ? null : def(state.active).side ?? null;
    },
    /** The toggle is on AND the showing surface has a side column. */
    get sideShown() {
        return this.side && this.sidePanel !== null;
    },

    /**
     * A toolbar button. A main surface becomes the active one; SOURCE
     * toggles — its dock where it can dock, itself as the surface where
     * it can't.
     */
    show(id) {
        if (id === SOURCE) {
            if (this.canDock) {
                state.dock = state.alone || !state.dock;
                state.alone = false;
            } else {
                state.alone = !state.alone;
            }
        } else {
            if (!def(id) || (id === state.active && !state.alone)) return;
            state.active = id;
            state.alone = false;
        }
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

    /** Element ids that should be visible right now. */
    visibleRoots() {
        const ids = new Set();
        for (const s of SURFACES) {
            if (this.showing(s.id)) s.roots.forEach((r) => ids.add(r));
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
