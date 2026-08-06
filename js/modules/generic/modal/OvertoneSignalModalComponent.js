import ModalComponent from './ModalComponent.js';
import { AppState } from '../../../config.js';
import { calculateFrequency, formatHz } from '../../../utils.js';
import { harmonicFilterCutoff, MAX_FILTER_PARTIALS } from '../../../audio.js';
import { OvertoneSignalActions, Q_MAX, DRIVE_MAX } from '../../overtoneSignal/overtoneSignalActions.js';
import { Dial } from '../dial/Dial.js';
import { MidiOutputRouter, midiOutputRouter } from '../../midi/midiOutputRouter.js';
import { oscClient } from '../../osc/oscClient.js';
import { showStatus } from '../../../domUtils.js';
import { drawSequencePreview } from '../../overtoneSignal/sequencePreview.js';

const PULSE_MAX_HZ = 50; // mirrors the cap in gate-processor.js

const GATE_MODE_OPTIONS = [
    { value: 0, label: 'Off' },
    { value: 1, label: 'Alternating' },
    { value: 2, label: 'Euclidean' },
    { value: 3, label: 'Probability' },
    { value: 4, label: 'Sequence' },
];

// Number-box configs per gate mode: [key, label, min, max]
const GATE_PARAM_FIELDS = {
    1: [['x', 'cycles on', 0, 1024], ['y', 'cycles off', 0, 1024]],
    2: [['x', 'pulses', 0, 1024], ['y', 'steps', 1, 1024]],
    3: [['x', 'probability %', 0, 100]],
};

/**
 * Per-overtone signal chain editor: cycle gate, lowpass filter, pan.
 * Opened from the drawbar context menu ("Overtone signal").
 */
export default class OvertoneSignalModalComponent extends ModalComponent {

    render(props = {}) {
        this.index = props.index ?? this.index ?? 0;
        super.render({ content: this.buildContent(this.index), onClose: props.onClose });
    }

    buildContent(index) {
        const root = document.createElement('div');
        root.className = 'signal-modal';

        const ratio = AppState.currentSystem.ratios[index];
        const label = AppState.currentSystem.labels[index] || `#${index + 1}`;
        const freq = calculateFrequency(ratio);

        const title = document.createElement('h2');
        title.className = 'signal-modal-title';
        title.textContent = `Overtone ${index + 1} — ${label} — ${freq.toFixed(freq >= 100 ? 2 : 3)} Hz`;

        const header = document.createElement('div');
        header.className = 'signal-modal-header';
        header.append(title, this.buildCopyRow(index));
        root.appendChild(header);

        // Filter and pan are dial-sized now — stack them in one column so
        // the sequence and pulse sections get the width instead
        const side = document.createElement('div');
        side.className = 'signal-side-col';
        side.append(this.buildFilterSection(index), this.buildPanSection(index));

        const sections = document.createElement('div');
        sections.className = 'signal-modal-sections';
        sections.append(this.buildGateSection(index), side, this.buildPulseSection(index));
        root.appendChild(sections);

        return root;
    }

    // ---------------------------------------------------------------
    // Pulse outputs (MIDI / OSC / clock)
    // ---------------------------------------------------------------

    buildPulseSection(index) {
        const el = this.section('Pulse Out');

        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const rows = document.createElement('div');
        rows.className = 'signal-pulse-rows';
        el.sectionBody.appendChild(rows);

        // One MIDI note-on/off blip per audible cycle
        const note = MidiOutputRouter.noteForVoice(index);
        const midiAvailable = midiOutputRouter.available;
        rows.appendChild(this.pulseRow({
            text: 'MIDI out',
            detail: `note ${note} · ch 1${midiAvailable ? '' : ' · no output available'}`,
            enabled: midiAvailable,
            value: OvertoneSignalActions.getPulseOut(index).midi,
            onToggle: (on) => OvertoneSignalActions.setPulseOut(index, { midi: on }),
        }));

        // One /twig/pulse message per audible cycle, into the Max patch
        const oscAvailable = oscClient.isConnected();
        rows.appendChild(this.pulseRow({
            text: 'OSC out',
            detail: oscAvailable ? `pulse ${index + 1} <cycle> <gate>` : 'bridge offline',
            enabled: oscAvailable,
            value: OvertoneSignalActions.getPulseOut(index).osc,
            onToggle: (on) => OvertoneSignalActions.setPulseOut(index, { osc: on }),
        }));

        // Exclusive: one voice may drive the MIDI clock (24 ticks/cycle)
        const clockDetail = () => {
            const c = AppState.midiClockVoice;
            if (c === index) return '24 ppq · this voice is the clock';
            if (c !== null) return `currently overtone ${c + 1}`;
            return '24 ticks per cycle';
        };
        const clockRow = this.pulseRow({
            text: 'MIDI clock source',
            detail: clockDetail(),
            enabled: midiOutputRouter.available,
            value: AppState.midiClockVoice === index,
            onToggle: (on) => {
                OvertoneSignalActions.setMidiClockVoice(on ? index : null);
                if (!on) midiOutputRouter.stopClock();
                clockRow.querySelector('.signal-pulse-detail').textContent = clockDetail();
            },
        });
        rows.appendChild(clockRow);

        if (voiceFreq > PULSE_MAX_HZ) {
            const warn = document.createElement('div');
            warn.className = 'signal-pulse-warning';
            warn.textContent = `pulses pause above ${PULSE_MAX_HZ} Hz — this voice is at ${Math.round(voiceFreq)} Hz`;
            el.sectionBody.appendChild(warn);
        }

        return el;
    }

