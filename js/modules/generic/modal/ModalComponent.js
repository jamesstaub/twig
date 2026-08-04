import BaseComponent from '../../base/BaseComponent.js';

/**
 * ModalComponent
 * Generic modal that covers the screen except for the fixed navbar.
 * Accepts custom content as child nodes.
 */
export default class ModalComponent extends BaseComponent {
    /**
     * @param {HTMLElement|string} target - The modal root element or selector.
     */
    constructor(target) {
        super(target);
        this.contentNode = null;
    }

    /**
     * Render the modal with custom content.
     * @param {Object} props
     * @param {Node|Node[]} props.content - Content nodes to display in the modal.
     * @param {Function} [props.onClose] - Optional close handler.
     */

    render(props = {}) {

        this.teardown();
        this.el.innerHTML = '';

        // Modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.tabIndex = -1;

        // Modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';

        // Close button (optional, can be hidden by subclass)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.setAttribute('aria-label', 'Close modal');
        closeBtn.innerHTML = '&times;';
        if (props.onClose) {
            this.bindEvent(closeBtn, 'click', () => {

                props.onClose();
            });
        }

        // Insert custom content
        if (props.content) {
            if (Array.isArray(props.content)) {
                props.content.forEach(node => dialog.appendChild(node));
            } else {
                dialog.appendChild(props.content);
            }
        }

        dialog.appendChild(closeBtn);
        overlay.appendChild(dialog);
        this.el.appendChild(overlay);

        // Dismiss on overlay click (optional)
        if (props.onClose) {
            this.bindEvent(overlay, 'mousedown', e => {
                if (e.target === overlay) {

                    props.onClose();
                }
            });
        }
    }

    teardown() {

        super.teardown();
        this.el.innerHTML = '';
    }
}
