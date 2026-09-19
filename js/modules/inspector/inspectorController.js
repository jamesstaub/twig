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
 * The Sequence panel's editor: renders the InspectorComponent for the
 * selected voice while the panel shows, and re-renders it when the voice
 * or its state changes from outside the inspector.
 *
 * The panel is the Sequence surface; in the embed band (no toolbar, no
 * surfaces) it is a full-band overlay instead (body.sequence-open,
 * inspector.embed.css) with its own close button — the same arrangement
 * as Settings. `open(index)` gets there on either shell.
 */
export class InspectorController extends BaseController {

    /**
     * @param {string} selector        the panel's editor area
     * @param {HTMLElement} headerSlot where the voice stepper mounts (the
     *   panel's bottom toolbar slot)
     * @param {string} closeSelector   the panel's close button (embed)
     */
    constructor(selector, headerSlot, closeSelector) {
        super(selector);
        this.headerSlot = headerSlot;
        this.closeEl = document.querySelector(closeSelector);
    }

    createComponent(selector) {
        return new InspectorComponent(selector);
    }

    get showing() {
        return layoutMode.isEmbed
            ? document.body.classList.contains('sequence-open')
            : surfaceState.active === 'sequence';
    }

    /** Edit `index` in the Sequence panel. */
    open(index) {
        inspectorState.select(index);
        if (layoutMode.isEmbed) {
            document.body.classList.add('sequence-open');
            this.update();
        } else {
            surfaceState.show('sequence');
        }
    }

    close() {
        document.body.classList.remove('sequence-open');
        this.update();
    }

    getProps() {
        return {
            index: inspectorState.index,
            headerSlot: this.headerSlot,
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
        if (!this.showing) {
            // Nothing to show: don't keep a stale editor in a hidden panel
            this.component.teardown();
            this.component.el.innerHTML = '';
            this.headerSlot.replaceChildren();
            return null;
        }
        return super.update();
    }

    bindComponentEvents() {
        this.component.onStep = (delta) => inspectorState.step(delta);
        this.closeEl?.addEventListener('click', () => this.close());
    }

    bindExternalEvents() {
        document.addEventListener(INSPECTOR_CHANGED, () => this.update());
        document.addEventListener(SURFACE_CHANGED, () => this.update());
        document.addEventListener(LAYOUT_MODE_CHANGED, () => {
            document.body.classList.remove('sequence-open');
            this.update();
        });
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
            if (e.key === 'Escape' && document.body.classList.contains('sequence-open')) this.close();
        });
    }
}
