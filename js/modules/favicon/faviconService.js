// faviconService.js
// The page favicon as a live thumbnail of the tonewheel.

import { PLAY_STATE_CHANGED } from '../../events.js';
import { layoutMode } from '../layout/layoutMode.js';

/**
 * How often the thumbnail is refreshed. It is a real cost — a crop, a
 * pixel pass and a PNG encode per frame — so a touch device (where the
 * tab strip rarely shows the icon anyway, and the CPU budget is the
 * audio's) gets a slow refresh while a desktop gets an animated one.
 */
const DESKTOP_INTERVAL_MS = 100;
const MOBILE_INTERVAL_MS = 2000;

/** Thumbnail size — favicons are displayed at 16-32px, drawn at 2x for retina. */
const SIZE = 64;

export class FaviconService {
    constructor() {
        this.interval = null;
        this.faviconId = 'dynamic-favicon';
        // One scratch canvas for the life of the page, not one per frame
        this.scratch = null;
        this.ctx = null;
        this.imageData = null;
    }

    /**
     * Follow the sound: the icon animates only while the synth is playing.
     * Nothing is drawn (and no timer runs) before the first Play, which
     * keeps page load and an idle tab free of it entirely.
     */
    init() {
        document.addEventListener(PLAY_STATE_CHANGED, (e) => {
            if (e.detail?.isPlaying) this.start();
            else this.stop();
        });
        // A hidden tab's icon can't be seen, and its timers are throttled
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
            else if (this.playing) this.start();
        });
    }

    get playing() {
        return Boolean(this._playing);
    }

    start() {
        this._playing = true;
        if (this.interval || document.hidden) return;
        const period = layoutMode.coarse ? MOBILE_INTERVAL_MS : DESKTOP_INTERVAL_MS;
        this.updateFavicon();
        this.interval = setInterval(() => this.updateFavicon(), period);
    }

    stop(playing = false) {
        this._playing = playing;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    updateFavicon() {
        const canvas = document.querySelector('#tonewheel-container canvas');
        if (!canvas || !canvas.width) return;
        try {
            if (!this.scratch) {
                this.scratch = document.createElement('canvas');
                this.scratch.width = this.scratch.height = SIZE;
                this.ctx = this.scratch.getContext('2d', { willReadFrequently: true });
            }
            const ctx = this.ctx;
            // Crop the inner 50% of the tonewheel and scale to the icon
            const cropW = canvas.width * 0.5;
            const cropH = canvas.height * 0.5;
            ctx.drawImage(canvas, canvas.width * 0.25, canvas.height * 0.25, cropW, cropH, 0, 0, SIZE, SIZE);

            // Lift the thumbnail out of the dark background: the same
            // brightness/contrast the icon has always had, in one pass
            const image = ctx.getImageData(0, 0, SIZE, SIZE);
            const data = image.data;
            for (let i = 0; i < data.length; i += 4) {
                for (let c = 0; c < 3; c++) {
                    const lifted = Math.min(255, data[i + c] + 50);
                    data[i + c] = Math.max(0, Math.min(255, 128 + 2 * (lifted - 128)));
                }
            }
            ctx.putImageData(image, 0, 0);

            this.setFavicon(this.scratch.toDataURL('image/png'));
        } catch {
            // Some canvases may be tainted by CORS; ignore errors
        }
    }

    setFavicon(dataUrl) {
        let link = document.getElementById(this.faviconId);
        if (!link) {
            // Drop the static icon(s) the page shipped with, once
            for (const l of document.querySelectorAll('link[rel~="icon"]')) l.remove();
            link = document.createElement('link');
            link.id = this.faviconId;
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = dataUrl;
    }
}

export const faviconService = new FaviconService();
