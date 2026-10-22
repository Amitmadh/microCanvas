import { describe, expect, it } from "vitest";
import { McImage } from "../../src/index.js";
import { addCanvas, nextFrame } from "./test-utils.js";

describe("McImage", () => {
    // ======================================================
    it("is drawn once it loads, with nothing else rendering the board", async () => {
        // A red 20 × 20 picture, still loading when the board first renders.
        const source = document.createElement("canvas");
        source.width = source.height = 20;
        const context = source.getContext("2d")!;
        context.fillStyle = "red";
        context.fillRect(0, 0, 20, 20);
        const blob = await new Promise<Blob>((resolve) => source.toBlob((result) => resolve(result!)));
        const element = document.createElement("img");
        element.src = URL.createObjectURL(blob);
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
});
