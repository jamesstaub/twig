// js/modules/base/BaseComponent.js
var BaseComponent = class {
  /**
      * @param {HTMLElement|string} target - Element or query selector.
      */
  constructor(target) {
    if (typeof target === "string") {
      this.el = document.querySelector(target);
      this.selector = target;
    } else {
      this.el = target;
    }
    if (!this.el) {
      throw new Error(`BaseComponent: Target element "${target}" not found.`);
    }
    this._boundEvents = [];
  }
  /**
   * Bind an event handler and automatically track it for cleanup.
   * @param {HTMLElement} el
   * @param {string} evt
   * @param {Function} handler
   * @param {AddEventListenerOptions} [options]
   */
  bindEvent(el, evt, handler, options) {
    if (!el) return;
    el.addEventListener(evt, handler, options);
    this._boundEvents.push({ el, evt, handler, options });
  }
  /**
   * Remove all events previously bound via bindEvent().
   */
  unbindAll() {
    for (const { el, evt, handler, options } of this._boundEvents) {
      el.removeEventListener(evt, handler, options);
    }
    this._boundEvents.length = 0;
  }
  /**
   * Called automatically before every render and when a controller tears
   * down a component. Subclasses can override for additional cleanup.
   */
  teardown() {
    this.unbindAll();
  }
  /**
   * Optional helper to update text or HTML content.
   * @param {HTMLElement} el
   * @param {string} content
   * @param {object} options
   * @param {boolean} options.asHTML
   */
  updateContent(el, content = "", { asHTML = false } = {}) {
    if (!el) return;
    if (asHTML) el.innerHTML = content;
    else el.textContent = content;
  }
  /**
   * Subclasses MUST implement:
   *    render(props)
   *
   * Should update DOM inside this.el. Call teardown() before rewriting DOM
   * if render() replaces or regenerates child elements.
   *
   * Subclasses MAY optionally implement:
   *    bindRenderedEvents()
   *    teardown()
   */
  render(_props) {
    throw new Error("render() must be implemented in subclass");
  }
  /**
   * q(selector)
   * -----------------------------------------------------------------------------
   * Convenience wrapper for querySelector(), scoped to this component's root.
   *
   * @param {string} selector  CSS selector
   * @return {Element|null}
   */
  q(selector) {
    return this.el.querySelector(selector);
  }
  /**
   * qAll(selector)
   * -----------------------------------------------------------------------------
   * querySelectorAll(), returned as a normal Array instead of a NodeList.
   *
   * @param {string} selector  CSS selector
   * @return {Array<Element>}
   */
  qAll(selector) {
    return Array.from(this.el.querySelectorAll(selector));
  }
};

export {
  BaseComponent
};
