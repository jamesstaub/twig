import { AppState } from '../../config.js';
import {
    OVERTONE_SIGNAL_CHANGED, SPECTRAL_SYSTEM_CHANGED, DRAWBARS_RESET, DRAWBARS_RANDOMIZED,
} from '../../events.js';
import { BaseController } from '../base/BaseController.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import EnvelopeVizComponent from './EnvelopeVizComponent.js';

/**
 * EnvelopeVizController — every voice's ADSR curve, redrawn whenever an
 * envelope changes, the overtone system/count changes, or the panel
 * resizes. UI-only: it never mutates state, only reads it.
 */
export class EnvelopeVizController extends BaseController {

    createComponent(selector) {
        return new EnvelopeVizComponent(selector);
    }

    getProps() {
        const ratios = AppState.currentSystem.ratios;
        return {
            voices: ratios.map((ratio, i) => ({ ratio, env: OvertoneSignalActions.getEnvelope(i) })),
        };
    }

    bindExternalEvents() {
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            if (e.detail?.kind === 'envelope') this.scheduleUpdate();
        });
        for (const evt of [SPECTRAL_SYSTEM_CHANGED, DRAWBARS_RESET, DRAWBARS_RANDOMIZED]) {
            document.addEventListener(evt, () => this.scheduleUpdate());
        }
        // Re-render at the container's real width whenever the panel
        // reflows (window resize, surface switch, embed) — the first
        // render can land before layout settles.
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
            this._resizeObserver.observe(this.component.el);
        } else {
            this._resizeListener = () => this.scheduleUpdate();
            window.addEventListener('resize', this._resizeListener);
        }
    }

    destroy() {
        this._resizeObserver?.disconnect();
        if (this._resizeListener) window.removeEventListener('resize', this._resizeListener);
        super.destroy();
    }
}
