// faviconService.js
// Dynamically updates the page favicon with a snapshot of the #tonewheel-container canvas every 2 seconds

export class FaviconService {
    constructor() {
        this.interval = null;
        this.faviconId = 'dynamic-favicon';
    }

    start() {
        if (this.interval) return; // Already running
        this.updateFavicon();
        this.interval = setInterval(() => this.updateFavicon(), 100);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    updateFavicon() {
        const container = document.getElementById('tonewheel-container');
        if (!container) return;
        // Find the first canvas inside the container
        const canvas = container.querySelector('canvas');
        if (!canvas) return;
        try {
            // Crop the inner 50% of the canvas and scale to favicon size
            const size = 128; // Favicon size
            const offscreen = document.createElement('canvas');
            offscreen.width = size;
            offscreen.height = size;
            const ctx = offscreen.getContext('2d');
            const srcW = canvas.width;
            const srcH = canvas.height;
            const cropX = srcW * 0.25;
            const cropY = srcH * 0.25;
            const cropW = srcW * 0.5;
            const cropH = srcH * 0.5;
            ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, size, size);
            // Optionally increase brightness by 100%
            const imageData = ctx.getImageData(0, 0, size, size);
            this.increaseBrightness(imageData.data, 128); // 128/255 ≈ 100% boost
            this.increaseContrast(imageData.data, 8);
            ctx.putImageData(imageData, 0, 0);
            const url = offscreen.toDataURL('image/png');
            this.setFavicon(url);

        } catch (e) {
            // Some canvases may be tainted by CORS; ignore errors
        }
    }

    // Increase brightness by adding to each RGB channel
    increaseBrightness(data, amount = 128) {
        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                data[i + c] = Math.max(0, Math.min(255, data[i + c] + amount));
            }
            // alpha channel unchanged
        }
    }

    increaseContrast(data, factor = 1.2) {
        const avgLuminance = 128;
        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                data[i + c] = Math.max(0, Math.min(255, avgLuminance + factor * (data[i + c] - avgLuminance)));
            }
            // alpha channel unchanged
        }
    }

    setFavicon(dataUrl) {
        // Remove all favicon <link> elements except the dynamic one
        const links = document.querySelectorAll('link[rel~="icon"]');
        links.forEach(l => {
            if (l.id !== this.faviconId) {
                l.parentNode.removeChild(l);
            }
        });
        let link = document.getElementById(this.faviconId);
        if (!link) {
            link = document.createElement('link');
            link.id = this.faviconId;
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/png';
        link.href = dataUrl;
    }
}

// Instantiate and start on page load
export const faviconService = new FaviconService();

// Optionally, auto-start if imported as a module in main app
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => faviconService.start());
}
