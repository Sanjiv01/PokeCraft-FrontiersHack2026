import { removeBackground as removeBg } from "@imgly/background-removal-node";
/**
 * Remove background using AI segmentation
 * @param {Buffer} inputBuffer - PNG image buffer
 * @returns {Buffer} PNG with transparent background
 */
export async function removeBackground(inputBuffer) {
    // Convert buffer to blob for the library
    const blob = new Blob([inputBuffer], { type: "image/png" });

    // AI-based background removal
    const result = await removeBg(blob, {
        output: { format: "image/png" },
    });

    // Convert result blob back to buffer
    const arrayBuffer = await result.arrayBuffer();
    return Buffer.from(arrayBuffer);
}