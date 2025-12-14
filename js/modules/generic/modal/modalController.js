// modalController.js
// Generic ModalController using BaseController and ModalComponent

import { BaseController } from '../../base/BaseController.js';
import ModalComponent from './ModalComponent.js';

export class ModalController extends BaseController {
    /**
     * @param {string|HTMLElement} selector - The modal root element or selector (should be #modal-root)
     * @param {Object} [options] - Optional config
     */
    constructor(selector = '#modal-root', options = {}) {
        super(selector);
        this.options = options;
    }

    createComponent(selector) {
        return new ModalComponent(selector);
    }

    /**
     * getProps should be overridden by subclasses to provide content and handlers
     */
    getProps() {
        return {
            content: this.options.content || null,
            onClose: this.options.onClose || null
        };
    }

    /**
     * Optionally update modal content dynamically
     * @param {Object} props
     */
    updateWithProps(props) {
        if (this.component.teardown) this.component.teardown();
        this.component.render(props);
    }
}
