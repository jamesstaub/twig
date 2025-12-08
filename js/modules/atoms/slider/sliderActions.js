// sliderActions.js
// Generic actions for slider logic (can be extended for more complex use cases)

export const SliderActions = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
};
