import BaseComponent from "../base/BaseComponent";

// Define the 12 chromatic notes
const notes = [
    { name: 'C', class: 'white', index: 0 },
    { name: 'C#', class: 'black', index: 1 },
    { name: 'D', class: 'white', index: 2 },
    { name: 'D#', class: 'black', index: 3 },
    { name: 'E', class: 'white', index: 4 },
    { name: 'F', class: 'white', index: 5 },
    { name: 'F#', class: 'black', index: 6 },
    { name: 'G', class: 'white', index: 7 },
    { name: 'G#', class: 'black', index: 8 },
    { name: 'A', class: 'white', index: 9 },
    { name: 'A#', class: 'black', index: 10 },
    { name: 'B', class: 'white', index: 11 },
];

export class FundamentalComponent extends BaseComponent {
    render() {
        const keyboard = document.getElementById('piano-keyboard');
        if (!keyboard) return;

        keyboard.innerHTML = ''; // Clear existing keys
        this.keys = [];
        notes.forEach(note => {
            const key = document.createElement('div');
            key.className = `key ${note.class}`;
            key.textContent = note.name;
            key.dataset.noteIndex = note.index;
            this.keys.push(key);
            keyboard.appendChild(key);
        });

    }

    bindRenderedEvents() {
        // Frequency input
        const fundamentalInput = document.getElementById('fundamental-input');
        if (fundamentalInput) {
            this.bindEvent(fundamentalInput, "input", (e) => {
                this.onChangeInput?.(e.target.value);
            });
        }

        this.keys.forEach((key) => {
            const idx = key.dataset.noteIndex = parseInt(key.dataset.noteIndex);
            this.bindEvent(key, "click", () => {
                this.onClickKey(idx);
            })
        })

        const octaveDown = document.getElementById('octave-down')
        this.bindEvent(octaveDown, "click", () => {
            this.onOctaveDown();
        });

        const octaveUp = document.getElementById('octave-up');
        this.bindEvent(octaveUp, "click", () => {
            this.onOctaveUp();
        });
    }
}