    /** Row: [toggle] label — detail. Returns the row element. */
    pulseRow({ text, detail, enabled, value, onToggle }) {
        const row = document.createElement('div');
        row.className = 'signal-pulse-row';
        if (!enabled) row.classList.add('signal-pulse-row-disabled');

        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch signal-pulse-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.classList.toggle('active', Boolean(value));
        toggle.setAttribute('aria-checked', String(Boolean(value)));
        toggle.setAttribute('aria-label', text);
        if (enabled) {
            toggle.addEventListener('click', () => {
                const on = !toggle.classList.contains('active');
                toggle.classList.toggle('active', on);
                toggle.setAttribute('aria-checked', String(on));
                onToggle(on);
            });
        }

        const label = document.createElement('span');
        label.className = 'signal-pulse-label';
        label.textContent = text;

        const detailEl = document.createElement('span');
        detailEl.className = 'signal-pulse-detail';
        detailEl.textContent = detail;

        row.append(toggle, label, detailEl);
        return row;
    }

    /**
     * "Copy settings to" — apply this overtone's gate, filter, and pan to
     * another overtone (or all of them). Selecting an entry copies
     * immediately and resets the menu to its placeholder.
     */
    buildCopyRow(index) {
        const row = document.createElement('div');
        row.className = 'signal-copy-row';

        const label = document.createElement('span');
        label.className = 'signal-copy-label';
        label.textContent = 'Copy settings to';

        const select = document.createElement('select');
        select.className = 'control-select signal-copy-select';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'choose…';
        placeholder.selected = true;
        placeholder.disabled = true;
        select.appendChild(placeholder);

        const all = document.createElement('option');
        all.value = 'all';
        all.textContent = 'All';
        select.appendChild(all);

        const count = AppState.currentSystem.ratios.length;
        for (let i = 0; i < count; i++) {
            if (i === index) continue;
            const o = document.createElement('option');
            o.value = i;
            o.textContent = `Overtone ${i + 1} (${AppState.currentSystem.labels[i] || '—'})`;
            select.appendChild(o);
        }

        select.addEventListener('change', () => {
            const targets = select.value === 'all'
                ? Array.from({ length: count }, (_, i) => i).filter((i) => i !== index)
                : [parseInt(select.value, 10)];
            this.copySettingsTo(index, targets);
            select.value = ''; // back to placeholder — it's an action, not state
            showStatus(
                targets.length === 1
                    ? `Copied overtone ${index + 1} settings to overtone ${targets[0] + 1}`
                    : `Copied overtone ${index + 1} settings to all overtones`,
                'success'
            );
        });

        row.append(label, select);
        return row;
    }

    copySettingsTo(sourceIndex, targets) {
        const gate = OvertoneSignalActions.getGate(sourceIndex);
        const filter = OvertoneSignalActions.getFilter(sourceIndex);
        const drive = OvertoneSignalActions.getDrive(sourceIndex);
        const pan = OvertoneSignalActions.getPan(sourceIndex);
        for (const t of targets) {
            OvertoneSignalActions.setGate(t, { ...gate, seq: [...(gate.seq || [])] });
            OvertoneSignalActions.setFilter(t, { ...filter });
            OvertoneSignalActions.setDrive(t, drive);
            OvertoneSignalActions.setPan(t, pan);
        }
    }

    /**
     * Titled card. Content goes into `.sectionBody` — a column on desktop,
     * flowed into a row by the embed layout (170px leaves no vertical room).
     */
    section(titleText) {
        const el = document.createElement('section');
        el.className = 'signal-section';
        const h = document.createElement('h3');
        h.className = 'signal-section-title';
        h.textContent = titleText;
        const body = document.createElement('div');
        body.className = 'signal-section-body';
        el.append(h, body);
        el.sectionBody = body;
        return el;
    }

