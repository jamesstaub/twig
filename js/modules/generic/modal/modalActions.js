// modalActions.js
// Generic modal actions for opening/closing the modal

/**
 * Open a modal by rendering a ModalComponent into #modal-root.
 * @param {ModalComponent} modalComponent - The ModalComponent instance.
 * @param {Object} props - Props to pass to the modal's render method.
 */
export function openModal(modalComponent, props) {
    const root = document.getElementById('modal-root');
    if (!root) throw new Error('No #modal-root found in DOM');
    modalComponent.el = root;
    modalComponent.render(props);
}

/**
 * Close the modal by clearing #modal-root.
 */
export function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
}
