import BaseComponent from '../base/BaseComponent.js';
import { midiConfig, MIDI_RANGE_SPAN } from '../../appConfig.js';
import { midiInputRouter } from '../midi/midiInputRouter.js';
import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import {
    MIDI_SETTING_RANGES,
    updateMidiSetting,
    setPulseOutputEnabled,
    updateMidiOutputPort,
    updateMidiClockOutputPort,
    updateMidiInputPort,
} from '../midi/midiConfigActions.js';

/**
 * MIDI routing and mapping settings. One card holds the two ports (one
 * in, one out); then one card per concern, each with its own channel:
 * fundamental note in, ADSR trigger note in, CC in, pulse note out — and
 * the clock/transport card with its own port (system-realtime, no
 * channel). Per-overtone mappings are a START value covering the next 12
 * numbers, read out beside the input. Renders in place on the Settings
 * surface; every change goes through midiConfigActions.
 */
export class MidiSettingsComponent extends BaseComponent {

    /** Number input bound to one midiConfig key (MIDI_SETTING_RANGES). */
    settingInput(key, onChange = null) {
        const [min, max] = MIDI_SETTING_RANGES[key];
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.max = max;
        input.value = midiConfig[key];
        input.className = 'midi-num-input';
        input.addEventListener('change', () => {
            const val = parseInt(input.value, 10);
            if (Number.isFinite(val)) updateMidiSetting(key, val);
            // Show what was stored — the action clamps
            input.value = midiConfig[key];
            onChange?.();
        });
        return input;
    }

    /**
     * Start-of-range input with its span read out beside it
     * ("13 – 24"): the 12 numbers the overtones take from there.
     */
    rangeInput(key) {
        const wrap = document.createElement('div');
        wrap.className = 'midi-range-input';
        const span = document.createElement('output');
        span.className = 'midi-range-span';
        const sync = () => {
            span.textContent = `– ${midiConfig[key] + MIDI_RANGE_SPAN - 1}`;
        };
        sync();
        wrap.append(this.settingInput(key, sync), span);
        return wrap;
    }

    hint(text) {
        const p = document.createElement('p');
        p.className = 'settings-hint';
        p.textContent = text;
        return p;
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
    section(title) {
        const sec = document.createElement('section');
        sec.className = 'settings-section';
        const heading = document.createElement('div');
        heading.className = 'settings-section-title';
        heading.textContent = title;
        sec.appendChild(heading);
        return sec;
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

        // All sections share one flow container: cards side by side,
        // wrapping; the embed band flows them into one horizontal row.
        const cards = document.createElement('div');
        cards.className = 'settings-sections';

        const midiUp = Boolean(midiOutputRouter.midi || midiInputRouter.midi);

        const ports = this.section('MIDI Ports');
        ports.append(
            this.settingRow('In', this.portSelect(
                midiInputRouter.inputPorts(),
                midiConfig.inputId,
                updateMidiInputPort,
                { noneLabel: 'All inputs', unavailable: !midiUp },
            )),
            this.settingRow('Out', this.portSelect(
                midiOutputRouter.outputPorts(),
                midiOutputRouter.output?.id ?? null,
                updateMidiOutputPort,
                { unavailable: !midiUp },
            )),
            this.hint('Every note and CC input shares the one port in; pulse notes leave on the port out. Each section below has its own channel.'),
        );

        const fundamental = this.section('Fundamental Note In');
        fundamental.append(
            this.settingRow('Channel', this.settingInput('fundamentalChannel')),
            this.settingRow('Transpose octave', this.settingInput('fundamentalTranspose')),
            this.hint('Any note on this channel sets the fundamental.'),
        );

        const trigger = this.section('ADSR Trigger Note In');
        trigger.append(
            this.settingRow('Channel', this.settingInput('triggerChannel')),
            this.settingRow('First note', this.rangeInput('triggerNoteStart')),
            this.hint('Twelve notes from the first gate overtones 1–12 in Trigger mode: note on attacks, note off releases. On a channel shared with the fundamental, these notes only trigger.'),
        );

        const cc = this.section('CC In');
        cc.append(
            this.settingRow('Channel', this.settingInput('ccChannel')),
            this.settingRow('Gain', this.rangeInput('gainCCStart')),
            this.settingRow('Filter cutoff', this.rangeInput('cutoffCCStart')),
            this.settingRow('Conv wet/dry', this.rangeInput('convWetCCStart')),
            this.settingRow('Preset crossfader', this.settingInput('crossfaderCC')),
            this.hint('Set each parameter’s first CC: it takes the twelve from there, one per overtone. CC 7 is the master gain; the crossfader CC sweeps presets A → B.'),
        );

        const pulse = this.section('Note Out: Overtone LF Pulse');
        pulse.append(
            this.settingRow('Channel', this.settingInput('pulseChannel')),
            this.settingRow('First note', this.rangeInput('pulseNoteStart')),
            this.toggleRow('MIDI pulse out', 'pulseMidiEnabled', 'midi'),
            this.toggleRow('OSC pulse out', 'pulseOscEnabled', 'osc'),
            this.hint('Overtones 1–12 send twelve notes from the first. Keep them clear of the trigger notes when in and out share a port.'),
        );

        const clock = this.section('Clock / Transport Out');
        clock.append(
            this.settingRow('Port', this.portSelect(
                midiOutputRouter.outputPorts(),
                midiConfig.clockOutputId,
                updateMidiClockOutputPort,
                { noneLabel: 'Same as MIDI out', unavailable: !midiUp },
            )),
            this.hint('Carries the overtone clock (24 ticks per cycle of the assigned voice) and transport start/stop on play. Clock messages are system-realtime — the MIDI spec gives them no channel.'),
        );

        cards.append(ports, fundamental, trigger, cc, pulse, clock);
        this.el.appendChild(cards);
    }
}
