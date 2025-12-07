import { AppState, CANVAS_HEIGHT_RATIOS, HARMONIC_COLORS } from '../../config.js';
import { precomputeWaveTable } from '../../audio.js';

let spreadFactor = 1;
let baseRadius;
let maxAmplitudeRadial;
const baseRadiusRatio = 0.08;

export const TonewheelActions = {
    initVisualization() {
        if (window.p5) {
            const sketch = createVisualizationSketch();
            return new window.p5(sketch, 'tonewheel-canvas');
        }
        return null;
    },
    setSpreadFactor(value) {
        if (AppState.p5Instance && AppState.p5Instance.setSpreadFactor) {
            AppState.p5Instance.setSpreadFactor(value);
        }
    },
    getSpreadFactor() {
        if (AppState.p5Instance && AppState.p5Instance.getSpreadFactor) {
            return AppState.p5Instance.getSpreadFactor();
        }
        return 0.2;
    },
    clearCustomWaveCache() {
        if (AppState.p5Instance && AppState.p5Instance.clearCustomWaveCache) {
            AppState.p5Instance.clearCustomWaveCache();
        }
    }
};

function createVisualizationSketch() {
    return function (p) {
        AppState.p5Instance = p;

        p.setSpreadFactor = function (value) {
            spreadFactor = value;
        };
        p.getSpreadFactor = function () {
            return spreadFactor;
        };

        p.setup = function () {
            const container = document.getElementById('tonewheel-canvas');
            let w = container ? container.clientWidth : 800;
            let h = w;
            if (w === 0) {
                w = window.innerWidth < 640 ? 320 : 800;
                h = w;
                console.warn('Canvas container width was 0, using fallback width:', w);
            }
            p.createCanvas(w, h).parent(container ? 'tonewheel-canvas' : 'body');
            p.angleMode(p.RADIANS);
            updateDimensions();
        };

        function updateDimensions() {
            const radialHeight = p.height * CANVAS_HEIGHT_RATIOS.RADIAL;
            maxAmplitudeRadial = p.min(p.width, radialHeight) * (1 - baseRadiusRatio) * 0.45;
            baseRadius = p.min(p.width, radialHeight) * baseRadiusRatio;
        }

        p.updateDimensions = updateDimensions;

        p.customWaveTables = {};

        p.precomputeCustomWaveTable = function (coeffs) {
            const tableSize = 512;
            const table = new Float32Array(tableSize);
            for (let i = 0; i < tableSize; i++) {
                const theta = (i / tableSize) * p.TWO_PI;
                let sum = 0;
                for (let k = 1; k < coeffs.real.length && k < coeffs.imag.length; k++) {
                    sum += coeffs.real[k] * p.cos(k * theta) + coeffs.imag[k] * p.sin(k * theta);
                }
                table[i] = sum;
            }
            return table;
        };

        p.clearCustomWaveCache = function () {
            p.customWaveTables = {};
        };

        function computeHarmonicLaneRadii({ harmonicAmplitudes, baseRadius, maxLaneHeight }) {
            const activeHarmonics = harmonicAmplitudes
                .map((amp, idx) => ({ amp, idx }))
                .filter(h => h.amp > 0);

            const num = activeHarmonics.length;
            const radii = new Array(harmonicAmplitudes.length);

            const laneSpacing = maxLaneHeight / num;

            let currentRadius = baseRadius;
            for (let i = 0; i < num; i++) {
                const hIdx = activeHarmonics[i].idx;
                radii[hIdx] = currentRadius;
                currentRadius += laneSpacing;
            }

            return radii;
        }

        function drawRadialDisplay() {
            p.push();
            p.translate(p.width / 2, p.height / 2);

            p.noFill();
            p.stroke('#374151');
            p.ellipse(0, 0, baseRadius * 2, baseRadius * 2);

            const points = 360;
            const rotationSpeed = (AppState.visualizationFrequency * p.TWO_PI) / 60;
            const currentAngle = p.frameCount * rotationSpeed;

            drawIndividualPartials(points, currentAngle);

            p.pop();
        }

        const getHarmonicPhase = (ratio, theta) => AppState.isSubharmonic ? theta / ratio : theta * ratio;

        function drawIndividualPartials(points, currentAngle) {
            const type = AppState.currentWaveform;
            const numHarmonics = AppState.harmonicAmplitudes.length;
            const laneRadii = computeHarmonicLaneRadii({
                harmonicAmplitudes: AppState.harmonicAmplitudes,
                baseRadius,
                maxLaneHeight: maxAmplitudeRadial
            });

            for (let h = 0; h < numHarmonics; h++) {
                const amp = AppState.harmonicAmplitudes[h];
                if (amp <= 0.001) continue;

                const ratio = AppState.currentSystem.ratios[h];
                const ringRadius = laneRadii[h];

                const MAX_RING_MOD = 0.45;
                const visualAmp = MAX_RING_MOD * (maxAmplitudeRadial / numHarmonics) * spreadFactor * amp;

                p.stroke(p.color(HARMONIC_COLORS[h] + '99'));
                p.strokeWeight(2);
                p.noFill();
                p.beginShape();

                for (let i = 0; i < points; i++) {
                    let theta = p.map(i, 0, points, 0, p.TWO_PI);
                    let harmonicPhase = getHarmonicPhase(ratio, theta);
                    let waveValue = getWaveValue(type, harmonicPhase, AppState.customWaveCoefficients?.[type]);

                    let rotatedTheta = theta + currentAngle;
                    let r = ringRadius + waveValue * visualAmp;

                    let x = r * p.cos(rotatedTheta);
                    let y = r * p.sin(rotatedTheta);
                    p.vertex(x, y);
                }

                p.endShape(p.CLOSE);
            }
        }

        p.draw = function () {
            p.clear();
            updateDimensions();
            drawRadialDisplay();
        };

        p.windowResized = function () {
            const container = document.getElementById('tonewheel-canvas');
            let w = container ? container.clientWidth : 800;
            let h = w;
            if (w === 0) {
                w = window.innerWidth < 640 ? 320 : 800;
                h = w;
            }
            p.resizeCanvas(w, h);
            updateDimensions();
        };
    };
}

