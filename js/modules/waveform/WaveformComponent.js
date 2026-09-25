// WaveformComponent.js
import BaseComponent from "../base/BaseComponent.js";
import { getWaveValue } from "../tonewheel/tonewheelActions.js";
import { themeColor } from "../../theme.js";
import { Sketch, strokePath, withAlpha } from "../generic/sketch/Sketch.js";

function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}
// TODO: move these to a utils
export function lcmArray(arr) {
    return arr.reduce((a, b) => lcm(a, b), 1);
}

const DEFAULT_HEIGHT = 150;

/**
 * One frame of a waveform preview: the chosen oscillator (or the loaded
 * sound file) in `single` mode, the summed drawbar wavetable otherwise.
 * Drawn on the app's own canvas runtime (generic/sketch/Sketch.js) — the
 * sketch is stopped and repainted on demand, so it costs nothing at rest.
 * @param {WaveformComponent} component - Reads its live props at draw time
 */
function createWaveformSketch(component) {
    return function (ctx, sk) {
        {
            const props = component.props;
            if (!props?.harmonicAmplitudes?.length) return;

            const width = sk.width;
            const height = sk.height;
            const ampScale = height * 0.4;

            ctx.fillStyle = themeColor("--viz-bg");
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = themeColor("--viz-grid");
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            // A preset crossfade between two waveforms: the pair and how far
            // between them (see AppState.waveformMorph)
            const morph = props.waveformMorph;
            const value = (name, phase) => getWaveValue(name, phase, props.customWaveCoefficients?.[name]);
            const trace = themeColor("--viz-trace");
            ctx.lineWidth = 2;

            if (props.mode === "single" && props.sourceMode === "soundfile") {
                // The loaded file: its min/max envelope across the box
                // (nothing until a file loads)
                const ov = props.sample;
                if (!ov) return;
                const bin = (x) => Math.floor((x / width) * ov.max.length);
                // Filled envelope for a long file; the stroke keeps a short
                // one (a single cycle, one sample per bin) visible
                const envelope = [];
                for (let x = 0; x < width; x++) envelope.push(x, height / 2 - ov.max[bin(x)] * ampScale);
                for (let x = width - 1; x >= 0; x--) envelope.push(x, height / 2 - ov.min[bin(x)] * ampScale);
                ctx.fillStyle = trace;
                ctx.beginPath();
                ctx.moveTo(envelope[0], envelope[1]);
                for (let i = 2; i < envelope.length; i += 2) ctx.lineTo(envelope[i], envelope[i + 1]);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = trace;
                const mid = [];
                for (let x = 0; x < width; x++) mid.push(x, height / 2 - ((ov.max[bin(x)] + ov.min[bin(x)]) / 2) * ampScale);
                strokePath(ctx, mid);
                return;
            }

            if (props.mode === "single") {
                // Only first partial — mid-morph, both waves overlaid, each as
                // opaque as its share of the mix
                const ratio = props.currentSystem.ratios[0];
                const layers = morph
                    ? [[morph.a, 1 - morph.t], [morph.b, morph.t]]
                    : [[props.currentWaveform, 1]];
                for (const [name, share] of layers) {
                    ctx.strokeStyle = withAlpha(trace, Math.round(255 * Math.max(0.08, share)) / 255);
                    const wave = [];
                    for (let x = 0; x < width; x++) {
                        const theta = (x / width) * (Math.PI * 2) * 2;
                        wave.push(x, height / 2 - value(name, ratio * theta) * ampScale);
                    }
                    strokePath(ctx, wave);
                }
                return;
            }

            ctx.strokeStyle = trace;
            const summed = [];
            {
                // Summed waveform
                // Determine full period multiplier for phase continuity
                let fullPeriodMultiplier = 2; // default: show 2 periods in harmonic mode

                if (props.isSubharmonic) {
                    // Compute denominators from harmonic ratios
                    const denominators = props.currentSystem.ratios
                        .map((r, h) => props.harmonicAmplitudes[h] > 0.001 ? Math.round(r) : null)
                        .filter(Boolean);

                    if (denominators.length > 0) {
                        fullPeriodMultiplier = lcmArray(denominators);
                        // Cap multiplier to avoid exploding canvas size
                        fullPeriodMultiplier = Math.min(fullPeriodMultiplier, 32);
                    }

                }

                // Precompute theta mapping for canvas width
                const thetaScale = (Math.PI * 2 * fullPeriodMultiplier) / width;

                for (let x = 0; x < width; x++) {
                    const theta = x * thetaScale;
                    let sum = 0;
                    let totalAmp = 0;

                    for (let h = 0; h < props.harmonicAmplitudes.length; h++) {
                        const amp = props.harmonicAmplitudes[h] || 0;
                        // Amplitude store can outlive the system (grow-only)
                        if (amp > 0.001 && props.currentSystem.ratios[h] > 0) {
                            const ratio = props.currentSystem.ratios[h];
                            // Use division for subharmonics, multiplication for normal harmonics
                            const harmonicPhase = props.isSubharmonic ? theta / ratio : ratio * theta;
                            // The sum sounds the morph's mix, so draw that
                            const wave = morph
                                ? value(morph.a, harmonicPhase) * (1 - morph.t) + value(morph.b, harmonicPhase) * morph.t
                                : value(props.currentWaveform, harmonicPhase);
                            sum += wave * amp;
                            totalAmp += amp;
                        }
                    }

                    const y = height / 2 - (sum / (totalAmp || 1)) * ampScale;
                    summed.push(x, y);
                }

            }

            strokePath(ctx, summed);
        }
    };
}

/**
 * WaveformComponent
 * Displays a live waveform preview on the app's canvas runtime
 */
export default class WaveformComponent extends BaseComponent {
    constructor(elementId) {
        super(elementId);
        this._sketch = null;
        this.props = {};
    }

    /**
     * Render waveform with new props
     * @param {object} props - Includes currentWaveform, harmonicAmplitudes, currentSystem
     */
    render(props) {
        this.props = props;

        if (!this._sketch) {
            // Create the sketch and its canvas exactly once
            this._sketch = new Sketch(this.el, {
                draw: createWaveformSketch(this),
                loop: false, // repainted on demand, not animated
                fallbackSize: DEFAULT_HEIGHT,
            });
        } else {
            // The sketch reads component.props at draw time — repaint only.
            // (Rebuilding it per update leaks canvas contexts and collapses
            // under OSC/MIDI drawbar streams.)
            this._sketch.redraw();
        }
    }

    /**
     * Unbind tracked events; the sketch survives updates.
     */
    teardown() {
        super.teardown?.();
    }

    /**
     * Full cleanup — only for actually discarding the component.
     */
    destroy() {
        this._sketch?.destroy();
        this._sketch = null;
        this.teardown();
    }
}
