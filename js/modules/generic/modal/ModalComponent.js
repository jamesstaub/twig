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

// Modal styles (can be moved to CSS file)
const style = document.createElement('style');
style.textContent = `
#modal-root { z-index: 2000; }
.modal-overlay {
  position: fixed;
  top: 6rem; /* height of navbar */
  left: 0;
  width: 100vw;
  height: calc(100vh - 6rem);
  background: rgba(15,23,42,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
@media (max-width: 768px) {
  .modal-overlay { top: 8rem; height: calc(100vh - 8rem); }
}
.modal-dialog {
  background: #232b3a;
  border-radius: 1rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  padding: 2rem 1.5rem 1.5rem 1.5rem;
  max-width: 95vw;
  min-width: 280px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.modal-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: #cbd5e1;
  font-size: 2rem;
  cursor: pointer;
  z-index: 10;
  line-height: 1;
}
`;
document.head.appendChild(style);
