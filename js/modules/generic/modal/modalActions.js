// modalActions.js
// Generic modal actions for opening/closing the modal

import { ValueTip } from '../valueTip.js';

// The currently-mounted modal, so closeModal() can tear it down properly —
// clearing #modal-root's innerHTML alone skips any cleanup a component's
// teardown() does beyond removing its own DOM (e.g. MidiMappingModalComponent
// unregisters a document-level Escape-key listener there; without this,
// every open+close leaked one).
let currentModal = null;

/**
 * Open a modal by rendering a ModalComponent into #modal-root.
 * @param {ModalComponent} modalComponent - The ModalComponent instance.
 * @param {Object} props - Props to pass to the modal's render method.
 */
export function openModal(modalComponent, props) {
    const root = document.getElementById('modal-root');
    if (!root) throw new Error('No #modal-root found in DOM');
    // Defensive: a caller opening a new modal without closing the previous
    // one would otherwise leak it the same way closeModal() used to.
    if (currentModal && currentModal !== modalComponent) {
        currentModal.teardown?.();
    }
    // A tip left over the drawbar strip (or wherever it last showed) would
    // otherwise render above the modal (it's a higher z-index) and, once
    // interactive, keep intercepting clicks after the modal closes too.
    ValueTip.hide();
    currentModal = modalComponent;
    modalComponent.el = root;
    modalComponent.render(props);
}

/**
 * Close the modal: tear down the mounted component, then clear #modal-root.
 */
export function closeModal() {
    currentModal?.teardown?.();
    currentModal = null;
    ValueTip.hide();
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
}
