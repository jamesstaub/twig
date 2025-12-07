import { exportAsWAV, sampleCurrentWaveform } from '../../audio.js';
import { AppState, updateAppState } from '../../config.js';
import { showStatus } from '../../domUtils.js';
import { ROUTING_MODE_CHANGED } from '../../events.js';


export const DownloadControlActions = {
    setRoutingMode(mode) {
        if (AppState.audioRoutingMode !== mode) {
            updateAppState({ audioRoutingMode: mode });
            document.dispatchEvent(new CustomEvent(ROUTING_MODE_CHANGED, { detail: { mode } }));
        }
    },

    handleExportWAV(routingMode, isSubharmonic) {
        sampleCurrentWaveform(routingMode, isSubharmonic)
            .then(sampled => {
                exportAsWAV(sampled, 1);
            })
            .catch(error => {
                console.error('Failed to sample waveform for export:', error);
                showStatus('Failed to sample waveform for export', 'error');
            });
    }

};

