import BaseComponent from '../base/BaseComponent.js';

/**
 * Surface shell: shows the active surface's panels (and the dock's) and
 * hides the rest, in place — no panel ever moves in the DOM, so component
 * roots keep their ids and the embed band keeps its flattened layout.
 * Exposes the state to CSS as body[data-surface] and body.viz-dock, which
 * page-arrangement.css uses to arrange the visible panels.
 *
 * In the embed shell every panel is visible and no attributes are set:
 * the toolbar is hidden there and css/embed.css owns the layout.
 */

// Wrappers that should collapse when none of their panels is showing —
// innermost first, so an outer wrapper sees its inner ones already hidden
const WRAPPERS = ['#m4l-fundamental-source-panel', '.wavetable-tonewheel-row', '.surface-stack'];

export class SurfaceShellComponent extends BaseComponent {

    render({ embed, active, dock, visibleRoots, allRoots }) {
        for (const id of allRoots) {
            const el = document.getElementById(id);
            if (el) el.hidden = !embed && !visibleRoots.has(id);
        }
        for (const sel of WRAPPERS) {
            const wrapper = document.querySelector(sel);
            if (!wrapper) continue;
            wrapper.hidden = !embed && [...wrapper.children].every((c) => c.hidden);
        }
        if (embed) {
            delete document.body.dataset.surface;
            document.body.classList.remove('viz-dock');
        } else {
            document.body.dataset.surface = active;
            document.body.classList.toggle('viz-dock', dock);
        }
        // Panels that were display:none while their canvases initialized
        // (p5 tonewheel, waveform previews) size themselves on window
        // resize — give them one now that they're laid out for real
        window.dispatchEvent(new Event('resize'));
    }
}
