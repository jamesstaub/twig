import BaseComponent from "../base/BaseComponent.js";


export class DownloadControlComponent extends BaseComponent {
    constructor(selector) {
        super(selector);
        this.onRoutingChange = null;
        this.onDownload = null;
    }

    render({ routingMode }) {
        // No need to render download button if hardcoded in index.html
        // Just update routing mode dropdown
        this.renderRoutingMode({ routingMode });
    }

    renderRoutingMode({ routingMode }) {
        // Update the dropdown to reflect the current routing mode
        const select = document.getElementById('routing-mode-select');
        if (select) {
            select.value = routingMode;
        }
    }

    bindRenderedEvents() {
        // Bind routing mode dropdown change
        const select = document.getElementById('routing-mode-select');
        if (select) {
            this.bindEvent(select, 'change', (e) => {
                this.onRoutingChange?.(e.target.value);
            });
        }

        // Bind download button click
        const downloadBtn = document.getElementById('export-wav-button');
        if (downloadBtn) {
            this.bindEvent(downloadBtn, 'click', () => {
                this.onDownload?.();
            });
        }
    }

    setRoutingMode(mode) {
        const select = document.getElementById('routing-mode-select');
        if (select) {
            select.value = mode;
        }
    }
}