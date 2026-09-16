import BaseComponent from '../base/BaseComponent.js';
import { AppState } from '../../config.js';
import { calculateFrequency, formatHz } from '../../utils.js';
import { harmonicFilterCutoff, MAX_FILTER_PARTIALS } from '../../audio.js';
import { OvertoneSignalActions, Q_MAX, DRIVE_MAX, ENV_TIME_MAX } from '../overtoneSignal/overtoneSignalActions.js';
import { Dial } from '../generic/dial/Dial.js';
import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import { noteForVoice } from '../midi/pulseMidi.js';
import { oscClient } from '../osc/oscClient.js';
import { drawSequencePreview } from '../overtoneSignal/sequencePreview.js';
import { voiceTargets } from '../generic/linkAll.js';

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

const ICON_PREV = '‹';
const ICON_NEXT = '›';
const ICON_EXPAND = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11.5 3.5h5v5M16.5 3.5 10 10M8.5 16.5h-5v-5M3.5 16.5 10 10"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5 5 15"/></svg>';

/**
 * Inspector — the full editor for one overtone's signal chain: cycle
 * gate + modulation, filter & drive, pan, envelope, pulse outputs. One
 * component, two homes: the Voice surface (full width) and the inspector
 * sheet beside another surface — the controller decides which element
 * it renders into; the `host` prop only changes the header chrome.
 *
 * Reads state at render; the controller re-renders it on external
 * changes. Its own writes set `writing` while the actions run so the
 * controller can tell them apart from external ones (re-rendering under
 * a dial mid-drag would destroy the dial).
 *
 * Callbacks (assigned by the controller): onClose(), onStep(delta),
 * onExpand().
 */
export class InspectorComponent extends BaseComponent {

    constructor(target) {
        super(target);
        this.writing = false;
        this.onClose = null;
        this.onStep = null;
        this.onExpand = null;
    }

    render({ index, host, dialSize }) {
        this.teardown();
        this.index = index;
        this.dialSize = dialSize;
        this.el.innerHTML = '';

        const root = document.createElement('div');
        root.className = 'inspector';
        root.append(this.buildHeader(index, host), this.buildSections(index));
        this.el.appendChild(root);
    }

    /** Run `fn(i)` for every voice the gesture addresses, flagged as our own write. */
    apply(index, e, fn) {
        this.writing = true;
        try {
            for (const i of voiceTargets(index, e)) fn(i);
        } finally {
            this.writing = false;
        }
    }

    buildHeader(index, host) {
        const header = document.createElement('div');
        header.className = 'inspector-header';

        const ratio = AppState.currentSystem.ratios[index];
        const label = AppState.currentSystem.labels[index] || `#${index + 1}`;
        const freq = calculateFrequency(ratio);

        const title = document.createElement('h2');
        title.className = 'inspector-title';
        title.innerHTML = `<span class="inspector-title-voice">Overtone ${index + 1}</span>`
            + `<span class="inspector-title-detail">${label} · ${freq.toFixed(freq >= 100 ? 1 : 2)} Hz</span>`;

        header.append(
            this.iconButton({ html: ICON_PREV, label: 'Previous overtone', cls: 'inspector-step', onClick: () => this.onStep?.(-1) }),
            title,
            this.iconButton({ html: ICON_NEXT, label: 'Next overtone', cls: 'inspector-step', onClick: () => this.onStep?.(1) }),
        );

        if (host === 'sheet') {
            const spacer = document.createElement('span');
            spacer.className = 'inspector-header-spacer';
            header.append(
                spacer,
                this.iconButton({ html: ICON_EXPAND, label: 'Open as the Voice surface', cls: 'inspector-icon-btn inspector-expand', onClick: () => this.onExpand?.() }),
                this.iconButton({ html: ICON_CLOSE, label: 'Close inspector', cls: 'inspector-icon-btn inspector-close', onClick: () => this.onClose?.() }),
            );
        }
        return header;
    }

