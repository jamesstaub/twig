import BaseComponent from '../base/BaseComponent.js';
import { AppState } from '../../config.js';
import { calculateFrequency } from '../../utils.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import { noteForVoice, pulseChannel } from '../midi/pulseMidi.js';
import { clockFold } from '../midi/clockTicks.js';
import { PATTERNS, patternParams } from '../../dsp/gate/patterns.js';
import { getFrequencyCorrection } from '../../audio.js';
import { oscClient } from '../osc/oscClient.js';
import { voiceTargets } from '../generic/linkAll.js';
import { shapeMode } from '../shape/shapeMode.js';
import { Dial } from '../generic/dial/Dial.js';

const PULSE_MAX_HZ = 50; // mirrors the cap in gate-processor.js

// The modes, and the dials for each mode's x/y, come from the pattern
// registry (js/dsp/gate/patterns.js) — a new pattern type appears here
// with no edit. x and y mean different things per pattern, so each brings
// its own range and its own default, loaded on entering the mode (a "1"
// carried over from cycles-on would be a 1% probability).
const GATE_MODE_OPTIONS = PATTERNS.map((p) => ({ value: p.id, label: p.label }));

const ICON_PREV = '‹';
const ICON_NEXT = '›';

/**
 * Inspector — the Sequence panel's editor for one overtone: cycle gate +
 * shape, modulation, pulse outputs. The header (the ‹ Overtone N › voice
 * stepper) mounts into `headerSlot` — the panel's bottom toolbar — so the
 * editor scrolls above a fixed bar. The sequence it produces is drawn in
 * the panel's side column (js/modules/sequenceViz/), off the same events.
 *
 * While link or shape is in effect an edit lands on every voice, so the
 * title says so (`scope` prop / `setScope`, updated in place — a
 * re-render under a control mid-drag would destroy it).
 *
 * Ranged controls (gate dials, modulation amounts) honor shape gestures
 * (shapeMode.js): the edit sculpts that parameter across every voice.
 *
 * Reads state at render; the controller re-renders it on external
 * changes. Its own writes set `writing` while the actions run so the
 * controller can tell them apart from external ones.
 *
 * Callback (assigned by the controller): onStep(delta).
 */
export class InspectorComponent extends BaseComponent {

    constructor(target) {
        super(target);
        this.writing = false;
        this.onStep = null;
    }

    render({ index, headerSlot, dialSize, scope }) {
        this.teardown();
        this.index = index;
        this.dialSize = dialSize;
        this.scope = scope;
        this.el.innerHTML = '';

        const root = document.createElement('div');
        root.className = 'inspector';
        headerSlot.replaceChildren(this.buildHeader(index));
        root.appendChild(this.buildSections(index));
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

    /**
     * A ranged value: on a shape gesture it sculpts `set` across every
     * voice (anchored on this one), else it goes to the addressed voices.
     * Flagged as our own write either way.
     */
    applyValue(index, e, { min, max, value }, set) {
        this.writing = true;
        try {
            if (shapeMode.isGesture(e)) shapeMode.applyParam(index, { min, max }, value, set);
            else for (const i of voiceTargets(index, e)) set(i, value);
        } finally {
            this.writing = false;
        }
    }

    buildHeader(index) {
        const header = document.createElement('div');
        header.className = 'inspector-header';

        const ratio = AppState.currentSystem.ratios[index];
        const label = AppState.currentSystem.labels[index] || `#${index + 1}`;
        const freq = calculateFrequency(ratio);

        const title = document.createElement('h2');
        title.className = 'inspector-title';
        this.titleVoiceEl = document.createElement('span');
        this.titleVoiceEl.className = 'inspector-title-voice';
        this.titleDetailEl = document.createElement('span');
        this.titleDetailEl.className = 'inspector-title-detail';
        title.append(this.titleVoiceEl, this.titleDetailEl);
        this._voiceTitle = `Overtone ${index + 1}`;
        this._voiceDetail = `${label} · ${freq.toFixed(freq >= 100 ? 1 : 2)} Hz`;
        this._voiceLabel = label;
        this.setScope(this.scope);

        header.append(
            this.iconButton({ html: ICON_PREV, label: 'Previous overtone', cls: 'inspector-step', onClick: () => this.onStep?.(-1) }),
            title,
            this.iconButton({ html: ICON_NEXT, label: 'Next overtone', cls: 'inspector-step', onClick: () => this.onStep?.(1) }),
        );
        return header;
    }

    /**
     * Who an edit addresses: null = this voice; 'link' = every voice gets
     * the value; 'shape' = every voice, sculpted from this one.
     */
    setScope(scope) {
        this.scope = scope;
        if (!this.titleVoiceEl) return;
        this.titleVoiceEl.textContent = scope ? 'All voices' : this._voiceTitle;
        this.titleDetailEl.textContent = scope === 'link' ? `linked · editing ${this._voiceLabel}`
            : scope === 'shape' ? `shaped from ${this._voiceLabel}`
                : this._voiceDetail;
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
        const sections = document.createElement('div');
        sections.className = 'inspector-sections';
        sections.append(
            this.buildGateSection(index),
            this.buildModulationSection(index),
            this.buildPulseSection(index),
        );
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
                for (const { key, label, min, max, def, format } of patternParams(gate.mode)) {
                    const dial = new Dial({
                        min, max, step: 1, value: gate[key] ?? def, resetValue: def,
                        size: this.dialSize, label,
                        ...(format ? { format } : {}),
                        fineOnShift: false, // shift = shape
                        onChange: (v, e) => {
                            gate[key] = v;
                            if (shapeMode.isGesture(e)) {
                                // Only this field, shaped across the voices
                                this.applyValue(index, e, { min, max, value: v }, (i, val) =>
                                    OvertoneSignalActions.setGate(i, { ...OvertoneSignalActions.getGate(i), [key]: Math.round(val) }));
                            } else {
                                applyGate(e);
                            }
                        },
                    });
                    params.appendChild(dial.el);
                }
            }
        };

