import { AppState, CANVAS_HEIGHT_RATIOS, updateAppState } from '../../config.js';
import { partialColor, themeColor } from '../../theme.js';
import { harmonicEnvelopeLevel, precomputeWaveTable } from '../../audio.js';
import { FIT, Sketch, strokeClosedPath, withAlpha } from '../generic/sketch/Sketch.js';

let spreadFactor = 1;
let baseRadius;
let maxAmplitudeRadial;
const baseRadiusRatio = 0.08;

/** The running tonewheel sketch (one per page). */
let sketch = null;

export const TonewheelActions = {
    /** Build the tonewheel sketch inside #tonewheel-canvas and start it. */
    initVisualization() {
        const container = document.getElementById('tonewheel-canvas');
        if (!container) return null;
        sketch?.destroy();
        sketch = new Sketch(container, {
            draw: drawTonewheel,
            fit: FIT.SQUARE,
            fallbackSize: window.innerWidth < 640 ? 320 : 800,
        });
        return sketch;
    },

    setVisualizationFrequency(freq) {
        // Set a variable that the animation loop reads each frame
        updateAppState({ visualizationFrequency: freq });
    },

    setSpreadFactor(value) {
        spreadFactor = value;
    },
    getSpreadFactor() {
        return spreadFactor;
    },
    clearCustomWaveCache() {
        waveformTables.clear();
    }
};

/**
 * The tonewheel: every sounding partial as a ring, its wave shape riding
 * the radius and the whole wheel turning at the visualization rate.
 *
 * The rings are lanes — evenly spaced between the hub and the outer
 * radius, one per ACTIVE partial — so a ring's distance from the centre
 * reads as its place in the series, and its ripple as its level.
 */
function drawTonewheel(ctx, sk) {
    const { width, height } = sk;
    updateDimensions(width, height);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = themeColor('--viz-bg-tonewheel');
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);

    // The hub. Closed, so the seam is a join rather than two line ends
    ctx.lineWidth = 1;
    ctx.strokeStyle = themeColor('--viz-grid');
    ctx.beginPath();
    ctx.ellipse(0, 0, baseRadius, baseRadius, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();

    const points = 360;
    const rotationSpeed = (AppState.visualizationFrequency * Math.PI * 2) / 60;
    drawIndividualPartials(ctx, points, sk.frameCount * rotationSpeed);

    ctx.restore();
}

function updateDimensions(width, height) {
    const radialHeight = height * CANVAS_HEIGHT_RATIOS.RADIAL;
    maxAmplitudeRadial = Math.min(width, radialHeight) * (1 - baseRadiusRatio) * 0.45;
    baseRadius = Math.min(width, radialHeight) * baseRadiusRatio;
}

/** Lane radius per active partial: evenly spaced out from the hub. */
function computeHarmonicLaneRadii({ harmonicAmplitudes, baseRadius, maxLaneHeight }) {
    const activeHarmonics = harmonicAmplitudes
        .map((amp, idx) => ({ amp, idx }))
        .filter(h => h.amp > 0);

    const num = activeHarmonics.length;
    const radii = new Array(harmonicAmplitudes.length);
    const laneSpacing = maxLaneHeight / num;

    let currentRadius = baseRadius;
    for (let i = 0; i < num; i++) {
        radii[activeHarmonics[i].idx] = currentRadius;
        currentRadius += laneSpacing;
    }
    return radii;
}

function drawIndividualPartials(ctx, points, currentAngle) {
    const type = AppState.currentWaveform;
    // Clamp to the current system: the grow-only amplitude store
    // can be longer than its partial table (hidden tail state)
    const numHarmonics = Math.min(
        AppState.harmonicAmplitudes.length,
        AppState.currentSystem.ratios.length
    );
    const laneRadii = computeHarmonicLaneRadii({
        harmonicAmplitudes: AppState.harmonicAmplitudes.slice(0, numHarmonics),
        baseRadius,
        maxLaneHeight: maxAmplitudeRadial
    });

    const thetaScale = (Math.PI * 2) / points;
    const ring = new Float64Array(points * 2);

    for (let h = 0; h < numHarmonics; h++) {
        const amp = AppState.harmonicAmplitudes[h];
        if (amp <= 0.001) continue;

        // In ADSR mode a voice is only audible while its envelope is
        // open — hide closed rings and fade with the live envelope.
        // Lane radii stay gain-based so rings don't reshuffle on
        // every trigger.
        const envLevel = harmonicEnvelopeLevel(h);
        if (envLevel <= 0.001) continue;

        const ratio = AppState.currentSystem.ratios[h];
        const ringRadius = laneRadii[h];
        const MAX_RING_MOD = 0.45;
        const visualAmp = MAX_RING_MOD * (maxAmplitudeRadial / numHarmonics) * spreadFactor * amp;

        // Tonewheel duality. Overtone mode: wheels on a common shaft,
        // tooth count = ratio (frequency = teeth × speed). Subharmonic
        // mode: teeth can't go below one, so — like the Hammond's gear
        // reductions — every wheel keeps ONE tooth and spins at
        // 1/ratio of the shaft. Depth in the series reads as slower
        // rotation, and each ring stays a crisp single cycle instead
        // of wrapping sub-cycles into mush.
        const teeth = AppState.isSubharmonic ? 1 : ratio;
        const spin = AppState.isSubharmonic ? currentAngle / ratio : currentAngle;

        // 0x99 at full envelope, as p5's setAlpha(153) was
        ctx.strokeStyle = withAlpha(partialColor(ratio), (153 * envLevel) / 255);
        ctx.lineWidth = 2;

        for (let i = 0; i < points; i++) {
            const theta = i * thetaScale;
            const waveValue = getWaveValue(type, theta * teeth, AppState.customWaveCoefficients?.[type]);

            const rotatedTheta = theta + spin;
            const r = ringRadius + waveValue * visualAmp;

            ring[i * 2] = r * Math.cos(rotatedTheta);
            ring[i * 2 + 1] = r * Math.sin(rotatedTheta);
        }
        strokeClosedPath(ctx, ring);
    }
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

