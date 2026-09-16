import { SURFACE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * Surface state — which full-screen surface is showing and whether the
 * visualization dock is open. UI-only: never bridged, never persisted.
 *
 * A surface is a named group of existing panel roots (by element id). The
 * shell shows exactly one surface's panels at a time (modeled as a set so
 * multi-surface layouts are a policy change later, not a model change);
 * the viz dock additionally shows the DOCK_ROOTS beside whatever surface
 * is active. Presentation (toolbar, hiding panels, body classes) lives in
 * the surfaces controller/components — this module only holds the state
 * and the registry.
 */

export const SURFACES = [
    // The fundamental strip (pitch, octave, keyboard) over the pad grid
    { id: 'play', label: 'Play', roots: ['fundamental-control-root', 'pad-grid-root'] },
    { id: 'mix', label: 'Mix', roots: ['drawbars-control-root'] },
    // The inspector, full width (inspectorState picks the overtone)
    { id: 'voice', label: 'Voice', roots: ['voice-control-root'] },
    { id: 'source', label: 'Source', roots: ['oscillator-control-root'] },
    { id: 'system', label: 'System', roots: ['spectral-system-root'] },
    { id: 'wavetable', label: 'Wavetable', roots: ['result-control-root', 'tonewheel-container'] },
    { id: 'settings', label: 'Settings', roots: ['settings-control-root'] },
];

/** Panels the viz dock keeps visible beside any active surface. */
export const DOCK_ROOTS = ['result-control-root', 'tonewheel-container'];

const DEFAULT_SURFACE = 'mix';

const state = {
    visible: new Set([DEFAULT_SURFACE]),
    // null = "not chosen yet": the default depends on the pointer density,
    // which layoutMode only knows after init() — later than this module
    // is imported — so it's resolved on first read, not here. Desktop
    // starts with the canvases in view beside the drawbars (the layout
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
        if (this.dock) DOCK_ROOTS.forEach((r) => ids.add(r));
        return ids;
    },

    /** Every panel root any surface or the dock can show. */
    allRoots() {
        const ids = new Set(DOCK_ROOTS);
        for (const s of SURFACES) s.roots.forEach((r) => ids.add(r));
        return ids;
    },
};
