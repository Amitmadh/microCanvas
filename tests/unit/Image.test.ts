import { describe, expect, it } from "vitest";
import { McImage } from "../../src/index.js";
import { addCanvas, nextFrame } from "./test-utils.js";

// A red 20 × 20 picture, still loading.
async function loadingRedImage(): Promise<HTMLImageElement> {
    const source = document.createElement("canvas");
    source.width = source.height = 20;
    const context = source.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>((resolve) => source.toBlob((result) => resolve(result!)));
    const element = document.createElement("img");
    element.src = URL.createObjectURL(blob);
    return element;
}

describe("McImage", () => {
    // ======================================================
    it("is drawn once it loads, with nothing else rendering the board", async () => {
        // Still loading when the board first renders.
        const element = await loadingRedImage();
        expect(element.naturalWidth).toBe(0);

        const canvas = addCanvas();
        canvas.add(new McImage({ image: element, x: 10, y: 10, width: 100, height: 100 }));
        canvas.render();
        await element.decode();
        await nextFrame();

        const ratio = canvas.pixelRatio;
        const pixel = canvas.context.getImageData(Math.floor(60 * ratio), Math.floor(60 * ratio), 1, 1).data;
        expect([...pixel]).toEqual([255, 0, 0, 255]);
    });

    // ======================================================
    it("takes its image's natural size once it loads, unless already sized", async () => {
        const element = await loadingRedImage();
        const canvas = addCanvas();
        const natural = new McImage({ image: element, x: 10, y: 10 });
        const sized = new McImage({ image: element, x: 100, y: 10 });
        // As when a collaborator resizes it before it has loaded here.
        sized.width = 50;
        canvas.add(natural, sized);

        await element.decode();
        await nextFrame();

        expect([natural.width, natural.height, sized.width, sized.height]).toEqual([20, 20, 50, 20]);
        expect(canvas.nodeAt({ x: 20, y: 20 })).toBe(natural);
    });
});
