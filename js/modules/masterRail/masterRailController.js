import { layoutMode } from '../layout/layoutMode.js';
import { LAYOUT_MODE_CHANGED } from '../../events.js';

/**
 * Master rail — where master Gain and Slew live while the layout is
 * narrow (layoutMode.narrow): a skinny column down the right edge, the
 * sliders upright, instead of a navbar row of their own. The two slider
 * ROOTS move between their navbar home and the rail — each component
 * scopes its lookups to its root (and the OSC client finds them by id),
 * so nothing else notices. Presentation: master-rail.css.
 */
export class MasterRailController {

    /**
     * @param {string} railSelector  the rail
     * @param {string} homeSelector  the roots' place in the navbar
     * @param {string[]} rootSelectors the slider roots, in order
     */
    constructor(railSelector, homeSelector, rootSelectors) {
        this.rail = document.querySelector(railSelector);
        this.home = document.querySelector(homeSelector);
        this.roots = rootSelectors.map((sel) => document.querySelector(sel));
        if (!this.rail || !this.home || this.roots.some((r) => !r)) {
            throw new Error('MasterRailController: missing rail, home or slider root');
        }
    }

    init() {
        this.sync();
        document.addEventListener(LAYOUT_MODE_CHANGED, () => this.sync());
    }

    sync() {
        const host = layoutMode.narrow ? this.rail : this.home;
        if (this.roots[0].parentElement !== host) host.append(...this.roots);
    }
}
