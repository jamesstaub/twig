import BaseComponent from '../base/BaseComponent.js';

/**
 * Surface shell: shows the active surface's panels (and its side
 * column's) and hides the rest, in place — no panel ever moves in the DOM,
 * so component roots keep their ids and the embed band keeps its flattened
 * layout. Exposes the active surface to CSS as body[data-surface];
 * page-arrangement.css arranges whatever is visible.
 *
 * In the embed shell every panel is visible and no attributes are set:
 * the toolbar is hidden there and css/embed.css owns the layout.
 */

// Wrappers that should collapse when none of their panels is showing —
// innermost first, so an outer wrapper sees its inner ones already hidden
const WRAPPERS = ['#m4l-fundamental-source-panel', '.surface-stack', '.surface-side'];

export class SurfaceShellComponent extends BaseComponent {

    render({ embed, active, visibleRoots, allRoots }) {
        for (const id of allRoots) {
            const el = document.getElementById(id);
            if (el) el.hidden = !embed && !visibleRoots.has(id);
        }
        for (const sel of WRAPPERS) {
            const wrapper = document.querySelector(sel);
            if (!wrapper) continue;
            wrapper.hidden = !embed && [...wrapper.children].every((c) => c.hidden);
        }
        if (embed) delete document.body.dataset.surface;
        else document.body.dataset.surface = active;
        // Panels that were display:none while their canvases initialized
        // (p5 tonewheel, waveform previews) size themselves on window
        // resize — give them one now that they're laid out for real
        window.dispatchEvent(new Event('resize'));
    }
}
