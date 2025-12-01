import { restartAudio } from "../../audio.js";
import { AppState, updateAppState } from "../../config.js";

export const CURRENT_WAVEFORM_CHANGED = 'currentWaveformChanged';

export function handleWaveformChange(e) {
    const currentWaveform = e.target.value

    updateAppState({ currentWaveform });

    document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED, {
        detail: { currentWaveform }
    }));

    if (AppState.isPlaying) {
        restartAudio();
    }
}
