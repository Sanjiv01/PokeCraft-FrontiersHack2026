import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";
import "./loadEnv.js";
import { removeBackground } from "./removeBackground.js";

const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

function createVertexClient() {
    return new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    });
}

const vertexAi = createVertexClient();

async function generateContent(prompt) {
    if (API_KEY) {
        const response = await fetch(
            `https://aiplatform.googleapis.com/v1/publishers/google/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                    },
                }),
            },
        );

        const result = await response.json();
        if (!response.ok) {
            throw new Error(JSON.stringify(result.error ?? result));
        }
        return result;
    }

    return vertexAi.models.generateContent({
        model: IMAGE_MODEL,
        contents: prompt,
        config: {
            responseModalities: ["TEXT", "IMAGE"],
        },
    });
}

/**
 * Generate all 4 sprites as separate images in ONE call for consistency
 */
export async function generateAllSprites(description, outputDir) {
    if (!outputDir || !path.isAbsolute(outputDir)) {
        throw new Error("outputDir is required and must be an absolute path");
    }
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`🎨 Generating sprites for: "${description}"`);

    const prompt = `Generate exactly 4 separate images for this Pokemon character: ${description}

Image 1: Front-facing battle sprite — the character facing TOWARD the camera. 64x64 pixels.
Image 2: Back-facing battle sprite — the SAME character turned 180°, showing its back. 64x64 pixels.
Image 3: Small party menu icon — simplified miniature of the same character. 32x32 pixels.
Image 4: Footprint — a simple foot/paw print. 16x16 pixels.

IMPORTANT: All 4 images must be the SAME character. Same body shape, same colors, same features.
Return each as a SEPARATE image, not combined into one.

STRICT RULES:
- 16-color indexed palette
- Transparent background on each image
- Clean pixel art, no anti-aliasing, no gradients
- No text, no labels, no watermarks`;

    const response = await generateContent(prompt);

    const fileNames = ["front.png", "back.png", "icon.png", "footprint.png"];
    const images = [];
    let desc = "";

    for (const part of response.candidates[0].content.parts) {
        if (part.text) {
            desc = part.text;
        } else if (part.inlineData) {
            images.push(Buffer.from(part.inlineData.data, "base64"));
        }
    }

    if (images.length === 0) {
        throw new Error("No images generated");
    }

    const results = {};

    for (let i = 0; i < images.length && i < fileNames.length; i++) {
        const savePath = path.join(outputDir, fileNames[i]);
        const cleanBuffer = await removeBackground(images[i]);
        await fs.writeFile(savePath, cleanBuffer);
        results[fileNames[i]] = { path: savePath, size: cleanBuffer.length, status: "ok" };
        console.log(`  ✅ ${fileNames[i]} saved (${cleanBuffer.length} bytes)`);
    }

    // If Gemini only returned 1 image (a grid), save it as spritesheet fallback
    if (images.length === 1) {
        console.log("Got 1 image instead of 4 — saved as spritesheet.png");
        const savePath = path.join(outputDir, "spritesheet.png");
        const cleanBuffer = await removeBackground(images[0]);
        await fs.writeFile(savePath, cleanBuffer);
        results["spritesheet.png"] = { path: savePath, size: cleanBuffer.length, status: "ok" };
    }

    return {
        folder: outputDir,
        imageCount: images.length,
        sprites: results,
        description: desc,
    };
}

/**
 * Generate a single image (simple mode)
 */
export async function generateImage(prompt, options = {}) {
    const { outputPath } = options;
    if (!outputPath || !path.isAbsolute(outputPath)) {
        throw new Error("outputPath is required and must be an absolute path");
    }
    console.log(`🎨 Generating: "${prompt}"`);

    const spritePrompt = `${prompt}.
STRICT RULES:
- Output ONLY the single character sprite, nothing else
- Transparent background, no scenery, no items, no UI elements
- Game Boy Advance Pokemon style, 16-color palette
- Clean pixel edges, no anti-aliasing, no gradients
- Front-facing, centered on canvas
- No text, no labels, no watermarks`;

    const response = await generateContent(spritePrompt);

    let description = "";
    let imgBuffer = null;

    for (const part of response.candidates[0].content.parts) {
        if (part.text) {
            description = part.text;
        } else if (part.inlineData) {
            imgBuffer = Buffer.from(part.inlineData.data, "base64");
        }
    }

    if (!imgBuffer) {
        throw new Error("No image generated");
    }

    const savePath = outputPath;

    const cleanBuffer = await removeBackground(imgBuffer);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, cleanBuffer);

    console.log("saved successfully");

    return {
        path: savePath,
        description,
        size: cleanBuffer.length,
    };
}
