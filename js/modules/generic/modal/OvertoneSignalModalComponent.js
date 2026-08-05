import ModalComponent from './ModalComponent.js';
import { AppState } from '../../../config.js';
import { calculateFrequency } from '../../../utils.js';
import { harmonicFilterCutoff, MAX_FILTER_PARTIALS } from '../../../audio.js';
import { OvertoneSignalActions } from '../../overtoneSignal/overtoneSignalActions.js';
import { MidiOutputRouter, midiOutputRouter } from '../../midi/midiOutputRouter.js';
import { oscClient } from '../../osc/oscClient.js';
import { showStatus } from '../../../domUtils.js';
import { themeColor } from '../../../theme.js';
import { getWaveValue } from '../../tonewheel/tonewheelActions.js';

const PULSE_MAX_HZ = 50; // mirrors the cap in gate-processor.js

/**
 * Unipolar (0-1) cycle contour for a shape name — mirrors shapeValue() in
 * gate-processor.js. Custom waveforms are min-max normalized like the
 * table the worklet receives.
 */
function shapeContour(shapeName, phase) {
    switch (shapeName) {
        case 'sine': return (1 - Math.cos(2 * Math.PI * phase)) / 2;
        case 'triangle': return 1 - Math.abs(2 * phase - 1);
        case 'sawtooth': return 1 - phase;
        case 'square': return 1;
        default: return null; // custom — sampled separately
    }
}

/** Pattern activity for one cycle — mirrors gateForCycle in the worklet
 *  (probability is depicted as all-active; randomness can't be drawn). */
function previewPattern(gate, cycles) {
    switch (gate.mode) {
        case 1: {
            const period = Math.max(1, Math.round(gate.x) + Math.round(gate.y));
            return Array.from({ length: cycles }, (_, c) => (c % period) < Math.round(gate.x));
        }
        case 2: {
            const steps = Math.max(1, Math.round(gate.y));
            const pulses = Math.min(Math.round(gate.x), steps);
            const pat = [];
            let bucket = 0;
            for (let i = 0; i < steps; i++) {
                bucket += pulses;
                if (bucket >= steps) { bucket -= steps; pat.push(true); } else pat.push(false);
            }
            return Array.from({ length: cycles }, (_, c) => pat[c % steps]);
        }
        case 4: {
            const seq = gate.seq || [];
            if (!seq.length) return Array.from({ length: cycles }, () => true);
            return Array.from({ length: cycles }, (_, c) => seq[c % seq.length] > 0.5);
        }
        default: // off and probability
            return Array.from({ length: cycles }, () => true);
    }
}

/** Cycles the preview spans: the full pattern period and the full shape period. */
function previewCycleCount(gate, stretch) {
    let period = 1;
    if (gate.mode === 1) period = Math.max(1, Math.round(gate.x) + Math.round(gate.y));
    else if (gate.mode === 2) period = Math.max(1, Math.round(gate.y));
    else if (gate.mode === 4) period = Math.max(1, (gate.seq || []).length || 1);
    return Math.min(32, Math.max(period, Math.ceil(stretch), 1));
}

/**
 * Draw the full sequence — pattern × shape × stretch — in the app's viz
 * style, exactly the control signal the worklet produces (sans declick).
 */
