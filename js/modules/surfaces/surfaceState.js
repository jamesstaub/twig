import { SURFACE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * Surface state — which full-screen surface is showing and whether the
 * tonewheel dock is open. UI-only: never bridged, never persisted.
 *
 * A surface is a named group of existing panel roots (by element id). The
 * shell shows exactly one surface's panels at a time (modeled as a set so
 * multi-surface layouts are a policy change later, not a model change);
 * the dock additionally shows the DOCK_ROOTS beside whatever surface is
 * active. A surface with `family` puts the drawbar strip into that
 * parameter family (drawbarParams.js); `tools` marks the per-overtone
 * surfaces, whose panels carry the overtone toolbar (link / shape).
 * Presentation (toolbar, hiding panels, body classes) lives in the
 * surfaces controller/components — this module only holds the state and
 * the registry.
 */

export const SURFACES = [
    // One pad per overtone + the Trigger/Drone mode
    { id: 'trigger', label: 'Trigger', roots: ['pad-grid-root'] },
    // Fundamental, signal source, overtone system
    { id: 'source', label: 'Source', roots: ['fundamental-control-root', 'oscillator-control-root', 'spectral-system-root'] },
    // The drawbar strip in each of its parameter families, each with its
    // own visualization beside it
    { id: 'gain', label: 'Gain', roots: ['drawbars-control-root', 'gain-viz-root'], family: 'gain', tools: true },
    { id: 'filter', label: 'Filter', roots: ['drawbars-control-root', 'filter-viz-root'], family: 'filter', tools: true },
    // The inspector: one voice's sequence, modulation and pulse outs
    { id: 'sequence', label: 'Sequence', roots: ['sequence-control-root'], tools: true },
    { id: 'convolution', label: 'Convolution', roots: ['drawbars-control-root', 'conv-viz-root'], family: 'convolution', tools: true },
    { id: 'adsr', label: 'ADSR', roots: ['drawbars-control-root', 'adsr-viz-root'], family: 'adsr', tools: true },
    // dock: false — a settings form has no use for the tonewheel beside it
    { id: 'settings', label: 'Settings', roots: ['settings-control-root'], dock: false },
];

/** Panels the dock keeps visible beside any active surface. */
export const DOCK_ROOTS = ['tonewheel-container'];

const DEFAULT_SURFACE = 'gain';

const state = {
    visible: new Set([DEFAULT_SURFACE]),
    // null = "not chosen yet": the default depends on the pointer density,
    // which layoutMode only knows after init() — later than this module
    // is imported — so it's resolved on first read, not here. Desktop
    // starts with the tonewheel in view beside the strip (the layout
    // users know); a finger-driven screen has no room to spare.
    dock: null,
};

function dockDefault() {
    return !layoutMode.coarse;
}

function emit() {
    document.dispatchEvent(new CustomEvent(SURFACE_CHANGED, {
        detail: { active: surfaceState.active, dock: surfaceState.dock },
    }));
}

export const surfaceState = {
    get active() {
        return [...state.visible][0];
    },
    get dock() {
        return state.dock ?? dockDefault();
    },
    /** The dock toggle is on AND the active surface admits the dock. */
    get dockShown() {
        const active = SURFACES.find((s) => s.id === this.active);
        return this.dock && active?.dock !== false;
    },

    /** Make `id` the (only) visible surface. Unknown ids are ignored. */
    show(id) {
        if (!SURFACES.some((s) => s.id === id) || state.visible.has(id) && state.visible.size === 1) return;
        state.visible = new Set([id]);
        emit();
    },

    setDock(on) {
        const next = Boolean(on);
        if (next === this.dock) return;
        state.dock = next;
        emit();
    },

    toggleDock() {
        this.setDock(!this.dock);
    },

    /** Element ids that should be visible right now (active surface + dock). */
    visibleRoots() {
        const ids = new Set();
        for (const s of SURFACES) {
            if (state.visible.has(s.id)) s.roots.forEach((r) => ids.add(r));
        }
        if (this.dockShown) DOCK_ROOTS.forEach((r) => ids.add(r));
        return ids;
    },

    /** Every panel root any surface or the dock can show. */
    allRoots() {
        const ids = new Set(DOCK_ROOTS);
        for (const s of SURFACES) s.roots.forEach((r) => ids.add(r));
        return ids;
    },
};
