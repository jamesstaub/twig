import SliderComponent from "./SliderComponent.js";
import { SliderActions } from "./sliderActions.js";

/**
 * Generic SliderController
 * Usage: new SliderController(selector, props, onChange)
 */
export class SliderController {
    constructor(selector, props = {}, onChange = null) {
        this.component = new SliderComponent(selector);
        this.props = props;
        this.onChange = onChange;
    }

    init() {
        this.render(this.props);
    }

    render(props = {}) {
        this.props = props;
        this.component.render({
            ...props,
            onChange: (value) => {
                if (typeof this.onChange === "function") {
                    this.onChange(value);
                }
            }
        });
    }

    setValue(value) {
        const clamped = SliderActions.clamp(value, this.props.min, this.props.max);
        this.render({ ...this.props, value: clamped });
    }

    teardown() {
        this.component.teardown();
    }
}
