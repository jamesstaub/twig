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
            // Mouse / keyboard: use native range input event
            this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));

            // Touch: custom vertical-drag handler.
            //
            // The slider is rotated -90deg in CSS so it renders vertically, but
            // the browser's native touch tracking uses the element's pre-rotation
            // coordinate space — meaning only a fraction of finger movement
            // registers. We bypass that entirely by:
            //   1. Attaching listeners to the wrapper (the visual 140×25px area)
            //      whose getBoundingClientRect() is already in screen coordinates.
            //   2. Mapping touchY directly to value (top = max, bottom = min).
            //   3. Calling preventDefault() to block container scroll.
            const wrapper = slider.parentElement; // .drawbar-input-wrapper

            let dragStartY = 0;
            let dragStartValue = 0;

            this.bindEvent(wrapper, "touchstart", (e) => {
                e.preventDefault();
                dragStartY = e.touches[0].clientY;
                dragStartValue = parseFloat(slider.value);
            }, { passive: false });

            this.bindEvent(wrapper, "touchmove", (e) => {
                e.preventDefault();
                const rect = wrapper.getBoundingClientRect();
                const touchY = e.touches[0].clientY;
                // Clamp touch within wrapper bounds, then map to [0, 1].
                // Top of wrapper = max (1), bottom = min (0).
                const clampedY = Math.max(rect.top, Math.min(rect.bottom, touchY));
                const newValue = 1 - (clampedY - rect.top) / rect.height;
                slider.value = newValue;
                slider.setAttribute("aria-valuenow", newValue);
                const index = Number(slider.dataset.index);
                this.onChange?.(index, newValue);
            }, { passive: false });
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
        // Disable browser touch handling for the entire drawbar column (label
        // area included) so our custom touch handler gets every gesture.
        wrapper.style.touchAction = 'pan-x';

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
        // Override CSS touch-action: pan-x so the browser doesn't intercept
        // the gesture before our touchstart fires.
        slider.style.touchAction = 'pan-x';

        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);

        wrapper.append(label, wrap);
        return wrapper;
    }

    updateSingleDrawbar(index, value) {
        // rather than a full rerender, just set one slider value
        if (this.sliders[index]) {
            this.sliders[index].value = value;
        }
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
