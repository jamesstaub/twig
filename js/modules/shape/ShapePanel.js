import { shapeMode } from './shapeMode.js';
import { cycleStepper } from '../generic/cycleStepper.js';
import { drawShapeContour, shapeIconDataURL } from '../overtoneSignal/sequencePreview.js';

/**
 * Shape panel — the shape mode's controls, one compact row: the contour
 * tiled at the current cycle count, a ‹›-stepper picking the contour
 * (defaults to the oscillator waveform, without touching it), and ÷2/×2
 * cycle buttons. Pure view over shapeMode: every control writes there
 * (which re-applies the last gesture, so the row follows live) and
 * `refresh()` re-reads it. Exposes .el; the overtone toolbar docks it.
 */
export class ShapePanel {

    constructor() {
        this.el = document.createElement('div');
        this.el.className = 'shape-panel';

        // Size comes from CSS (.shape-panel-preview) — the bitmap is 2×
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'shape-panel-preview';
        this.canvas.width = 240;
        this.canvas.height = 56;

        this.stepper = cycleStepper({
            options: waveformNames,
            get: () => shapeMode.contour,
            set: (name) => shapeMode.setContour(name),
            className: 'shape-panel-stepper',
            render: (el, name) => {
                el.innerHTML = '';
                const img = document.createElement('img');
                img.src = shapeIconDataURL(name, { width: 22, height: 12, color: '--text-accent' });
                img.alt = name;
                el.title = name;
                el.appendChild(img);
            },
        });

        const cycles = document.createElement('div');
        cycles.className = 'shape-panel-cycles';
        this.cyclesLabel = document.createElement('span');
        this.cyclesLabel.className = 'shape-panel-cycles-label';
        const mkBtn = (text, factor, title) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'action-btn shape-panel-btn';
            b.textContent = text;
            b.title = title;
            b.addEventListener('click', () => shapeMode.stepCycles(factor));
            return b;
        };
        cycles.append(
            mkBtn('÷2', 0.5, 'half as many cycles across the row'),
            this.cyclesLabel,
            mkBtn('×2', 2, 'twice as many cycles across the row'),
        );

        this.el.append(this.canvas, this.stepper, cycles);
    }

    refresh() {
        const c = shapeMode.cycles;
        this.cyclesLabel.textContent = c >= 1 ? `×${c}` : `÷${1 / c}`;
        this.stepper._refresh();
        drawShapeContour(this.canvas, shapeMode.contour, c);
    }
}

/** Waveform option list — always the main oscillator menu (customs included). */
function waveformNames() {
    const source = document.getElementById('waveform-select');
    return source ? [...source.options].map((o) => o.value) : ['sine', 'square', 'triangle', 'sawtooth'];
}