    iconButton({ html, label, cls, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = cls;
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = html;
        this.bindEvent(btn, 'click', onClick);
        return btn;
    }

    buildSections(index) {
        // Filter and pan are dial-sized — stacked in one column so the
        // sequence and pulse sections get the width instead
        const side = document.createElement('div');
        side.className = 'inspector-side-col';
        side.append(this.buildFilterSection(index), this.buildPanSection(index));

        const sections = document.createElement('div');
        sections.className = 'inspector-sections';
        sections.append(this.buildGateSection(index), side, this.buildEnvelopeSection(index), this.buildPulseSection(index));
        return sections;
    }

    /**
     * Titled card. Content goes into `.sectionBody` — a column normally,
     * flowed into a row by the embed layout (170px leaves no vertical room).
     */
    section(titleText) {
        const el = document.createElement('section');
        el.className = 'inspector-section';
        const h = document.createElement('h3');
        h.className = 'inspector-section-title';
        h.textContent = titleText;
        const body = document.createElement('div');
        body.className = 'inspector-section-body';
        el.append(h, body);
        el.sectionBody = body;
        return el;
    }

    /** A Dial with its name above and a live readout beneath. */
    dialColumn({ label, color, dial, text, onChange }) {
        const col = document.createElement('div');
        col.className = 'inspector-dial-col';
        // `text` may be two-line ("φ^2\n660 Hz"); the readout preserves the break
        const d = new Dial({
            ...dial,
            size: this.dialSize,
            label,
            ...(color ? { color } : {}),
            format: text,
            onChange,
        });
        col.appendChild(d.el);
        return col;
    }

    // ---------------------------------------------------------------
    // Gate / sequence + modulation
    // ---------------------------------------------------------------

    buildGateSection(index) {
        const el = this.section('Sequence');
        const gate = OvertoneSignalActions.getGate(index);
        // Linked edits apply the whole gate config to all voices (select/
        // input change events carry no modifiers; the tracked state decides)
        const applyGate = (e) => {
            this.apply(index, e, (i) => OvertoneSignalActions.setGate(i, { ...gate, seq: [...(gate.seq || [])] }));
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
        params.className = 'inspector-gate-params';

        const modeGroup = document.createElement('div');
        modeGroup.className = 'inspector-gate-mode';
        modeGroup.append(select, params);
        el.sectionBody.appendChild(modeGroup);

        const renderParams = () => {
            params.innerHTML = '';
            if (gate.mode === 4) {
                const lab = document.createElement('label');
                lab.className = 'inspector-field';
                lab.textContent = '0/1 pattern';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inspector-seq-input';
                input.placeholder = 'e.g. 10110';
                input.value = (gate.seq || []).join('');
                input.addEventListener('input', (e) => {
                    const clean = input.value.replace(/[^01]/g, '');
                    if (clean !== input.value) input.value = clean;
                    gate.seq = clean.split('').map(Number);
                    applyGate(e);
                });
                lab.appendChild(input);
                params.appendChild(lab);
            } else {
                for (const [key, labelText, min, max] of GATE_PARAM_FIELDS[gate.mode] || []) {
                    const lab = document.createElement('label');
                    lab.className = 'inspector-field';
                    lab.textContent = labelText;
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = min;
                    input.max = max;
                    input.step = 1;
                    input.value = gate[key] ?? 1;
                    input.addEventListener('change', (e) => {
                        const v = Math.min(max, Math.max(min, Math.round(Number(input.value)) || 0));
                        input.value = v;
                        gate[key] = v;
                        applyGate(e);
                    });
                    lab.appendChild(input);
                    params.appendChild(lab);
                }
            }
        };

        select.addEventListener('change', (e) => {
            gate.mode = parseInt(select.value, 10);
            renderParams();
            applyGate(e);
        });
        renderParams();

        el.sectionBody.append(this.buildShapeControls(index), this.buildTargetControls(index));
        return el;
    }

    /** Cycle contour: waveform selector (same options as the oscillator menu) + preview + stretch. */
    buildShapeControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-shape';

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
        canvas.className = 'inspector-shape-preview';
        canvas.width = 220;
        canvas.height = 44;
        wrap.appendChild(canvas);

        // Shared: gate mode/param edits re-trigger it too
        const draw = () => drawSequencePreview(canvas, index);
        this._redrawSeqPreview = draw;

        select.addEventListener('change', (e) => {
            this.apply(index, e, (i) => OvertoneSignalActions.setSequencerShape(i, select.value));
            draw();
        });

        // Stretch the shape over N cycles (powers of two) so a complex
        // custom waveform modulates slowly instead of wobbling per cycle
        const lenRow = document.createElement('div');
        lenRow.className = 'inspector-stretch-row';
        const lenLabel = document.createElement('span');
        lenLabel.className = 'inspector-stretch-label';
        const fmt = (v) => (v >= 1 ? `×${v}` : `÷${1 / v}`);
        lenLabel.textContent = fmt(OvertoneSignalActions.getSequencer(index).stretch);
        const mkBtn = (text, factor) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'action-btn inspector-stretch-btn';
            b.textContent = text;
            b.addEventListener('click', (e) => {
                // Linked: every voice gets the edited voice's NEW stretch
                const next = OvertoneSignalActions.getSequencer(index).stretch * factor;
                this.apply(index, e, (i) => OvertoneSignalActions.setSequencerStretch(i, next));
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

    /** Modulation targets: amount sliders. */
    buildTargetControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-targets';

        const heading = document.createElement('div');
        heading.className = 'inspector-targets-heading';
        heading.textContent = 'Modulation Target';
        wrap.appendChild(heading);

        const seq = OvertoneSignalActions.getSequencer(index);
        const addAmount = (target, labelText, min, max) => {
            const row = document.createElement('label');
            row.className = 'inspector-target-row';
            const label = document.createElement('span');
            label.className = 'inspector-target-label';
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'range';
            input.min = min;
            input.max = max;
            input.step = 0.01;
            input.value = seq.amounts[target];
            input.className = 'inspector-target-slider';
            const value = document.createElement('span');
            value.className = 'inspector-target-value';
            value.textContent = (+seq.amounts[target]).toFixed(2);
            input.addEventListener('input', (e) => {
                const v = parseFloat(input.value);
                this.apply(index, e, (i) => OvertoneSignalActions.setSequencerAmount(i, target, v));
                value.textContent = v.toFixed(2);
            });
            row.append(label, input, value);
            wrap.appendChild(row);
        };

        addAmount('gain', 'gain', 0, 1);
        addAmount('freq', 'filter freq', -1, 1);
        addAmount('res', 'resonance', 0, 1);
        addAmount('wet', 'conv wet/dry', 0, 1);
        addAmount('fb', 'conv feedback', 0, 1);
        return wrap;
    }

    // ---------------------------------------------------------------
    // Filter & drive
    // ---------------------------------------------------------------

    buildFilterSection(index) {
        const el = this.section('Filter');
        const filter = OvertoneSignalActions.getFilter(index);
        // Linked edits merge only the changed field into each voice's own
        // filter, so a linked cutoff drag doesn't flatten everyone's resonance
        const applyField = (key, value, e) => {
            filter[key] = value;
            this.apply(index, e, (i) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), [key]: value }));
        };

        // The cutoff dial is an overtone-series selector: it picks a partial
        // (of the current system) of this voice's audible base. 0 = open.
        // Positions past the system's table extend the series as +1, +2, …
        const sysLabels = AppState.currentSystem.labels;
        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const partialLabel = (n) => (n <= sysLabels.length ? sysLabels[n - 1] : `+${n - sysLabels.length}`);
        const cutoffText = () => (filter.multiplier > 0
            ? `${partialLabel(Math.round(filter.multiplier))}\n${formatHz(harmonicFilterCutoff(index, voiceFreq))}`
            : 'open');

        const row = document.createElement('div');
        row.className = 'inspector-dial-row';
        row.append(
            this.dialColumn({
                label: 'cutoff',
                dial: { min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: filter.multiplier || 0 },
                text: cutoffText,
                onChange: (v, e) => applyField('multiplier', Math.round(v), e),
            }),
            this.dialColumn({
                label: 'resonance', color: '--accent-negative',
                dial: { min: 0.1, max: Q_MAX, step: 0.05, value: filter.q },
                text: () => `Q ${(+filter.q).toFixed(2)}`,
                onChange: (v, e) => applyField('q', v, e),
            }),
            this.dialColumn({
                label: 'drive', color: '--accent-positive',
                dial: { min: 0, max: DRIVE_MAX, step: 0.05, value: OvertoneSignalActions.getDrive(index) },
                text: () => {
                    const v = OvertoneSignalActions.getDrive(index);
                    return v > 0 ? `${Math.round(v * 100)}%` : 'clean';
                },
                onChange: (v, e) => this.apply(index, e, (i) => OvertoneSignalActions.setDrive(i, v)),
            })
        );
        el.sectionBody.appendChild(row);
        return el;
    }

