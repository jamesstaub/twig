
import ModalComponent from './ModalComponent.js';
import { midiConfig } from '../../../config.js';
import {
    updateMidiInputChannel,
    updateMidiDrawbarCC,
    updatePulseNote,
    setPulseOutputEnabled
} from '../../../modules/midi/midiConfigActions.js';

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

        // --- MIDI Out: pulse outputs ---
        const outLabel = document.createElement('div');
        outLabel.textContent = 'Pulse Output:';
        outLabel.className = 'midi-section-label';
        dialog.appendChild(outLabel);

        // Global master switches for the two pulse paths
        const toggles = document.createElement('div');
        toggles.className = 'midi-pulse-toggles';
        const addToggle = (text, key, kind) => {
            const row = document.createElement('div');
            row.className = 'midi-pulse-toggle-row';
            const toggle = document.createElement('div');
            toggle.className = 'toggle-switch midi-pulse-toggle';
            toggle.setAttribute('role', 'switch');
            toggle.classList.toggle('active', Boolean(midiConfig[key]));
            toggle.setAttribute('aria-checked', String(Boolean(midiConfig[key])));
            toggle.setAttribute('aria-label', text);
            this.bindEvent(toggle, 'click', () => {
                const on = !toggle.classList.contains('active');
                toggle.classList.toggle('active', on);
                toggle.setAttribute('aria-checked', String(on));
                setPulseOutputEnabled(kind, on);
            });
            const label = document.createElement('span');
            label.textContent = text;
            row.append(toggle, label);
            toggles.appendChild(row);
        };
        addToggle('MIDI pulse out', 'pulseMidiEnabled', 'midi');
        addToggle('OSC pulse out', 'pulseOscEnabled', 'osc');
        dialog.appendChild(toggles);

        // Per-overtone pulse note numbers (linear 1..N by default)
        const notesLabel = document.createElement('div');
        notesLabel.textContent = 'Pulse Note Mapping:';
        notesLabel.className = 'midi-section-label';
        dialog.appendChild(notesLabel);

        const notesList = document.createElement('div');
        notesList.className = 'midi-cc-list';
        for (let i = 0; i < midiConfig.pulseNotes.length; i++) {
            const noteWrap = document.createElement('div');
            noteWrap.className = 'midi-cc-item';
            const label = document.createElement('label');
            label.textContent = `O${i + 1}`;
            const noteInput = document.createElement('input');
            noteInput.type = 'number';
            noteInput.min = 0;
            noteInput.max = 127;
            noteInput.value = midiConfig.pulseNotes[i];
            noteInput.className = 'midi-num-input';
            noteInput.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 0 && val <= 127) {
                    updatePulseNote(i, val);
                }
            });
            label.appendChild(noteInput);
            noteWrap.appendChild(label);
            notesList.appendChild(noteWrap);
        }
        dialog.appendChild(notesList);

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