        select.addEventListener('change', (e) => {
            gate.mode = parseInt(select.value, 10);
            for (const { key, def } of patternParams(gate.mode)) gate[key] = def;
            renderParams();
            applyGate(e);
        });
        renderParams();

        el.sectionBody.append(this.buildShapeControls(index));
        return el;
    }

    /** The sequence's modulation depth per target. */
    buildModulationSection(index) {
        const el = this.section('Modulation');
        el.sectionBody.appendChild(this.buildTargetControls(index));
        return el;
    }

    /** Cycle contour: waveform selector (same options as the oscillator menu) + stretch. */
    buildShapeControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-shape';

        const seq = OvertoneSignalActions.getSequencer(index);

        const select = document.createElement('select');
        select.className = 'control-select';
        const source = document.getElementById('waveform-select');
        const options = source ? Array.from(source.options).filter((o) => !o.disabled) : [];
        for (const opt of options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.textContent;
            if (opt.value === seq.shape) o.selected = true;
            select.appendChild(o);
        }
        wrap.appendChild(select);

        select.addEventListener('change', (e) => {
            this.apply(index, e, (i) => OvertoneSignalActions.setSequencerShape(i, select.value));
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
            });
            return b;
        };
        lenRow.append(mkBtn('÷2', 0.5), lenLabel, mkBtn('×2', 2));
        wrap.appendChild(lenRow);
        return wrap;
    }

    /** Modulation targets: amount sliders. */
    buildTargetControls(index) {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-targets';

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
                this.applyValue(index, e, { min, max, value: v }, (i, val) =>
                    OvertoneSignalActions.setSequencerAmount(i, target, Math.round(val * 100) / 100));
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
            detail: `note ${note} · ch ${pulseChannel()}${midiAvailable ? '' : ' · no output available'}`,
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

        // Where this voice's pulses (MIDI and OSC alike) land in its cycle
        const offsetDetail = (on) => (on ? 'pulses land mid-cycle' : 'pulses land on the cycle start');
        const offsetRow = this.pulseRow({
            text: 'Offset pulse 50%',
            detail: offsetDetail(OvertoneSignalActions.getPulseOut(index).offset),
            enabled: true,
            value: OvertoneSignalActions.getPulseOut(index).offset,
            onToggle: (on, e) => {
                this.apply(index, e, (i) => OvertoneSignalActions.setPulseOut(i, { offset: on }));
                offsetRow.querySelector('.inspector-pulse-detail').textContent = offsetDetail(on);
            },
        });
        rows.appendChild(offsetRow);

        // Exclusive: one voice may drive the MIDI clock. Its tempo is the
        // voice's cycle rate while that is 30-300 BPM, else that rate
        // folded by octaves into the window (clockFold) — read out here,
        // since it is what slaved hardware is told
        const clockDetail = () => {
            const c = AppState.midiClockVoice;
            if (c !== null && c !== index) return `currently overtone ${c + 1}`;
            // The gate clock runs at the oscillator's corrected rate
            const correction = AppState.sourceMode === 'oscillators' ? getFrequencyCorrection(AppState.currentWaveform) : 1;
            const hz = calculateFrequency(AppState.currentSystem.ratios[index]) * correction;
            if (!(hz > 0)) return '24 ticks per beat';
            const fold = clockFold(hz);
            const bpm = hz * 2 ** fold * 60;
            const tempo = `${bpm >= 100 ? bpm.toFixed(0) : bpm.toFixed(1)} BPM`;
            if (fold === 0) return `${tempo} · beat = cycle`;
            return fold < 0 ? `${tempo} · beat = ${2 ** -fold} cycles` : `${tempo} · ${2 ** fold} beats per cycle`;
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
        // In place — the fundamental can sweep, and a re-render would
        // destroy whatever control is mid-drag
        this.refreshClockDetail = () => {
            clockRow.querySelector('.inspector-pulse-detail').textContent = clockDetail();
        };

        if (voiceFreq > PULSE_MAX_HZ) {
            const warn = document.createElement('div');
            warn.className = 'inspector-pulse-warning';
            warn.textContent = `MIDI/OSC pulses pause above ${PULSE_MAX_HZ} Hz — this voice is at ${Math.round(voiceFreq)} Hz (the clock keeps running)`;
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
