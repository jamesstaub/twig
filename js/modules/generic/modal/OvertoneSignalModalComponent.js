import ModalComponent from './ModalComponent.js';
import { AppState } from '../../../config.js';
import { calculateFrequency } from '../../../utils.js';
import { harmonicFilterCutoff, MAX_FILTER_PARTIALS } from '../../../audio.js';
import { OvertoneSignalActions } from '../../overtoneSignal/overtoneSignalActions.js';
import { showStatus } from '../../../domUtils.js';

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

        return root;
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
        const el = this.section('Gate');
        const gate = OvertoneSignalActions.getGate(index);
        const apply = () => OvertoneSignalActions.setGate(index, { ...gate });

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

        return el;
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
