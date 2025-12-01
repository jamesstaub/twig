import { AppState, DRAWBAR_STYLES } from "../../config.js";
import BaseComponent from "../base/BaseComponent.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

export class DrawbarsComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.sliders = [];
    }

    render(props = {}) {
        this.el.innerHTML = "";
        this.sliders = [];

        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
    }

    /**
     * Called by BaseComponent AFTER render().
     */
    bindRenderedEvents() {
        this.sliders = this.qAll(DRAWBAR_SLIDER_SELECTOR);

        this.sliders.forEach(slider => {
            this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));
        });
    }

    setupDrawbars() {
        const numPartials = AppState.currentSystem.ratios.length;

        if (!Array.isArray(AppState.harmonicAmplitudes) ||
            AppState.harmonicAmplitudes.length !== numPartials) {

            AppState.harmonicAmplitudes = Array(numPartials).fill(0);
            AppState.harmonicAmplitudes[0] = 1.0;
        }

        for (let i = 0; i < numPartials; i++) {
            const value = AppState.harmonicAmplitudes[i];
            this.el.appendChild(this.createDrawbar(i, value));
        }
    }

    updateDrawbarLabels(isSubharmonic) {
        const labels = (isSubharmonic && AppState.currentSystem.subharmonicLabels)
            ? AppState.currentSystem.subharmonicLabels
            : AppState.currentSystem.labels;

        labels.forEach((txt, idx) => {
            const el = this.q(`#drawbar-label-${idx}`);
            this.updateContent(el, txt);
        });
    }

    createDrawbar(index, value) {
        const styleClass = DRAWBAR_STYLES[index] || "white";

        const wrapper = document.createElement("div");
        wrapper.className = `drawbar ${styleClass}`;

        const label = document.createElement("span");
        label.className = "drawbar-label";
        label.id = `drawbar-label-${index}`;
        this.updateContent(label, AppState.currentSystem.labels[index] || "");

        const track = document.createElement("div");
        track.className = "drawbar-track";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "drawbar-slider";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.01";
        slider.value = value;
        slider.dataset.index = index;

        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);

        wrapper.append(label, wrap);
        return wrapper;
    }

    handleDrawbarChange(e) {
        const index = Number(e.target.dataset.index);
        const value = Number(e.target.value);

        this.onChange?.(index, value);
        e.target.setAttribute("aria-valuenow", value);
    }

    setValue(index, value) {
        if (this.sliders[index]) {
            this.sliders[index].value = value;
        }
    }
}
