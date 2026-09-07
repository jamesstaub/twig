import { AppState } from "../../config.js";
import { startTone, stopTone } from "../../audio.js";
import { showStatus } from "../../domUtils.js";

// startTone/stopTone dispatch PLAY_STATE_CHANGED themselves, so every
// start/stop path (this toggle, the bridge, sync-record restarts) updates
// the UI and the upstream bridge alike.
export const PlayToggleActions = {
    async toggle() {
        if (AppState.isPlaying) {
            stopTone();
        } else {
            try {
                await startTone();
            } catch (error) {
                console.error('Failed to start tone:', error);
                showStatus('Failed to start audio. Please check browser permissions.', 'error');
            }
        }
    }
};
