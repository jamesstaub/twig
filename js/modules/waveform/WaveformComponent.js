// WaveformComponent.js
import BaseComponent from "../base/BaseComponent.js";
import { getWaveValue } from "../tonewheel/tonewheelActions.js";
import { themeColor } from "../../theme.js";
import p5 from "p5";

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

/**
 * Create a reusable p5 sketch for waveform drawing
 * @param {WaveformComponent} component - The component instance
 */
function createWaveformSketch(component) {
    return function (p) {
        component._waveformP5 = p;

        p.setup = function () {
            const container = component.el
            const width = container?.clientWidth || 400;
            const height = 150;

            p.createCanvas(width, height).parent(container);
            p.noLoop(); // Only redraw on demand
        };

        p.windowResized = function () {
            const container = component.el
            const width = container?.clientWidth || 400;
            const height = 150;
            p.resizeCanvas(width, height);
            p.redraw();
        };

        p.draw = function () {
            const props = component.props;
            if (!props?.p5Instance || !props.harmonicAmplitudes?.length) return;

            const width = p.width;
            const height = p.height;
            const ampScale = height * 0.4;

            p.background(themeColor("--viz-bg"));
            p.stroke(themeColor("--viz-grid"));
            p.strokeWeight(1);
            p.line(0, height / 2, width, height / 2);

            p.stroke(themeColor("--viz-trace"));
            p.strokeWeight(2);
            p.noFill();
            p.beginShape();

            if (props.mode === "single") {
                // Only first partial
                for (let x = 0; x < width; x++) {
                    const theta = p.map(x, 0, width, 0, p.TWO_PI * 2);
                    const ratio = props.currentSystem.ratios[0];

                    const wave = getWaveValue(
                        props.currentWaveform,
                        ratio * theta,
                        props.customWaveCoefficients?.[props.currentWaveform]
                    );
                    const y = height / 2 - wave * ampScale;
                    p.vertex(x, y);
                }
            } else {
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
                const thetaScale = (p.TWO_PI * fullPeriodMultiplier) / width;

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
                            sum += getWaveValue(
                                props.currentWaveform,
                                harmonicPhase,
                                component.props.customWaveCoefficients?.[props.currentWaveform]
                            ) * amp;
                            totalAmp += amp;
                        }
                    }

                    const y = height / 2 - (sum / (totalAmp || 1)) * ampScale;
                    p.vertex(x, y);
                }

            }

            p.endShape();
        };
    };
}

/**
 * WaveformComponent
 * Displays a live waveform preview using p5.js
 */
export default class WaveformComponent extends BaseComponent {
    constructor(elementId) {
        super(elementId);
        this._waveformP5 = null;
        this.props = {};
    }

    /**
     * Render waveform with new props
     * @param {object} props - Includes p5Instance, currentWaveform, harmonicAmplitudes, currentSystem
     */
    render(props) {
        this.props = props;

        if (!props.p5Instance) {
            requestAnimationFrame(() => this.render(props));
            return;
        }

        if (!this._waveformP5) {
            // Create the sketch and its canvas exactly once
            const sketch = createWaveformSketch(this);
            this._waveformP5 = new p5(sketch, this.el);
        } else {
            // The sketch reads component.props at draw time — repaint only.
            // (Recreating the p5 instance per update leaks canvas contexts
            // and collapses under OSC/MIDI drawbar streams.)
            this._waveformP5.redraw();
        }
    }

    /**
     * Unbind tracked events; the p5 instance survives updates.
     */
    teardown() {
        super.teardown?.();
    }

    /**
     * Full cleanup — only for actually discarding the component.
     */
    destroy() {
        if (this._waveformP5?.remove) {
            this._waveformP5.remove();
            this._waveformP5 = null;
        }
        this.teardown();
    }
}