const waveformTables = new Map();
const TABLE_SIZE = 512;

export function getWaveValue(type, theta, customCoeffs) {
    if (type && type.startsWith('custom')) {
        const key = type;
        if (!waveformTables.has(key) && customCoeffs) {
            waveformTables.set(key, precomputeWaveTable(customCoeffs, TABLE_SIZE));
        }

        const table = waveformTables.get(key);
        if (!table) return Math.sin(theta);

        const normalizedTheta = (theta % (2 * Math.PI)) / (2 * Math.PI);
        const index = normalizedTheta * (table.length - 1);
        const low = Math.floor(index);
        const high = Math.ceil(index);
        const frac = index - low;

        return low === high ? table[low] : table[low] * (1 - frac) + table[high] * frac;
    }

    switch (type) {
        case 'sine': return Math.sin(theta);
        case 'square': {
            let sum = 0;
            const terms = 16;
            for (let n = 1; n < terms * 2; n += 2) sum += (1 / n) * Math.sin(theta * n);
            return sum * (4 / Math.PI) * 0.7;
        }
        case 'sawtooth': {
            let sum = 0;
            const terms = 16;
            for (let n = 1; n <= terms; n++) sum += (1 / n) * Math.sin(theta * n);
            return sum * (2 / Math.PI) * 0.7;
        }
        case 'triangle': {
            let sum = 0;
            const terms = 16;
            for (let n = 1; n < terms * 2; n += 2) {
                const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
                sum += (sign / (n * n)) * Math.sin(theta * n);
            }
            return sum * (8 / (Math.PI * Math.PI)) * 0.7;
        }
        default: return Math.sin(theta);
    }
}
