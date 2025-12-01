import BaseComponent from "../base/BaseComponent.js";

const WAVEFORM_CANVAS_AREA_ID = 'waveform-canvas-area';

export function createWaveformSketch({
    p5Instance,
    harmonicAmplitudes,
    currentSystem,
    currentWaveform
}) {
    return function (p) {
        p.setup = function () {
            const container = document.getElementById(WAVEFORM_CANVAS_AREA_ID);
            const w = container ? container.clientWidth : 400;
            const h = 150;
            p.createCanvas(w, h).parent(container ? WAVEFORM_CANVAS_AREA_ID : document.body);
        };

        p.windowResized = function () {
            const container = document.getElementById(WAVEFORM_CANVAS_AREA_ID);
            const w = container ? container.clientWidth : 400;
            const h = 150;
            p.resizeCanvas(w, h);
        };

        p.draw = function () {
            p.background('#0d131f');
            const mainP5 = p5Instance;
            const oscHeight = p.height;
            const ampScale = oscHeight * 0.4;
            p.noStroke();
            p.fill('#0d131f');
            p.rect(0, 0, p.width, p.height);
            p.stroke('#374151');
            p.strokeWeight(1);
            p.line(0, oscHeight / 2, p.width, oscHeight / 2);

            if (!mainP5 || !mainP5.getWaveValue) return;

            p.stroke('#10b981');
            p.strokeWeight(2);
            p.noFill();
            p.beginShape();
            const points = p.width;
            for (let x = 0; x < points; x++) {
                const theta = p.map(x, 0, points, 0, p.TWO_PI * 2);
                let summedWave = 0;
                let maxPossibleAmp = 0;
                for (let hIdx = 0; hIdx < harmonicAmplitudes.length; hIdx++) {
                    const ratio = currentSystem.ratios[hIdx];
                    const amp = harmonicAmplitudes[hIdx] || 0;
                    summedWave += mainP5.getWaveValue(currentWaveform, ratio * theta) * amp;
                    maxPossibleAmp += amp;
                }
                const normalizedWave = summedWave / (maxPossibleAmp || 1);
                const y = oscHeight / 2 - normalizedWave * ampScale;
                p.vertex(x, y);
            }
            p.endShape();
        };
    };
}


export default class WaveformComponent extends BaseComponent {
    render(props) {
        const tryCreateWaveform = () => {
            if (p5Instance && p5Instance.getWaveValue) {
                const waveformSketch = createWaveformSketch(props);
                new p5(waveformSketch, WAVEFORM_CANVAS_AREA_ID);
            } else {
                setTimeout(tryCreateWaveform, 100);
            }
        };
        tryCreateWaveform();

    }
}