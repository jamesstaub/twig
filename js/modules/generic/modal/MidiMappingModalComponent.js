import ModalComponent from './ModalComponent.js';

/**
 * MidiMappingModalComponent
 * A modal for mapping MIDI channels, notes, and CCs to parameters.
 * Uses placeholder inputs for now.
 */
export default class MidiMappingModalComponent extends ModalComponent {
    async render(props = {}) {
        this.teardown();
        this.el.innerHTML = '';

        // Modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.tabIndex = -1;

        // Modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';

        // Title
        const title = document.createElement('h2');
        title.textContent = 'MIDI Mapping';
        title.style.marginBottom = '1rem';
        dialog.appendChild(title);

        // Placeholder form
        const form = document.createElement('form');
        form.className = 'midi-mapping-form';
        form.innerHTML = `
          <label>MIDI Channel: <input type="number" min="1" max="16" placeholder="1" /></label><br/>
          <label>Note Number: <input type="number" min="0" max="127" placeholder="60 (C4)" /></label><br/>
          <label>CC Number: <input type="number" min="0" max="127" placeholder="1 (Mod Wheel)" /></label><br/>
          <label>Parameter: <input type="text" placeholder="e.g. Filter Cutoff" /></label><br/>
          <button type="submit" class="action-btn mt-2">Save Mapping</button>
        `;
        dialog.appendChild(form);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.setAttribute('aria-label', 'Close modal');
        closeBtn.innerHTML = '&times;';
        dialog.appendChild(closeBtn);

        overlay.appendChild(dialog);
        this.el.appendChild(overlay);

        let closeModalFn = props.onClose;
        if (!closeModalFn) {
            try {
                closeModalFn = (await import('./modalActions.js')).closeModal;
            } catch { }
        }

        if (closeModalFn) {
            this.bindEvent(overlay, 'mousedown', e => {
                if (e.target === overlay) {
                    closeModalFn();
                }
            });
            this.bindEvent(closeBtn, 'click', e => {
                e.preventDefault();
                closeModalFn();
            });
            this._escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeModalFn();
                }
            };
            document.addEventListener('keydown', this._escHandler);
        }
    }

    teardown() {
        super.teardown();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this.el.innerHTML = '';
    }
}

