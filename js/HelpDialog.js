// HelpDialog.js
// Handles help modal logic

export class HelpDialog {
    static init() {
        const helpBtn = document.getElementById('help-button');
        const modal = document.getElementById('help-modal');
        const closeBtn = document.getElementById('close-help-modal');
        if (!helpBtn || !modal || !closeBtn) return;
        helpBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('hidden') && (e.code === 'Escape' || e.code === 'Enter')) {
                modal.classList.add('hidden');
            }
        });
    }
}
