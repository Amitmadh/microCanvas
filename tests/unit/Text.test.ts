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

    // ======================================================
    it("draws a font family CSS can't parse in the default font, without throwing", () => {
        // Measuring another font first leaves it on the context used for measuring.
        new McText({ text: "Hello", fontSize: 80, fontFamily: "serif" }).getLocalBounds();
        // Unquoted, "2P" isn't a valid CSS name.
        const text = new McText({ text: "Hello", x: 20, y: 100, fontFamily: "Press Start 2P" });
        const canvas = addCanvas({ width: 400, height: 200 });
        canvas.add(text);

        expect(() => canvas.render()).not.toThrow();
        const inDefaultFont = new McText({ text: "Hello" });
        expect(text.getLocalBounds()).toEqual(inDefaultFont.getLocalBounds());
        const ink = inkBox(canvas);
        expect(ink.right).toBeGreaterThan(text.x);
        expect(ink.right).toBeLessThanOrEqual(text.x + text.getLocalBounds().width + 1);
    });

    // ======================================================
    it("draws in its own direction, whatever the page's", () => {
        // The pixels of a Hebrew and English note, drawn on a page with the given direction.
        const draw = (page: string, direction: "ltr" | "rtl") => {
            const parent = addContainer();
            parent.dir = page;
            const canvas = addCanvas({ width: 300, height: 80 }, parent);
            canvas.add(new McText({ text: "Hi שלום!", x: 20, y: 50, fontSize: 30, direction }));
            canvas.render();
            return canvas.context.getImageData(0, 0, canvas.canvas.width, canvas.canvas.height).data.join();
        };

        expect(draw("rtl", "ltr") === draw("ltr", "ltr")).toBe(true);
        expect(draw("ltr", "rtl") === draw("rtl", "rtl")).toBe(true);
        expect(draw("ltr", "rtl") === draw("ltr", "ltr")).toBe(false);
    });
});
