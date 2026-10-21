import { describe, expect, it, onTestFinished } from "vitest";
import { McText, type Canvas } from "../../src/index.js";
import { addCanvas, addContainer, nextFrame } from "./test-utils.js";

// The box around everything drawn on the canvas, in CSS pixels.
function inkBox(canvas: Canvas) {
    const { width, height } = canvas.canvas;
    const { data } = canvas.context.getImageData(0, 0, width, height);
    let left = width, right = 0, top = height, bottom = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i]) {
            const x = ((i - 3) / 4) % width;
            const y = Math.floor((i - 3) / 4 / width);
            left = Math.min(left, x);
            right = Math.max(right, x + 1);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y + 1);
        }
    }
    const ratio = canvas.pixelRatio;
    return { left: left / ratio, right: right / ratio, top: top / ratio, bottom: bottom / ratio };
}

describe("McText", () => {
    // ======================================================
    it("is drawn and hit to the right of x on a right-to-left page", () => {
        const parent = addContainer();
        parent.dir = "rtl";
        const canvas = addCanvas({ width: 400, height: 200 }, parent);
        const text = new McText({ text: "Hello", x: 200, y: 100, fontSize: 40 });
        canvas.add(text);
        canvas.render();

        expect(inkBox(canvas).left).toBeGreaterThanOrEqual(199);
        expect(canvas.nodeAt({ x: 240, y: 90 })).toBe(text);
    });

    // ======================================================
    it("has bounds that hold letters reaching past its advance width", () => {
        // In most serif fonts an italic j hooks left of x, and an italic f reaches past the advance.
        const canvas = addCanvas({ width: 400, height: 200 });
        const text = new McText({ text: "jaf", x: 100, y: 120, fontSize: 80, fontStyle: "italic", fontFamily: "serif" });
        canvas.add(text);
        canvas.render();
        const ink = inkBox(canvas);
        const { x, y, width, height } = text.getLocalBounds();

        // 1 px of slack for antialiasing at the edges of the ink.
        expect(text.x + x).toBeLessThanOrEqual(ink.left + 1);
        expect(text.x + x + width).toBeGreaterThanOrEqual(ink.right - 1);
        expect(text.y + y).toBeLessThanOrEqual(ink.top + 1);
        expect(text.y + y + height).toBeGreaterThanOrEqual(ink.bottom - 1);
    });

    // ======================================================
    it("is measured again once a late web font arrives", async () => {
        // A web font that starts loading when the text is first measured.
        const font = new FontFace("LateFont", `url(${new URL("../assets/poppins-bold-subset.ttf", import.meta.url)})`);
        document.fonts.add(font);
        onTestFinished(() => {
            document.fonts.delete(font);
        });
        const options = { text: "Group Board notes", fontSize: 40, fontFamily: "LateFont, monospace" };
        const text = new McText(options);
        const fallbackWidth = text.getLocalBounds().width;
        await font.load();

        const width = text.getLocalBounds().width;
        expect(Math.round(width)).not.toBe(Math.round(fallbackWidth));
        expect(width).toBe(new McText(options).getLocalBounds().width);
    });

    // ======================================================
    it("redraws the board once a late web font arrives", async () => {
        // Its own URL, as Firefox draws a font file it has loaded before at once, without a fallback.
        const font = new FontFace("LateFont", `url(${new URL("../assets/poppins-bold-subset.ttf?redraw", import.meta.url)})`);
        document.fonts.add(font);
        onTestFinished(() => {
            document.fonts.delete(font);
        });
        const canvas = addCanvas();
        canvas.add(new McText({ text: "Group Board notes", x: 20, y: 120, fontSize: 40, fontFamily: "LateFont, monospace" }));
        canvas.render();
        const fallbackInk = inkBox(canvas);

        // Nothing else renders the board from here on.
        await font.load();
        await document.fonts.ready;
        await nextFrame();

        expect(inkBox(canvas).right).not.toBe(fallbackInk.right);
    });
});