    // ---------------------------------------------------------------
    // Envelope (applied when the global mode is ADSR)
    // ---------------------------------------------------------------

    buildEnvelopeSection(index) {
        const el = this.section('Envelope');
        const fmtTime = (v) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);

        const row = document.createElement('div');
        row.className = 'inspector-dial-row';
        const timeDial = (label, key) => this.dialColumn({
            label,
            dial: { min: 0.001, max: ENV_TIME_MAX[key], step: 0.001, value: OvertoneSignalActions.getEnvelope(index)[key] },
            text: () => fmtTime(OvertoneSignalActions.getEnvelope(index)[key]),
            onChange: (v, e) => this.apply(index, e, (i) => OvertoneSignalActions.setEnvelope(i, { [key]: v })),
        });
        row.append(
            timeDial('attack', 'a'),
            timeDial('decay', 'd'),
            this.dialColumn({
                label: 'sustain', color: '--accent-primary',
                dial: { min: 0, max: 1, step: 0.01, value: OvertoneSignalActions.getEnvelope(index).s },
                text: () => `${Math.round(OvertoneSignalActions.getEnvelope(index).s * 100)}%`,
                onChange: (v, e) => this.apply(index, e, (i) => OvertoneSignalActions.setEnvelope(i, { s: v })),
            }),
            timeDial('release', 'r')
        );
        el.sectionBody.appendChild(row);

