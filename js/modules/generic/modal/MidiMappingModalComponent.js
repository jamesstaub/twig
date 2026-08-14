
import ModalComponent from './ModalComponent.js';
import { midiConfig } from '../../../config.js';
import { midiOutputRouter } from '../../midi/midiOutputRouter.js';
import {
    updateMidiInputChannel,
    updateMidiOutputChannel,
    updateMidiInputNoteMin,
    updateMidiDrawbarCC,
    updatePulseNote,
    setPulseOutputEnabled,
    updateMidiOutputPort
} from '../../../modules/midi/midiConfigActions.js';

/**
 * MidiMappingModalComponent — MIDI routing and mapping settings, laid out
 * as Input / Output setting cards over mapping tables (drawbar CCs, pulse
 * notes), in the same sectioned style as the overtone settings modal.
 */
export default class MidiMappingModalComponent extends ModalComponent {

    /** Range-checked number input. */
    numInput(value, min, max, onChange) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.max = max;
        input.value = value;
        input.className = 'midi-num-input';
        input.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (val >= min && val <= max) onChange(val);
        });
        return input;
    }

    /** "label ........ [control]" row inside a section. */
    settingRow(text, control) {
        const row = document.createElement('label');
        row.className = 'midi-setting-row';
        const span = document.createElement('span');
        span.textContent = text;
        row.append(span, control);
        return row;
    }

    /** Raised card with an uppercase title, like the signal modal's sections. */
    section(title, wide = false) {
        const sec = document.createElement('section');
        sec.className = 'midi-section' + (wide ? ' midi-section-wide' : '');
        const heading = document.createElement('div');
        heading.className = 'midi-section-title';
        heading.textContent = title;
        sec.appendChild(heading);
        return sec;
    }

    /**
     * Two-row mapping table: labels across the top, an editable value per
     * column beneath. Scrolls horizontally rather than wrapping.
     */
    mappingTable(labels, values, onChange) {
        const scroll = document.createElement('div');
        scroll.className = 'midi-map-scroll';
        const table = document.createElement('table');
        table.className = 'midi-map-table';
        const head = table.createTHead().insertRow();
        const body = table.createTBody().insertRow();
        labels.forEach((label, i) => {
            const th = document.createElement('th');
            th.textContent = label;
            head.appendChild(th);
            body.insertCell().appendChild(
                this.numInput(values[i], 0, 127, (val) => onChange(i, val))
            );
        });
        scroll.appendChild(table);
        return scroll;
    }

    toggleRow(text, key, kind) {
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
        return this.settingRow(text, toggle);
    }

    outputPortSelect() {
        const select = document.createElement('select');
        select.className = 'control-select midi-port-select';
        const ports = midiOutputRouter.outputPorts();
        if (ports.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = midiOutputRouter.midi ? 'no output ports found' : 'MIDI unavailable';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
            select.disabled = true;
            return select;
        }
        for (const port of ports) {
            const opt = document.createElement('option');
            opt.value = port.id;
            opt.textContent = port.name;
            if (midiOutputRouter.output && port.id === midiOutputRouter.output.id) opt.selected = true;
            select.appendChild(opt);
        }
        // Via the actions layer so the choice syncs to the bridge and
        // persists across reloads
        select.addEventListener('change', () => updateMidiOutputPort(select.value));
        return select;
    }

    async render(props = {}) {
        this.teardown();
        this.el.innerHTML = '';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.tabIndex = -1;

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog midi-modal';

        const title = document.createElement('h2');
        title.textContent = 'MIDI Mapping';
        title.className = 'midi-modal-title';
        dialog.appendChild(title);

        // All sections share one flow container: on desktop the input/output
        // cards sit side by side with the mapping tables wrapping to full-
        // width rows beneath; the embed layout flows everything into a
        // single horizontal band instead.
        const cards = document.createElement('div');
        cards.className = 'midi-sections-row';

        const input = this.section('Input');
        input.append(
            this.settingRow('Channel', this.numInput(midiConfig.inputChannel, 1, 16, updateMidiInputChannel)),
            this.settingRow('Ignore notes below', this.numInput(midiConfig.inputNoteMin, 0, 127, updateMidiInputNoteMin)),
        );
        const inputHint = document.createElement('p');
        inputHint.className = 'midi-section-hint';
        inputHint.textContent = 'Notes below the floor are ignored so the pulse notes (1–12 by default) can’t loop back into the fundamental.';
        input.appendChild(inputHint);

        const output = this.section('Output');
        output.append(
            this.settingRow('Port', this.outputPortSelect()),
            this.settingRow('Channel', this.numInput(midiConfig.outputChannel, 1, 16, updateMidiOutputChannel)),
            this.toggleRow('MIDI pulse out', 'pulseMidiEnabled', 'midi'),
            this.toggleRow('OSC pulse out', 'pulseOscEnabled', 'osc'),
        );

        const ccSection = this.section('Drawbar CC Mapping', true);
        ccSection.appendChild(this.mappingTable(
            midiConfig.drawbarsCC.map((_, i) => `D${i + 1}`),
            midiConfig.drawbarsCC,
            updateMidiDrawbarCC,
        ));

        const notesSection = this.section('Pulse Note Mapping', true);
        notesSection.appendChild(this.mappingTable(
            midiConfig.pulseNotes.map((_, i) => `O${i + 1}`),
            midiConfig.pulseNotes,
            updatePulseNote,
        ));

        cards.append(input, output, ccSection, notesSection);
        dialog.appendChild(cards);

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
