/**
 * DOM Utilities Module
 * Provides reusable helpers for DOM manipulation and event handling
 */

export function getElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element with id '${id}' not found`);
    return el;
}

export function updateText(id, text, html = false) {
    const el = getElement(id);
    if (el) {
        if (html) {
            el.innerHTML = text;
        } else {
            el.textContent = text;
        }
    }
}

export function updateValue(id, value) {
    const el = getElement(id);
    if (el) el.value = value;
}

export function setupEventListener(id, event, handler) {
    const el = getElement(id);
    if (el) el.addEventListener(event, handler);
}

export function showStatus(message, type = 'info') {
    const statusBox = getElement('status-message');
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.classList.remove('hidden', 'error', 'success', 'warning', 'info');
    statusBox.classList.add(type);
    setTimeout(() => {
        statusBox.classList.add('hidden');
    }, 4000);
}

export function addClass(id, className) {
    const el = getElement(id);
    if (el) el.classList.add(className);
}

export function removeClass(id, className) {
    const el = getElement(id);
    if (el) el.classList.remove(className);
}

export function setAttribute(id, attr, value) {
    const el = getElement(id);
    if (el) el.setAttribute(attr, value);
}

export function querySelectorAll(selector) {
    return document.querySelectorAll(selector);
}
