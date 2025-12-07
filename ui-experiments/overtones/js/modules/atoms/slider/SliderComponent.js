import BaseComponent from "../../base/BaseComponent.js";

/**
 * Generic, minimal slider component
 * Props: { min, max, step, value, label, onChange }
 */
export default class SliderComponent extends BaseComponent {
    constructor(target) {
        super(target);
        this.input = null;
        this.labelEl = null;
    }

    /**
     * Render the slider UI
     * @param {object} props - { min, max, step, value, label, onChange }
     */
    render(props = {}) {
        this.teardown();
        this.props = props;
        this.el.innerHTML = "";

        // Label
        if (props.label) {
            this.labelEl = document.createElement("label");
            this.labelEl.textContent = props.label;
            this.labelEl.className = "slider-label text-blue-300 text-xs md:text-sm font-medium mr-1";
            this.el.appendChild(this.labelEl);
        }

        // Input
        this.input = document.createElement("input");
        this.input.type = "range";
        this.input.min = props.min ?? 0;
        this.input.max = props.max ?? 1;
        this.input.step = props.step ?? 0.01;
        this.input.value = props.value ?? 0;
        this.input.className = "slider-input w-16 md:w-24 accent-blue-400 bg-transparent rounded h-1 mx-1";
        this.el.appendChild(this.input);

        // Value display (optional, for accessibility)
        this.valueDisplay = document.createElement("span");
        this.valueDisplay.className = "slider-value text-blue-300 text-xs md:text-sm font-medium mr-1 min-w-8";
        const formatValue = typeof props.formatValue === "function" ? props.formatValue : (v) => v;
        this.valueDisplay.textContent = formatValue(props.value ?? "");
        this.el.appendChild(this.valueDisplay);

        // Event binding
        if (typeof props.onChange === "function") {
            this.bindEvent(this.input, "input", (e) => {
                this.valueDisplay.textContent = formatValue(e.target.value);
                props.onChange(parseFloat(e.target.value));
            });
        }
    }

    teardown() {
        super.teardown();
        this.input = null;
        this.labelEl = null;
        this.valueDisplay = null;
    }
}