function drawSequencePreview(canvas, index) {
    const gate = OvertoneSignalActions.getGate(index);
    const seq = OvertoneSignalActions.getSequencer(index);
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const pad = 4;

    ctx.fillStyle = themeColor('--viz-bg');
    ctx.fillRect(0, 0, w, h);

    const cycles = previewCycleCount(gate, seq.stretch);
    const active = previewPattern(gate, cycles);

    // Cycle boundaries as faint gridlines
    ctx.strokeStyle = themeColor('--viz-grid');
    ctx.lineWidth = 1;
    for (let c = 1; c < cycles; c++) {
        const x = Math.round((c / cycles) * w) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // Custom shape: sample one period, min-max normalized like the worklet table
    let table = null;
    if (shapeContour(seq.shape, 0) === null) {
        const coeffs = AppState.customWaveCoefficients?.[seq.shape];
        if (coeffs) {
            const raw = [];
            for (let i = 0; i < 256; i++) {
                raw.push(getWaveValue(seq.shape, (i / 256) * 2 * Math.PI, coeffs));
            }
            const min = Math.min(...raw);
            const span = (Math.max(...raw) - min) || 1;
            table = raw.map((v) => (v - min) / span);
        }
    }
    const shapeAt = (phase) => {
        if (table) {
            const pos = phase * table.length;
            const i0 = Math.floor(pos) % table.length;
            const i1 = (i0 + 1) % table.length;
            return table[i0] + (table[i1] - table[i0]) * (pos - i0);
        }
        return shapeContour(seq.shape, phase) ?? 1;
    };

    ctx.strokeStyle = themeColor('--viz-trace');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
        const t = (i / w) * cycles;
        const c = Math.min(cycles - 1, Math.floor(t));
        const phase = t - c;
        const s = gate.mode === 0
            ? 1
            : (active[c] ? shapeAt(((c + phase) / seq.stretch) % 1) : 0);
        const y = pad + (1 - s) * (h - 2 * pad);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();
}

function formatHz(hz) {
    return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
}

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
        root.appendChild(title);

        root.appendChild(this.buildCopyRow(index));

        const sections = document.createElement('div');
        sections.className = 'signal-modal-sections';
        sections.append(
            this.buildGateSection(index),
            this.buildFilterSection(index),
            this.buildPanSection(index)
        );
        root.appendChild(sections);

        root.appendChild(this.buildPulseSection(index));

        return root;
    }

    // ---------------------------------------------------------------
    // Pulse outputs (MIDI / OSC / clock)
    // ---------------------------------------------------------------

    buildPulseSection(index) {
        const el = this.section('Pulse Out');
        el.classList.add('signal-section-wide');

        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const rows = document.createElement('div');
        rows.className = 'signal-pulse-rows';
        el.appendChild(rows);

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
            el.appendChild(warn);
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
        const pan = OvertoneSignalActions.getPan(sourceIndex);
        for (const t of targets) {
            OvertoneSignalActions.setGate(t, { ...gate, seq: [...(gate.seq || [])] });
            OvertoneSignalActions.setFilter(t, { ...filter });
            OvertoneSignalActions.setPan(t, pan);
        }
    }

    section(titleText) {
        const el = document.createElement('section');
        el.className = 'signal-section';
        const h = document.createElement('h3');
        h.className = 'signal-section-title';
        h.textContent = titleText;
        el.appendChild(h);
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
        el.appendChild(select);

        const params = document.createElement('div');
        params.className = 'signal-gate-params';
        el.appendChild(params);

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

        el.appendChild(this.buildShapeControls(index));
        el.appendChild(this.buildTargetControls(index));

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

        // The cutoff slider is itself an overtone-series selector: it picks
        // a partial (of the current system) of this voice's audible base.
        // 0 = filter open. Positions past the system's own table extend the
        // series and are marked +1, +2, …
        const sysLabels = AppState.currentSystem.labels;
        const voiceFreq = calculateFrequency(AppState.currentSystem.ratios[index]);
        const partialLabel = (n) =>
            (n <= sysLabels.length ? sysLabels[n - 1] : `+${n - sysLabels.length}`);

        const row = document.createElement('div');
        row.className = 'signal-slider-row';
        row.append(
            this.vSlider({
                label: 'cutoff', color: 'blue',
                min: 0, max: MAX_FILTER_PARTIALS, step: 1, value: filter.multiplier || 0,
                format: (v) => (filter.multiplier > 0
                    ? `${partialLabel(Math.round(v))}\n${formatHz(harmonicFilterCutoff(index, voiceFreq))}`
                    : 'open'),
                onInput: (v) => { filter.multiplier = Math.round(v); apply(); },
            }),
            this.vSlider({
                label: 'resonance', color: 'red',
                min: 0.1, max: 48, step: 0.05, value: filter.q,
                format: (v) => `Q ${(+v).toFixed(2)}`,
                onInput: (v) => { filter.q = v; apply(); },
            })
        );
        el.appendChild(row);
        return el;
    }

    /** Vertical slider using the drawbar UI elements. */
    vSlider({ label, color, min, max, step, value, format, onInput }) {
        const col = document.createElement('div');
        col.className = `drawbar ${color} signal-vslider`;

        const lab = document.createElement('span');
        lab.className = 'drawbar-label';
        lab.textContent = label;

        const wrap = document.createElement('div');
        wrap.className = 'drawbar-input-wrapper';
        const track = document.createElement('div');
        track.className = 'drawbar-track';
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'drawbar-slider';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;
        wrap.append(track, input);

        const valueEl = document.createElement('span');
        valueEl.className = 'signal-vslider-value';
        valueEl.textContent = format(value);

        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            onInput(v);
            valueEl.textContent = format(v);
        });

        col.append(lab, wrap, valueEl);
        return col;
    }

    // ---------------------------------------------------------------
    // Pan
    // ---------------------------------------------------------------

    buildPanSection(index) {
        const el = this.section('Pan');
        const format = (v) => (Math.abs(v) < 0.005 ? 'C' : (v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`));

        const row = document.createElement('div');
        row.className = 'signal-pan-row';

        const left = document.createElement('span');
        left.className = 'signal-pan-edge';
        left.textContent = 'L';
        const right = document.createElement('span');
        right.className = 'signal-pan-edge';
        right.textContent = 'R';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'signal-pan-slider';
        input.min = -1;
        input.max = 1;
        input.step = 0.01;
        input.value = OvertoneSignalActions.getPan(index);

        const valueEl = document.createElement('span');
        valueEl.className = 'signal-vslider-value';
        valueEl.textContent = format(parseFloat(input.value));

        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            valueEl.textContent = format(v);
            OvertoneSignalActions.setPan(index, v);
        });

        row.append(left, input, right);
        el.append(row, valueEl);
        return el;
    }
}
