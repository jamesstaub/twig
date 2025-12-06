/**
 * WAV EXPORTER CLASS
 * Handles WAV file creation and download functionality
 */

export class WAVExporter {
    /**
     * Exports audio buffer data as a downloadable WAV file
     * @param {Float32Array} buffers - Audio buffer to export
     * @param {number} sampleRate - Sample rate for the WAV file
     * @param {string} filename - Filename for the download
     * @param {number} numCycles - Number of cycles to repeat the buffer
     */
    static exportAsWAV(buffers, sampleRate, filename, numCycles = 1) {
        if (!Array.isArray(buffers) || buffers.length === 0) {
            throw new Error("WAV export failed: expected an array of channel buffers.");
        }

        // Validate channel buffers
        const numChannels = buffers.length;
        const length = buffers[0].length;

        for (let ch = 0; ch < numChannels; ch++) {
            if (!(buffers[ch] instanceof Float32Array)) {
                throw new Error(`Channel ${ch} is not a Float32Array.`);
            }
            if (buffers[ch].length !== length) {
                throw new Error(`Channel ${ch} length mismatch.`);
            }
        }

        // Repeat each channel if needed
        const repeated = buffers.map(chBuf =>
            WAVExporter.repeatBuffer(chBuf, numCycles)
        );

        // Build interleaved WAV buffer
        const wavData = WAVExporter.createWAVBufferMulti(repeated, sampleRate);

        WAVExporter.downloadFile(wavData, filename);
    }


    /**
     * Repeats a buffer for the specified number of cycles
     * @param {Float32Array} buffer - Original buffer
     * @param {number} numCycles - Number of cycles to repeat
     * @returns {Float32Array} Extended buffer
     */
    static repeatBuffer(buffer, numCycles) {
        const cycleLength = buffer.length;
        const totalLength = cycleLength * numCycles;
        const fullBuffer = new Float32Array(totalLength);

        for (let i = 0; i < totalLength; i++) {
            fullBuffer[i] = buffer[i % cycleLength];
        }

        return fullBuffer;
    }


    static createWAVBufferMulti(channelBuffers, sampleRate) {
        const numChannels = channelBuffers.length;
        const numFrames = channelBuffers[0].length;
        const bytesPerSample = 2; // 16-bit PCM
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;

        const dataSize = numFrames * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        let offset = 0;

        // WAV Header --------------------------------------------------------
        WAVExporter.writeString(view, offset, "RIFF"); offset += 4;
        view.setUint32(offset, 36 + dataSize, true); offset += 4;
        WAVExporter.writeString(view, offset, "WAVE"); offset += 4;

        WAVExporter.writeString(view, offset, "fmt "); offset += 4;
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, numChannels, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, byteRate, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, bytesPerSample * 8, true); offset += 2;

        WAVExporter.writeString(view, offset, "data"); offset += 4;
        view.setUint32(offset, dataSize, true); offset += 4;

        // Interleave channels ----------------------------------------------
        for (let i = 0; i < numFrames; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channelBuffers[ch][i]));
                view.setInt16(offset, sample * 0x7fff, true);
                offset += 2;
            }
        }

        return buffer;
    }


    /**
     * Writes a string to a DataView at the specified offset
     * @param {DataView} view - DataView to write to
     * @param {number} offset - Byte offset to start writing
     * @param {string} string - String to write
     */
    static writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * Downloads a file buffer as a blob
     * @param {DataView} arrayBuffer - File data as DataView
     * @param {string} filename - Filename for the download
     */
    static downloadFile(arrayBuffer, filename) {
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

}