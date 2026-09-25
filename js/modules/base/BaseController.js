/**
 * BaseController
 * ---------------
 * A thin orchestrator between AppState and a visual Component.
 * Controllers do NOT touch DOM directly — they:
 *   - create a component instance
 *   - compute props via getProps()
 *   - call component.render(props)
 *   - bind component-level events (via component.onX assignments)
 *   - bind global events (document/window listeners)
 *
 * Lifecycle:
 *   1. constructor() → createComponent() (must return a BaseComponent subclass)
 *   2. init()
 *       - bindComponentEvents()
 *       - bindExternalEvents()
 *       - update()   (renders with fresh props)
 *
 * You can safely call update() whenever app state changes.
 */

export class BaseController {
    constructor(selector) {
        if (typeof this.createComponent !== "function") {
            throw new Error("Subclass must implement createComponent(selector)");
        }

        this.selector = selector;
        this.component = this.createComponent(selector);

        if (!this.component) {
            throw new Error("createComponent() must return a component instance");
        }
    }


    /**
     * Initialize controller lifecycle. Call this once after construction.
     */
    init() {
        this.bindComponentEvents();
        this.bindExternalEvents();
        this.update(); // first render with fresh props
        BaseController.mounted.add(this);
    }


    /**
     * Subclasses MUST implement this to return props derived from app state.
     */
    getProps() {
        throw new Error("Subclass must implement getProps()");
    }


    /**
     * Re-render the component with fresh props.
     * Safe to call any time state changes.
     */
    update() {
        const props = this.getProps();
        if (this.component.teardown) this.component.teardown();
        this.component.render(props);
        if (typeof this.component.bindRenderedEvents === 'function') {
            this.component.bindRenderedEvents();
        }
        return props; // <-- return so child can reuse
    }



    /**
     * Coalesced update: any number of calls within one frame produce a
     * single render on the next animation frame. Use for events that can
     * arrive in floods (drawbar streams from OSC/MIDI) where re-rendering
     * per event would saturate the main thread. Audio must NOT wait on
     * this — it renders visuals only, and rAF may be throttled or stopped
     * entirely while the page is hidden (background tab, occluded jweb).
     *
     * A panel that is NOT ON SCREEN (its surface isn't showing) is not
     * rendered at all: the work is remembered and done once, when the
     * surface appears. Most controllers listen to app-wide events — a
     * fundamental sweep used to re-render every overtone of the hidden
     * Trigger pads on every step. Anything that must run while hidden
     * should call update() directly.
     */
    scheduleUpdate() {
        if (this.hidden()) {
            this._updateDeferred = true;
            return;
        }
        if (this._updatePending) return;
        this._updatePending = true;
        requestAnimationFrame(() => {
            this._updatePending = false;
            this.update();
        });
    }

    /**
     * Is the component's root off screen? Only asked on the coalesced
     * path, and only of a mounted element: `offsetParent` is null for a
     * `display:none` subtree, which is how the surface shell hides panels.
     */
    hidden() {
        const el = this.component?.el;
        return Boolean(el && !el.offsetParent && el !== document.body);
    }

    /**
     * Render now if an update was skipped while this panel was hidden.
     * The surfaces controller calls this on every surface change.
     */
    flushDeferredUpdate() {
        if (!this._updateDeferred || this.hidden()) return;
        this._updateDeferred = false;
        this.update();
    }

    /**
     * Subclasses MAY override this to wire component-level events, e.g.:
     *   this.component.onChange = (value) => {...}
     *
     *   TODO: consider instead passing in functions as props to the render method
     */
    bindComponentEvents() { }


    /**
     * Subclasses MAY override this to bind global events (ex: document listeners)
     * TODO: need to add cleanup for events bound here. 
     * almost always calls this.update() so it could be streamlined
     */
    bindExternalEvents() { }


    /**
     * Optional destruction (future-proofing)
     */
    destroy() {
        BaseController.mounted.delete(this);
        if (this.component.teardown) {
            this.component.teardown();
        }
    }
}

/**
 * Every live controller, so the surfaces controller can flush the ones
 * whose panels were hidden when their state changed.
 */
BaseController.mounted = new Set();

/** Render every controller that skipped an update while it was hidden. */
export function flushHiddenControllers() {
    for (const controller of BaseController.mounted) controller.flushDeferredUpdate();
}
