import { AppState, DRAWBAR_STYLES } from "../../config.js";
import BaseComponent from "../base/BaseComponent.js";

export class DrawbarsComponent extends BaseComponent {
    constructor(containerId) {
        super();
        this.container = document.getElementById(containerId);
        this.sliders = [];
    }

    // TODO always pass in app state via render props
    render(props = {}) {
        this.sliders = [];
        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
    }

    setupDrawbars() {
        this.container.innerHTML = '';
        const numPartials = AppState.currentSystem.ratios.length;

        if (!Array.isArray(AppState.harmonicAmplitudes) || AppState.harmonicAmplitudes.length !== numPartials) {
            AppState.harmonicAmplitudes = Array(numPartials).fill(0);
            AppState.harmonicAmplitudes[0] = 1.0;
        }

        for (let i = 0; i < numPartials; i++) {
            const drawbarDiv = this.createDrawbar(i, AppState.harmonicAmplitudes[i]);
            this.container.appendChild(drawbarDiv);
            this.sliders.push(drawbarDiv.querySelector('input'));
        }
    }

    updateDrawbarLabels(isSubharmonic) {
        // If isSubharmonic, use alternate labels if available
        const labels = (isSubharmonic && AppState.currentSystem.subharmonicLabels)
            ? AppState.currentSystem.subharmonicLabels
            : AppState.currentSystem.labels;
        labels.forEach((label, index) => {
            const labelEl = document.getElementById(`drawbar-label-${index}`);
            this.updateContent(labelEl, label);
        });
    }

    createDrawbar(index, value) {
        const styleClass = DRAWBAR_STYLES[index] || 'white';
        const initialValue = AppState.harmonicAmplitudes[index];

        const drawbarDiv = document.createElement('div');
        drawbarDiv.className = `drawbar ${styleClass}`;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'drawbar-label';
        labelSpan.id = `drawbar-label-${index}`;
        this.updateContent(labelSpan, AppState.currentSystem.labels[index] || '');

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'drawbar-input-wrapper';

        const trackDiv = document.createElement('div');
        trackDiv.className = 'drawbar-track';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'drawbar-slider';
        input.min = '0';
        input.max = '1';
        input.step = '0.01';
        input.value = value;
        input.dataset.index = index;

        this.bindEvent(input, 'input', this.handleDrawbarChange);

        inputWrapper.appendChild(trackDiv);
        inputWrapper.appendChild(input);
        drawbarDiv.appendChild(labelSpan);
        drawbarDiv.appendChild(inputWrapper);

        return drawbarDiv;
    }

    handleDrawbarChange(e) {
        const index = parseInt(e.target.dataset.index);
        const value = parseFloat(e.target.value);
        this.onChange?.(index, value);
        e.target.setAttribute('aria-valuenow', value);
    }

    setValue(index, value) {
        if (this.sliders[index]) this.sliders[index].value = value;
    }
}
