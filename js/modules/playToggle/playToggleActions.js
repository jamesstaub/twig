import { AppState } from "../../config.js";
import { startTone, stopTone } from "../../audio.js";
import { showStatus } from "../../domUtils.js";
import { PLAY_STATE_CHANGED } from "../../events.js";

export const PlayToggleActions = {
    async toggle() {
        if (AppState.isPlaying) {
            stopTone();
            document.dispatchEvent(new CustomEvent(PLAY_STATE_CHANGED, {
                detail: { isPlaying: false }
            }));
        } else {
            try {
                await startTone();
                document.dispatchEvent(new CustomEvent(PLAY_STATE_CHANGED, {
                    detail: { isPlaying: true }
                }));
            } catch (error) {
                console.error('Failed to start tone:', error);
                showStatus('Failed to start audio. Please check browser permissions.', 'error');
            }
        }
    }
};