        if (OvertoneSignalActions.getEnvelopeMode() !== 'adsr') {
            const hint = document.createElement('div');
            hint.className = 'inspector-hint';
            hint.textContent = 'applies in ADSR mode (navbar toggle)';
            el.sectionBody.appendChild(hint);
        }
        return el;
    }

    // ---------------------------------------------------------------
    // Pan
    // ---------------------------------------------------------------

    buildPanSection(index) {
        const el = this.section('Pan');
        const format = (v) => (Math.abs(v) < 0.005 ? 'C' : (v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`));

        const row = document.createElement('div');
        row.className = 'inspector-dial-row';
        let value = OvertoneSignalActions.getPan(index);
        row.appendChild(this.dialColumn({
            label: 'pan',
            dial: { min: -1, max: 1, step: 0.01, value },
            text: () => format(value),
            onChange: (v, e) => {
                value = v;
                this.apply(index, e, (i) => OvertoneSignalActions.setPan(i, v));
            },
        }));
        el.sectionBody.appendChild(row);
        return el;
    }

    // ---------------------------------------------------------------
    // Pulse outputs (MIDI / OSC / clock)
    // ---------------------------------------------------------------

    buildPulseSection(index) {
        const el = this.section('Pulse Out');

        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const rows = document.createElement('div');
        rows.className = 'inspector-pulse-rows';
        el.sectionBody.appendChild(rows);

        // One MIDI note-on/off blip per audible cycle
        const note = noteForVoice(index);
        const midiAvailable = midiOutputRouter.available;
        rows.appendChild(this.pulseRow({
            text: 'MIDI out',
            detail: `note ${note} · ch 1${midiAvailable ? '' : ' · no output available'}`,
            enabled: midiAvailable,
            value: OvertoneSignalActions.getPulseOut(index).midi,
            onToggle: (on, e) => this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { midi: on })),
        }));

        // One /twig/pulse message per audible cycle, into the Max patch
        const oscAvailable = oscClient.isConnected();
        rows.appendChild(this.pulseRow({
            text: 'OSC out',
            detail: oscAvailable ? `pulse ${index + 1} <cycle> <gate>` : 'bridge offline',
            enabled: oscAvailable,
            value: OvertoneSignalActions.getPulseOut(index).osc,
            onToggle: (on, e) => this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { osc: on })),
        }));

        // Exclusive: one voice may drive the MIDI clock (24 ticks/cycle)
        const clockDetail = () => {
            const c = AppState.midiClockVoice;
            if (c === index) return '24 ppq · this voice is the clock';
            if (c !== null) return `currently overtone ${c + 1}`;
            return '24 ticks per cycle';
        };
        const clockRow = this.pulseRow({
            text: 'Output as MIDI clock',
            detail: clockDetail(),
            enabled: midiOutputRouter.available,
            value: AppState.midiClockVoice === index,
            onToggle: (on) => {
                this.writing = true;
                try {
                    OvertoneSignalActions.setMidiClockVoice(on ? index : null);
                } finally {
                    this.writing = false;
                }
                if (!on) midiOutputRouter.stopClock();
                clockRow.querySelector('.inspector-pulse-detail').textContent = clockDetail();
            },
        });
        rows.appendChild(clockRow);

        if (voiceFreq > PULSE_MAX_HZ) {
            const warn = document.createElement('div');
            warn.className = 'inspector-pulse-warning';
            warn.textContent = `pulses pause above ${PULSE_MAX_HZ} Hz — this voice is at ${Math.round(voiceFreq)} Hz`;
            el.sectionBody.appendChild(warn);
        }
        return el;
    }

    /** Row: [toggle] label — detail. */
    pulseRow({ text, detail, enabled, value, onToggle }) {
        const row = document.createElement('div');
        row.className = 'inspector-pulse-row';
        if (!enabled) row.classList.add('inspector-pulse-row-disabled');

        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch inspector-pulse-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.classList.toggle('active', Boolean(value));
        toggle.setAttribute('aria-checked', String(Boolean(value)));
        toggle.setAttribute('aria-label', text);
        if (enabled) {
            toggle.addEventListener('click', (e) => {
                const on = !toggle.classList.contains('active');
                toggle.classList.toggle('active', on);
                toggle.setAttribute('aria-checked', String(on));
                onToggle(on, e);
            });
        }

        const label = document.createElement('span');
        label.className = 'inspector-pulse-label';
        label.textContent = text;

        const detailEl = document.createElement('span');
        detailEl.className = 'inspector-pulse-detail';
        detailEl.textContent = detail;

        row.append(toggle, label, detailEl);
        return row;
    }

    teardown() {
        super.teardown();
        this._redrawSeqPreview = null;
    }
}
