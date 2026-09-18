import { BaseController } from '../base/BaseController.js';
import { InspectorComponent } from './InspectorComponent.js';
import { inspectorState } from './inspectorState.js';
import { layoutMode } from '../layout/layoutMode.js';
import { surfaceState } from '../surfaces/surfaceState.js';
import { linkLock } from '../generic/linkAll.js';
import { shapeMode } from '../shape/shapeMode.js';
import {
    INSPECTOR_CHANGED,
    LAYOUT_MODE_CHANGED,
    LINK_ALL_CHANGED,
    MIDI_OUTPUT_CHANGED,
    OVERTONE_SIGNAL_CHANGED,
    SHAPE_MODE_CHANGED,
    SPECTRAL_SYSTEM_CHANGED,
    SURFACE_CHANGED,
} from '../../events.js';

/**
 * Homes the one InspectorComponent in either the Sequence surface's panel
 * (when that surface is active) or the inspector sheet beside any other
 * surface (while inspectorState.open), and re-renders it when the
 * selected voice or its state changes from outside the inspector.
 */
export class InspectorController extends BaseController {

    /**
     * @param {string} sheetSelector   the inspector sheet
     * @param {string} surfaceSelector the Sequence surface's editor area
     * @param {HTMLElement} headerSlot where the voice stepper mounts on the
     *   surface (the panel's bottom toolbar slot)
     */
    constructor(sheetSelector, surfaceSelector, headerSlot) {
        super(sheetSelector);
        this.sheetEl = document.querySelector(sheetSelector);
        this.surfaceEl = document.querySelector(surfaceSelector);
        this.headerSlot = headerSlot;
        if (!this.surfaceEl) throw new Error(`InspectorController: missing ${surfaceSelector}`);
    }

    createComponent(selector) {
        return new InspectorComponent(selector);
    }

    getProps() {
        const inSurface = surfaceState.active === 'sequence';
        return {
            index: inspectorState.index,
            host: inSurface ? 'surface' : 'sheet',
            headerSlot: inSurface ? this.headerSlot : null,
            dialSize: layoutMode.coarse ? 52 : 36,
            scope: this.scope(),
        };
    }

    /** Who an edit addresses right now: 'shape' | 'link' | null (the lock, or its held key). */
    scope() {
        if (shapeMode.on || shapeMode.held) return 'shape';
        if (linkLock.on || linkLock.held) return 'link';
        return null;
    }

    update() {
        const inSurface = surfaceState.active === 'sequence';
        const host = inSurface ? this.surfaceEl : this.sheetEl;
        const sheetOpen = !inSurface && inspectorState.isOpen;

        // Re-home the component: clear whatever it left in the other element
        if (this.component.el !== host) {
            this.component.teardown();
            this.component.el.innerHTML = '';
            this.component.el = host;
            this.headerSlot?.replaceChildren();
        }

        this.sheetEl.hidden = !sheetOpen;
        document.body.classList.toggle('inspector-open', sheetOpen);

        if (!inSurface && !sheetOpen) {
            // Nothing to show: don't keep a stale editor in the hidden sheet
            this.component.teardown();
            this.sheetEl.innerHTML = '';
            return null;
        }
        return super.update();
    }

    bindComponentEvents() {
        this.component.onClose = () => inspectorState.close();
        this.component.onStep = (delta) => inspectorState.step(delta);
        this.component.onExpand = () => surfaceState.show('sequence');
    }

    bindExternalEvents() {
        document.addEventListener(INSPECTOR_CHANGED, () => this.update());
        document.addEventListener(SURFACE_CHANGED, () => this.update());
        document.addEventListener(LAYOUT_MODE_CHANGED, () => this.update());
        // In place, never a re-render: shift can go down mid-drag
        const syncScope = () => this.component.setScope(this.scope());
        document.addEventListener(LINK_ALL_CHANGED, syncScope);
        document.addEventListener(SHAPE_MODE_CHANGED, syncScope);
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
        document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.scheduleUpdate());
        // The selected voice changed from outside (OSC, a linked write from
        // another voice's controls) — mirror it. Our own writes are
        // already on screen.
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            if (this.component.writing) return;
            if (e.detail?.index !== inspectorState.index) return;
            this.scheduleUpdate();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.sheetEl.hidden) inspectorState.close();
        });
    }
}
