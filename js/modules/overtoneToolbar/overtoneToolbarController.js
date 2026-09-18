import { BaseController } from '../base/BaseController.js';
import { OvertoneToolbarComponent } from './OvertoneToolbarComponent.js';
import { shapeMode } from '../shape/shapeMode.js';
import { linkLock } from '../generic/linkAll.js';
import { LINK_ALL_CHANGED, SHAPE_MODE_CHANGED } from '../../events.js';

/**
 * One overtone toolbar. The host supplies what Reset and Randomize mean
 * for its panel; link and shape are the app-wide modes (linkAll.js,
 * shapeMode.js) — mutually exclusive, and each button also lights while
 * the key it stands in for (cmd/ctrl, shift) is held, so the two are
 * visibly the same thing.
 */
export class OvertoneToolbarController extends BaseController {

    constructor(selector, { onReset, onRandomize } = {}) {
        super(selector);
        this.onReset = onReset;
        this.onRandomize = onRandomize;
    }

    createComponent(selector) {
        return new OvertoneToolbarComponent(selector);
    }

    /** Where the host panel mounts its own content (between the button groups). */
    get slotEl() {
        return this.component.slotEl;
    }

    getProps() {
        return {
            link: linkLock.on || linkLock.held,
            shape: shapeMode.on || shapeMode.held,
            panel: shapeMode.on,
        };
    }

    bindComponentEvents() {
        this.component.onReset = () => this.onReset?.();
        this.component.onRandomize = () => this.onRandomize?.();
        this.component.onToggleLink = () => {
            if (!linkLock.on) shapeMode.set(false);
            linkLock.toggle();
        };
        this.component.onToggleShape = () => {
            if (!shapeMode.on) linkLock.set(false);
            shapeMode.set(!shapeMode.on);
        };
    }

    bindExternalEvents() {
        document.addEventListener(LINK_ALL_CHANGED, () => this.update());
        document.addEventListener(SHAPE_MODE_CHANGED, () => this.update());
    }
}
