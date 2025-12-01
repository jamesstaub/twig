// WaveformComponent.js
import BaseComponent from "../base/BaseComponent.js";


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

            p.background("#0d131f");
            p.stroke("#374151");
            p.strokeWeight(1);
            p.line(0, height / 2, width, height / 2);

            p.stroke("#10b981");
            p.strokeWeight(2);
            p.noFill();
            p.beginShape();

            if (props.mode === "single") {
                // Only first partial
                for (let x = 0; x < width; x++) {
                    const theta = p.map(x, 0, width, 0, p.TWO_PI * 2);
                    const ratio = props.currentSystem.ratios[0];

                    console.log('single: currentWaveform', props.currentWaveform)
                    const wave = props.p5Instance.getWaveValue(props.currentWaveform, ratio * theta);
                    const y = height / 2 - wave * ampScale;
                    p.vertex(x, y);
                }
            } else {
                // Summed waveform
                for (let x = 0; x < width; x++) {
                    const theta = p.map(x, 0, width, 0, p.TWO_PI * 2);
                    let sum = 0;
                    let maxAmp = 0;
                    for (let h = 0; h < props.harmonicAmplitudes.length; h++) {
                        const ratio = props.currentSystem.ratios[h];
                        const amp = props.harmonicAmplitudes[h] || 0;
                        sum += props.p5Instance.getWaveValue(props.currentWaveform, ratio * theta) * amp;
                        maxAmp += amp;
                    }
                    const y = height / 2 - (sum / (maxAmp || 1)) * ampScale;
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

        // Always teardown before render to ensure only one canvas exists
        this.teardown();

        if (!props.p5Instance) {
            requestAnimationFrame(() => this.render(props));
            return;
        }
        const sketch = createWaveformSketch(this);
        console.log('render', props.currentWaveform)
        // Use this.el as the parent container for the canvas
        this._waveformP5 = new p5(sketch, this.el);
    }

    /**
     * Clean up p5 instance and any other resources
     */
    teardown() {
        if (this._waveformP5?.remove) {
            this._waveformP5.remove();
            this._waveformP5 = null;
        }
        super.teardown?.();
    }
}
