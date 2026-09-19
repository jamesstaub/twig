import BaseComponent from '../base/BaseComponent.js';
import { midiConfig } from '../../appConfig.js';
import { midiInputRouter } from '../midi/midiInputRouter.js';
import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import {
    updateMidiInputChannel,
    updateMidiOutputChannel,
    updateMidiInputNoteMin,
    updateMidiDrawbarCC,
    updatePulseNote,
    setPulseOutputEnabled,
    updateMidiOutputPort,
    updateMidiClockOutputPort,
    updateMidiInputPort,
} from '../midi/midiConfigActions.js';

/**
 * MIDI routing and mapping settings — one card per role (note/CC in,
 * note out, clock/transport out), each with its own port (and channel
 * where the MIDI spec has one), over the mapping tables (drawbar CCs,
 * pulse notes). Renders in place on the Settings surface; every change
 * goes through midiConfigActions.
 */
export class MidiSettingsComponent extends BaseComponent {

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
        row.className = 'settings-row';
        const span = document.createElement('span');
        span.textContent = text;
        row.append(span, control);
        return row;
    }

    /** Raised card with an uppercase title. */
    section(title, wide = false) {
        const sec = document.createElement('section');
        sec.className = 'settings-section' + (wide ? ' settings-section-wide' : '');
        const heading = document.createElement('div');
        heading.className = 'settings-section-title';
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

    /**
     * Port selector over a {id, name} port list. `selectedId` marks the
     * current choice; `noneLabel` (optional) adds a first option with value
     * '' for the role's default routing ("All inputs", "Same as note out").
     */
    portSelect(ports, selectedId, onChange, { noneLabel = null, unavailable = false } = {}) {
        const select = document.createElement('select');
        select.className = 'control-select midi-port-select';
        if (ports.length === 0 && !noneLabel) {
            const opt = document.createElement('option');
            opt.textContent = unavailable ? 'MIDI unavailable' : 'no ports found';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
            select.disabled = true;
            return select;
        }
        if (noneLabel) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = noneLabel;
            opt.selected = selectedId == null || !ports.some((p) => p.id === selectedId);
            select.appendChild(opt);
        }
        for (const port of ports) {
            const opt = document.createElement('option');
            opt.value = port.id;
            opt.textContent = port.name;
            if (port.id === selectedId) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }

    render() {
        this.teardown();
        this.el.innerHTML = '';

        // All sections share one flow container: the role cards side by
        // side with the mapping tables wrapping to full-width rows beneath;
        // the embed band flows everything into one horizontal row instead.
        const cards = document.createElement('div');
        cards.className = 'settings-sections';

        const midiUp = Boolean(midiOutputRouter.midi || midiInputRouter.midi);

        const input = this.section('Note / CC In');
        input.append(
            this.settingRow('Port', this.portSelect(
                midiInputRouter.inputPorts(),
                midiConfig.inputId,
                updateMidiInputPort,
                { noneLabel: 'All inputs', unavailable: !midiUp },
            )),
            this.settingRow('Channel', this.numInput(midiConfig.inputChannel, 1, 16, updateMidiInputChannel)),
            this.settingRow('Ignore notes below', this.numInput(midiConfig.inputNoteMin, 0, 127, updateMidiInputNoteMin)),
        );
        const inputHint = document.createElement('p');
        inputHint.className = 'settings-hint';
        inputHint.textContent = 'Notes below the floor are ignored so the pulse notes (1–12 by default) can’t loop back into the fundamental.';
        input.appendChild(inputHint);

        const output = this.section('Note Out');
        output.append(
            this.settingRow('Port', this.portSelect(
                midiOutputRouter.outputPorts(),
                midiOutputRouter.output?.id ?? null,
                updateMidiOutputPort,
                { unavailable: !midiUp },
            )),
            this.settingRow('Channel', this.numInput(midiConfig.outputChannel, 1, 16, updateMidiOutputChannel)),
            this.toggleRow('MIDI pulse out', 'pulseMidiEnabled', 'midi'),
            this.toggleRow('OSC pulse out', 'pulseOscEnabled', 'osc'),
        );

        const clock = this.section('Clock / Transport Out');
        clock.append(
            this.settingRow('Port', this.portSelect(
                midiOutputRouter.outputPorts(),
                midiConfig.clockOutputId,
                updateMidiClockOutputPort,
                { noneLabel: 'Same as note out', unavailable: !midiUp },
            )),
        );
        const clockHint = document.createElement('p');
        clockHint.className = 'settings-hint';
        clockHint.textContent = 'Carries the overtone clock (24 ticks per cycle of the assigned voice) and transport start/stop on play. Clock messages are system-realtime — the MIDI spec gives them no channel.';
        clock.appendChild(clockHint);

        const ccSection = this.section('CC In: Drawbar Control', true);
        ccSection.appendChild(this.mappingTable(
            midiConfig.drawbarsCC.map((_, i) => `D${i + 1}`),
            midiConfig.drawbarsCC,
            updateMidiDrawbarCC,
        ));

        const notesSection = this.section('Note Out: Overtone LF Pulse', true);
        notesSection.appendChild(this.mappingTable(
            midiConfig.pulseNotes.map((_, i) => `O${i + 1}`),
            midiConfig.pulseNotes,
            updatePulseNote,
        ));

        cards.append(input, output, clock, ccSection, notesSection);
        this.el.appendChild(cards);
    }
}
