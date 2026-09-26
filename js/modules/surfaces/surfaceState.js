import { SURFACE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * Surface state — which surface is showing, which pinned panel accompanies
 * it, and whether its side column is open. UI-only: never bridged, never
 * persisted.
 *
 * A surface is a named group of existing panel roots (by element id), in
 * one of three GROUPS (the toolbar draws a divider between them):
 *   pin  — Source and Trigger. Where the layout is roomy
 *          (layoutMode.roomy) ONE of them is PINNED: shown together with
 *          the active main surface, toggled by its own toolbar button
 *          (the page opens on Source + Gain). Never both at once.
 *          Where there is no room (a short or narrow screen, or a page
 *          surface active) a pin button shows that panel ALONE instead.
 *   main — the per-overtone surfaces (the drawbar strip's families and
 *          Sequence): one active at a time, a pin may sit with it.
 *   page — Presets and Settings: the whole screen, nothing pinned.
 *
 * A surface with `side` has a side column — that visualization panel over
 * the SIDE_ROOTS (the tonewheel) — which the panel's own toggle opens and
 * closes as a whole; surfaces without one have no side column at all.
 * A surface with `family` puts the drawbar strip into that parameter
 * family (drawbarParams.js); `tools` marks the per-overtone surfaces,
 * whose panels carry the overtone toolbar (link / shape). Presentation
 * (toolbar, hiding panels, body classes) lives in the surfaces
 * controller/components — this module only holds the state and the
 * registry.
 */

export const SURFACES = [
    // Fundamental, signal source, overtone system
    { id: 'source', group: 'pin', label: 'Source', roots: ['fundamental-control-root', 'oscillator-control-root', 'spectral-system-root'] },
    // One pad per overtone
    { id: 'trigger', group: 'pin', label: 'Trigger', roots: ['pad-grid-root'] },
    // The drawbar strip in each of its parameter families, each with its
    // own visualization in the side column
    { id: 'gain', group: 'main', label: 'Gain', roots: ['drawbars-control-root'], side: 'gain-viz-root', family: 'gain', tools: true },
    { id: 'adsr', group: 'main', label: 'ADSR', roots: ['drawbars-control-root'], side: 'adsr-viz-root', family: 'adsr', tools: true },
    { id: 'filter', group: 'main', label: 'Filter', roots: ['drawbars-control-root'], side: 'filter-viz-root', family: 'filter', tools: true },
    // `label` is what fits the rail; `title` is the full name (tooltip)
    { id: 'convolution', group: 'main', label: 'Conv', title: 'Convolution', roots: ['drawbars-control-root'], side: 'conv-viz-root', family: 'convolution', tools: true },
    // The inspector: one voice's sequence, modulation and pulse outs,
    // that sequence drawn in the side column
    { id: 'sequence', group: 'main', label: 'Sequence', roots: ['sequence-control-root'], side: 'sequence-viz-root', tools: true },
    // Storage banks, the A/B crossfader and the JSON state view
    { id: 'presets', group: 'page', label: 'Presets', roots: ['presets-control-root'] },
    { id: 'settings', group: 'page', label: 'Settings', roots: ['settings-control-root'] },
];

/** Panels every side column shows under the surface's own visualization. */
export const SIDE_ROOTS = ['tonewheel-container'];

const state = {
    // The active main or page surface — never a pin
    active: 'gain',
    // The pin panel that accompanies the active main surface wherever it
    // can (the page opens on Source + Gain where there is room, on Gain
    // alone where there isn't); null = none pinned
    pinned: 'source',
    // A pin panel showing INSTEAD of the active surface (only where it
    // can't be pinned), or null
    alone: null,
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
    /** The active main or page surface (never a pin — see `alone`). */
    get active() {
        return state.active;
    },
    /** A pin may sit with the active surface right now. */
    get canPin() {
        return layoutMode.roomy && def(state.active).group === 'main';
    },
    /** The pin panel showing WITH the active surface, or null. */
    get pinnedShown() {
        return this.canPin ? state.pinned : null;
    },
    /** The pin panel showing INSTEAD of the active surface, or null. */
    get alone() {
        return this.canPin ? null : state.alone;
    },
    /** Is `id`'s panel on screen? */
    showing(id) {
        if (def(id).group === 'pin') return this.pinnedShown === id || this.alone === id;
        return id === state.active && !this.alone;
    },
    /** The showing surface carries the overtone toolbar (link / shape). */
    get tools() {
        return !this.alone && Boolean(def(state.active).tools);
    },
    get side() {
        return state.side ?? sideDefault();
    },
    /** The showing surface's side visualization panel id, if it has a side column. */
    get sidePanel() {
        return this.alone ? null : def(state.active).side ?? null;
    },
    /** The toggle is on AND the showing surface has a side column. */
    get sideShown() {
        return this.side && this.sidePanel !== null;
    },

    /**
     * A toolbar button. A main or page surface becomes the active one; a
     * pin toggles — pinned where it can be (replacing the other pin),
     * shown alone where it can't.
     */
    show(id) {
        const surface = def(id);
        if (!surface) return;
        if (surface.group === 'pin') {
            if (this.canPin) {
                state.pinned = state.pinned === id ? null : id;
            } else {
                state.alone = state.alone === id ? null : id;
            }
        } else {
            if (id === state.active && !state.alone) return;
            state.active = id;
            state.alone = null;
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
