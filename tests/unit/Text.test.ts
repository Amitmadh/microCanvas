import { describe, expect, it, onTestFinished, vi } from "vitest";
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

// The ink box of a text drawn alone on a new canvas.
function inkOf(text: McText) {
    const canvas = addCanvas({ width: 400, height: 200 });
    canvas.add(text);
    canvas.render();
    return inkBox(canvas);
}

// The alpha drawn at a point, in CSS pixels.
function alphaAt(canvas: Canvas, x: number, y: number) {
    const ratio = canvas.pixelRatio;
    return canvas.context.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data[3];
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
    it("keeps its layout once its web font has failed to load", async () => {
        // As when offline, blocked, or misspelled.
        const font = new FontFace("MissingFont", "url(/no-such-font.woff2)");
        document.fonts.add(font);
        onTestFinished(() => {
            document.fonts.delete(font);
        });
        await font.load().catch(() => {});
        await document.fonts.ready;
        const text = new McText({ text: "Group Board notes", width: 100, fontFamily: "MissingFont, monospace" });
        text.getLocalBounds();

        const measure = vi.spyOn(CanvasRenderingContext2D.prototype, "measureText");
        onTestFinished(() => measure.mockRestore());
        text.getLocalBounds();

        expect(measure).not.toHaveBeenCalled();
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

    // ======================================================
    it("wraps to its width at spaces and line breaks, and draws every line", () => {
        const mono = { x: 20, y: 40, fontSize: 20, fontFamily: "monospace" };
        const line = new McText({ ...mono, text: "aaa" }).getLocalBounds();
        // Wide enough for "aaa", but not for "aaa bbb".
        const text = new McText({ ...mono, text: "aaa bbb ccc\nddd", width: line.width * 2 });
        const canvas = addCanvas({ width: 400, height: 300 });
        canvas.add(text);
        canvas.render();

        const box = text.getLocalBounds();
        expect(box.height / line.height).toBeCloseTo(4, 6);
        // The box is the width it wraps to, however short its lines.
        expect(box.width).toBeCloseTo(2 * line.width, 0);
        // The ink reaches into the fourth line, and no line is wider than a word.
        const ink = inkBox(canvas);
        expect(ink.bottom).toBeGreaterThan(text.y + box.y + 3 * line.height);
        expect(ink.bottom).toBeLessThanOrEqual(text.y + box.y + box.height + 1);
        expect(ink.right).toBeLessThanOrEqual(text.x + box.x + line.width + 1);
        // Without a width, \n still breaks the line.
        expect(new McText({ ...mono, text: "aaa\nddd" }).getLocalBounds().height).toBeCloseTo(2 * line.height, 6);
    });

    // ======================================================
    it("rewraps to the width it's resized to, keeping its font", () => {
        const mono = { fontSize: 20, fontFamily: "monospace" };
        const letter = new McText({ ...mono, text: "a" }).getLocalBounds().width;
        // Fits "aa bb" but not "aa bb cc", so two lines.
        const text = new McText({ ...mono, text: "aa bb cc dd", width: 5.5 * letter });
        const before = text.getLocalBounds();

        // Wide enough for all of it, on one line.
        text.resize({ x: before.x, y: before.y }, { x: before.x + 11.5 * letter, y: before.y + before.height });

        const after = text.getLocalBounds();
        expect(text.fontSize).toBe(20);
        expect(text.width).toBeCloseTo(11.5 * letter, 9);
        // On one line now, in a box as wide as it was resized to.
        expect(after.height).toBe(new McText({ ...mono, text: "aa bb cc dd" }).getLocalBounds().height);
        expect(after.width).toBeCloseTo(11.5 * letter, 9);
        // The top-left corner stays in place.
        expect(text.x + after.x).toBeCloseTo(before.x, 9);
        expect(text.y + after.y).toBeCloseTo(before.y, 9);
    });

    // ======================================================
    it("wraps inside its padding when resized", () => {
        const mono = { fontSize: 20, fontFamily: "monospace", padding: 8 };
        const letter = new McText({ ...mono, padding: 0, text: "a" }).getLocalBounds().width;
        const text = new McText({ ...mono, text: "aa bb cc dd", width: 5.5 * letter });
        const before = text.getLocalBounds();

        // Wide enough for all of it on one line, with the padding on both sides.
        text.resize({ x: before.x, y: before.y }, { x: before.x + 11.5 * letter + 16, y: before.y + before.height });

        const after = text.getLocalBounds();
        expect(text.width).toBeCloseTo(11.5 * letter, 9);
        // On one line now, with the padding on both sides of its width.
        expect(after.height).toBe(new McText({ ...mono, text: "aa bb cc dd" }).getLocalBounds().height);
        expect(after.width).toBeCloseTo(11.5 * letter + 16, 9);
        expect(text.x + after.x).toBeCloseTo(before.x, 9);
        expect(text.y + after.y).toBeCloseTo(before.y, 9);
    });

    // ======================================================
    it("grows its bounds by its padding, and fills them with its background", () => {
        const options = { text: "Hello", x: 100, y: 100, fontSize: 30 };
        const plain = new McText(options).getLocalBounds();
        const text = new McText({ ...options, padding: 10, background: "red" });
        const canvas = addCanvas({ width: 400, height: 200 });
        canvas.add(text);
        canvas.render();

        const box = text.getLocalBounds();
        expect(box).toEqual({ x: plain.x - 10, y: plain.y - 10, width: plain.width + 20, height: plain.height + 20 });
        const left = text.x + box.x;
        const top = text.y + box.y;
        const ink = inkBox(canvas);
        // 1 px of slack for antialiasing at the edges.
        expect(Math.abs(ink.left - left)).toBeLessThanOrEqual(1);
        expect(Math.abs(ink.right - (left + box.width))).toBeLessThanOrEqual(1);
        expect(Math.abs(ink.top - top)).toBeLessThanOrEqual(1);
        expect(Math.abs(ink.bottom - (top + box.height))).toBeLessThanOrEqual(1);
        expect(canvas.nodeAt({ x: left + 3, y: top + 3 })).toBe(text);

        // Rounded, the corner is left out, and the top edge's middle isn't.
        text.cornerRadius = 12;
        canvas.render();
        expect(alphaAt(canvas, left + 1, top + 1)).toBe(0);
        expect(alphaAt(canvas, left + box.width / 2, top + 1)).toBe(255);
    });

    // ======================================================
    it("spaces its lines by its line height", () => {
        const mono = { text: "aaa\naaa", x: 20, y: 40, fontSize: 20, fontFamily: "monospace" };
        const line = new McText({ ...mono, text: "aaa" }).getLocalBounds().height;
        const tight = new McText(mono);
        const spaced = new McText({ ...mono, lineHeight: 2 });

        expect(spaced.getLocalBounds().height - tight.getLocalBounds().height).toBeCloseTo(line, 6);
        // The second line is drawn a line lower, give or take a pixel.
        expect(Math.abs(inkOf(spaced).bottom - inkOf(tight).bottom - line)).toBeLessThanOrEqual(1);
    });

    // ======================================================
    it("outlines its letters within its bounds, grown by half the outline", () => {
        const options = { text: "Hello", x: 60, y: 120, fontSize: 60 };
        const plain = new McText(options);
        const outlined = new McText({ ...options, stroke: "navy", strokeWidth: 12 });
        const p = plain.getLocalBounds();
        const box = outlined.getLocalBounds();
        expect(box).toEqual({ x: p.x - 6, y: p.y - 6, width: p.width + 12, height: p.height + 12 });

        const plainInk = inkOf(plain);
        const ink = inkOf(outlined);
        expect(ink.left).toBeGreaterThanOrEqual(outlined.x + box.x - 1);
        expect(ink.right).toBeLessThanOrEqual(outlined.x + box.x + box.width + 1);
        expect(ink.top).toBeGreaterThanOrEqual(outlined.y + box.y - 1);
        expect(ink.bottom).toBeLessThanOrEqual(outlined.y + box.y + box.height + 1);
        // The outline reaches past the letters.
        expect(ink.right - ink.left).toBeGreaterThan(plainInk.right - plainInk.left + 8);
    });
});