    // ---------------------------------------------------------------
    // Gate
    // ---------------------------------------------------------------

    buildGateSection(index) {
        const el = this.section('Sequence');
        const gate = OvertoneSignalActions.getGate(index);
        const apply = () => {
            OvertoneSignalActions.setGate(index, { ...gate });
            this._redrawSeqPreview?.();
        };

        const select = document.createElement('select');
        select.className = 'control-select';
        for (const opt of GATE_MODE_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === gate.mode) o.selected = true;
            select.appendChild(o);
        }

        const params = document.createElement('div');
        params.className = 'signal-gate-params';

        // Mode select + its params as one flow unit, so the embed row
        // layout keeps them together
        const modeGroup = document.createElement('div');
        modeGroup.className = 'signal-gate-mode';
        modeGroup.append(select, params);
        el.sectionBody.appendChild(modeGroup);

        const renderParams = () => {
            params.innerHTML = '';
            if (gate.mode === 4) {
                // Sequence: free 0/1 pattern
                const lab = document.createElement('label');
                lab.className = 'signal-field';
                lab.textContent = '0/1 pattern';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'signal-seq-input';
                input.placeholder = 'e.g. 10110';
                input.value = (gate.seq || []).join('');
                input.addEventListener('input', () => {
                    const clean = input.value.replace(/[^01]/g, '');
                    if (clean !== input.value) input.value = clean;
                    gate.seq = clean.split('').map(Number);
                    apply();
                });
                lab.appendChild(input);
                params.appendChild(lab);
            } else {
                for (const [key, labelText, min, max] of GATE_PARAM_FIELDS[gate.mode] || []) {
                    const lab = document.createElement('label');
                    lab.className = 'signal-field';
                    lab.textContent = labelText;
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = min;
                    input.max = max;
                    input.step = 1;
                    input.value = gate[key] ?? 1;
                    input.addEventListener('change', () => {
                        const v = Math.min(max, Math.max(min, Math.round(Number(input.value)) || 0));
                        input.value = v;
                        gate[key] = v;
                        apply();
                    });
                    lab.appendChild(input);
                    params.appendChild(lab);
                }
            }
        };

        select.addEventListener('change', () => {
            gate.mode = parseInt(select.value, 10);
            renderParams();
            apply();
        });
        renderParams();

        el.sectionBody.append(this.buildShapeControls(index), this.buildTargetControls(index));

