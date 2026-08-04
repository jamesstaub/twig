
import ModalComponent from './ModalComponent.js';
import { midiConfig } from '../../../config.js';
import { updateMidiInputChannel, updateMidiDrawbarCC } from '../../../modules/midi/midiConfigActions.js';

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
        title.className = 'midi-modal-title';
        dialog.appendChild(title);

        // MIDI Channel input
        const channelLabel = document.createElement('label');
        channelLabel.textContent = 'MIDI Channel: ';
        const channelInput = document.createElement('input');
        channelInput.type = 'number';
        channelInput.min = 1;
        channelInput.max = 16;
        channelInput.value = midiConfig.inputChannel;
        channelInput.className = 'midi-num-input';
        channelInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value, 10);
            if (val >= 1 && val <= 16) {
                updateMidiInputChannel(val);
            }
        });
        channelLabel.appendChild(channelInput);
        dialog.appendChild(channelLabel);
        dialog.appendChild(document.createElement('br'));

        // Drawbars CC inputs
        const drawbarsLabel = document.createElement('div');
        drawbarsLabel.textContent = 'Drawbars CC Mapping:';
        drawbarsLabel.className = 'midi-section-label';
        dialog.appendChild(drawbarsLabel);

        const drawbarsList = document.createElement('div');
        drawbarsList.className = 'midi-cc-list';
        for (let i = 0; i < midiConfig.drawbarsCC.length; i++) {
            const ccWrap = document.createElement('div');
            ccWrap.className = 'midi-cc-item';
            const label = document.createElement('label');
            label.textContent = `D${i + 1}`;
            const ccInput = document.createElement('input');
            ccInput.type = 'number';
            ccInput.min = 0;
            ccInput.max = 127;
            ccInput.value = midiConfig.drawbarsCC[i];
            ccInput.className = 'midi-num-input';
            ccInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value, 10);
                if (val >= 0 && val <= 127) {
                    updateMidiDrawbarCC(i, val);
                }
            });
            label.appendChild(ccInput);
            ccWrap.appendChild(label);
            drawbarsList.appendChild(ccWrap);
        }
        dialog.appendChild(drawbarsList);

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

