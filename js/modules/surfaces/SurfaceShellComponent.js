import BaseComponent from '../base/BaseComponent.js';

/**
 * Surface shell: shows the active surface's panels (with the docked Source
 * panel and the side column, when they show) and hides the rest, in place
 * — no panel ever moves in the DOM, so component roots keep their ids.
 * Both shells work this way: page-arrangement.css arranges what is visible
 * on the surfaces shell, css/embed.css lines it up in the embed band.
 * Exposes the active surface to CSS as body[data-surface], and
 * body.source-docked while the Source panel shares the screen with it.
 */

// Wrappers that should collapse when none of their panels is showing —
// innermost first, so an outer wrapper sees its inner ones already hidden
const WRAPPERS = ['#m4l-fundamental-source-panel', '.surface-stack', '.surface-side'];

export class SurfaceShellComponent extends BaseComponent {

    render({ active, sourceDocked, visibleRoots, allRoots }) {
        for (const id of allRoots) {
            const el = document.getElementById(id);
            if (el) el.hidden = !visibleRoots.has(id);
        }
        for (const sel of WRAPPERS) {
            const wrapper = document.querySelector(sel);
            if (!wrapper) continue;
            wrapper.hidden = [...wrapper.children].every((c) => c.hidden);
        }
        document.body.dataset.surface = active;
        document.body.classList.toggle('source-docked', sourceDocked);
        // Panels that were display:none while their canvases initialized
        // (p5 tonewheel, waveform previews) size themselves on window
        // resize — give them one now that they're laid out for real
        window.dispatchEvent(new Event('resize'));
    }
}
