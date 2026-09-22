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

const DEFAULT_HEIGHT = 150;

/**
 * Create a reusable p5 sketch for waveform drawing
 * @param {WaveformComponent} component - The component instance
 */
function createWaveformSketch(component) {
    return function (p) {
        component._waveformP5 = p;

        // The bitmap matches the container's box: its width always, and its
        // height where CSS gives the container one (the Source panel's
        // preview stretches with its panel) — an empty, unsized container
        // measures 0 and gets the default.
        const boxSize = () => ({
            width: component.el?.clientWidth || 400,
            height: component.el?.clientHeight || DEFAULT_HEIGHT,
        });

        p.setup = function () {
            const { width, height } = boxSize();
            p.createCanvas(width, height).parent(component.el);
            p.noLoop(); // Only redraw on demand
        };

        p.windowResized = function () {
            const { width, height } = boxSize();
            p.resizeCanvas(width, height);
            p.redraw();
        };
        // Container reflows that aren't window resizes (panel gating,
        // layout settling after load, a surface being shown) — keep the
        // bitmap at the real size
        if (typeof ResizeObserver !== "undefined" && component.el) {
            // Resizing the canvas inside the callback would itself change the
            // observed box in the same frame ("ResizeObserver loop" errors) —
            // defer to the next frame instead
            let last = boxSize();
            new ResizeObserver(() => {
                const next = boxSize();
                if (!component.el.clientWidth || (next.width === last.width && next.height === last.height)) return;
                last = next;
                requestAnimationFrame(() => p.windowResized());
            }).observe(component.el);
        }

        p.draw = function () {
            const props = component.props;
            if (!props?.harmonicAmplitudes?.length) return;

            const width = p.width;
            const height = p.height;
            const ampScale = height * 0.4;

            p.background(themeColor("--viz-bg"));
            p.stroke(themeColor("--viz-grid"));
            p.strokeWeight(1);
            p.line(0, height / 2, width, height / 2);

            // A preset crossfade between two waveforms: the pair and how far
            // between them (see AppState.waveformMorph)
            const morph = props.waveformMorph;
            const value = (name, phase) => getWaveValue(name, phase, props.customWaveCoefficients?.[name]);
            const trace = themeColor("--viz-trace");
            p.strokeWeight(2);
            p.noFill();

            if (props.mode === "single") {
                // Only first partial — mid-morph, both waves overlaid, each as
                // opaque as its share of the mix
                const ratio = props.currentSystem.ratios[0];
                const layers = morph
                    ? [[morph.a, 1 - morph.t], [morph.b, morph.t]]
                    : [[props.currentWaveform, 1]];
                for (const [name, share] of layers) {
                    const color = p.color(trace);
                    color.setAlpha(Math.round(255 * Math.max(0.08, share)));
                    p.stroke(color);
                    p.beginShape();
                    for (let x = 0; x < width; x++) {
                        const theta = p.map(x, 0, width, 0, p.TWO_PI * 2);
                        p.vertex(x, height / 2 - value(name, ratio * theta) * ampScale);
                    }
                    p.endShape();
                }
                return;
            }

            p.stroke(trace);
            p.beginShape();
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
                            // The sum sounds the morph's mix, so draw that
                            const wave = morph
                                ? value(morph.a, harmonicPhase) * (1 - morph.t) + value(morph.b, harmonicPhase) * morph.t
                                : value(props.currentWaveform, harmonicPhase);
                            sum += wave * amp;
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
     * @param {object} props - Includes currentWaveform, harmonicAmplitudes, currentSystem
     */
    render(props) {
        this.props = props;

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