        return el;
    }

    /** Cycle contour: waveform selector (same options as the oscillator menu) + preview. */
    buildShapeControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'signal-shape';

        const seq = OvertoneSignalActions.getSequencer(index);

        const select = document.createElement('select');
        select.className = 'control-select';
        const source = document.getElementById('waveform-select');
        const options = source ? Array.from(source.options) : [];
        for (const opt of options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.textContent;
            if (opt.value === seq.shape) o.selected = true;
            select.appendChild(o);
        }
        wrap.appendChild(select);

        const canvas = document.createElement('canvas');
        canvas.className = 'signal-shape-preview';
        canvas.width = 220;
        canvas.height = 44;
        wrap.appendChild(canvas);

        // Redraw is shared: gate mode/param edits re-trigger it too
        const draw = () => drawSequencePreview(canvas, index);
        this._redrawSeqPreview = draw;

        select.addEventListener('change', () => {
            OvertoneSignalActions.setSequencerShape(index, select.value);
            draw();
        });

        // Sequence length: stretch the shape over N cycles (powers of two).
        // Lets a complex custom waveform modulate slowly instead of wobbling
        // once per cycle.
        const lenRow = document.createElement('div');
        lenRow.className = 'signal-stretch-row';
        const lenLabel = document.createElement('span');
        lenLabel.className = 'signal-stretch-label';
        const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
        lenLabel.textContent = fmt(OvertoneSignalActions.getSequencer(index).stretch);
        const mkBtn = (text, factor) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'action-btn signal-stretch-btn';
            b.textContent = text;
            b.addEventListener('click', () => {
                const current = OvertoneSignalActions.getSequencer(index).stretch;
                OvertoneSignalActions.setSequencerStretch(index, current * factor);
                lenLabel.textContent = fmt(OvertoneSignalActions.getSequencer(index).stretch);
                draw();
            });
            return b;
        };
        lenRow.append(mkBtn('÷2', 0.5), lenLabel, mkBtn('×2', 2));
        wrap.appendChild(lenRow);

        draw();
        return wrap;
    }

    /** Modulation targets: amount sliders for gain / filter freq / resonance. */
    buildTargetControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'signal-targets';

        const heading = document.createElement('div');
        heading.className = 'signal-targets-heading';
        heading.textContent = 'Target';
        wrap.appendChild(heading);

        const seq = OvertoneSignalActions.getSequencer(index);
        const addAmount = (target, labelText, min, max) => {
            const row = document.createElement('label');
            row.className = 'signal-target-row';
            const label = document.createElement('span');
            label.className = 'signal-target-label';
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'range';
            input.min = min;
            input.max = max;
            input.step = 0.01;
            input.value = seq.amounts[target];
            input.className = 'signal-target-slider';
            const value = document.createElement('span');
            value.className = 'signal-target-value';
            value.textContent = (+seq.amounts[target]).toFixed(2);
            input.addEventListener('input', () => {
                const v = parseFloat(input.value);
                OvertoneSignalActions.setSequencerAmount(index, target, v);
                value.textContent = v.toFixed(2);
            });
            row.append(label, input, value);
            wrap.appendChild(row);
        };

        addAmount('gain', 'gain', 0, 1);
        addAmount('freq', 'filter freq', -1, 1);
        addAmount('res', 'resonance', 0, 1);

        return wrap;
    }

    // ---------------------------------------------------------------
    // Filter (drawbar-style vertical sliders)
    // ---------------------------------------------------------------

    buildFilterSection(index) {
        const el = this.section('Filter');
        const filter = OvertoneSignalActions.getFilter(index);
        const apply = () => OvertoneSignalActions.setFilter(index, { ...filter });

        // The cutoff dial is itself an overtone-series selector: it picks
        // a partial (of the current system) of this voice's audible base.
        // 0 = filter open. Positions past the system's own table extend the
        // series and are marked +1, +2, …
        const sysLabels = AppState.currentSystem.labels;
        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const partialLabel = (n) =>
            (n <= sysLabels.length ? sysLabels[n - 1] : `+${n - sysLabels.length}`);
        const cutoffText = () => (filter.multiplier > 0
            ? `${partialLabel(Math.round(filter.multiplier))}\n${formatHz(harmonicFilterCutoff(index, voiceFreq))}`
            : 'open');

        const row = document.createElement('div');
        row.className = 'signal-dial-row';
        row.append(
            this.dialColumn({
                label: 'cutoff',
                dial: { min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: filter.multiplier || 0 },
                text: cutoffText,
                onChange: (v) => { filter.multiplier = Math.round(v); apply(); },
            }),
            this.dialColumn({
                label: 'resonance', color: '--accent-negative',
                dial: { min: 0.1, max: Q_MAX, step: 0.05, value: filter.q },
                text: () => `Q ${(+filter.q).toFixed(2)}`,
                onChange: (v) => { filter.q = v; apply(); },
            }),
            this.dialColumn({
                label: 'drive', color: '--accent-positive',
                dial: { min: 0, max: DRIVE_MAX, step: 0.05, value: OvertoneSignalActions.getDrive(index) },
                text: () => {
                    const v = OvertoneSignalActions.getDrive(index);
                    return v > 0 ? `${Math.round(v * 100)}%` : 'clean';
                },
                onChange: (v) => OvertoneSignalActions.setDrive(index, v),
            })
        );
        el.sectionBody.appendChild(row);
        return el;
    }

    /**
     * The same mini dial as the drawbar panel, with its name and a live
     * value readout beneath.
     */
    dialColumn({ label, color, dial, text, onChange }) {
        const col = document.createElement('div');
        col.className = 'signal-dial-col';

        const valueEl = document.createElement('span');
        valueEl.className = 'signal-vslider-value';
        valueEl.textContent = text();

        const d = new Dial({
            ...dial,
            size: 32,
            label,
            ...(color ? { color } : {}),
            format: () => text().replace('\n', ' · '),
            onChange: (v) => {
                onChange(v);
                valueEl.textContent = text();
            },
        });

        const name = document.createElement('span');
        name.className = 'signal-dial-name';
        name.textContent = label;

        col.append(d.el, name, valueEl);
        return col;
    }

    // ---------------------------------------------------------------
    // Pan
    // ---------------------------------------------------------------

    buildPanSection(index) {
        const el = this.section('Pan');
        const format = (v) => (Math.abs(v) < 0.005 ? 'C' : (v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`));

        const row = document.createElement('div');
        row.className = 'signal-dial-row';
        let value = OvertoneSignalActions.getPan(index);
        row.appendChild(this.dialColumn({
            label: 'pan',
            dial: { min: -1, max: 1, step: 0.01, value },
            text: () => format(value),
            onChange: (v) => {
                value = v;
                OvertoneSignalActions.setPan(index, v);
            },
        }));
        el.sectionBody.appendChild(row);
        return el;
    }
}
