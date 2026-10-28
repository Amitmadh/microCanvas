import { describe, expect, it } from "vitest";
import { McImage, McText, type Canvas } from "../../src/index.js";
import { addCanvas } from "./test-utils.js";

// A pointer or mouse event at a point on the canvas, in CSS pixels.
function at(canvas: Canvas, type: string, x: number, y: number): void {
    const rect = canvas.canvas.getBoundingClientRect();
    const EventType = type === "dblclick" ? MouseEvent : PointerEvent;
    canvas.canvas.dispatchEvent(new EventType(type, { clientX: rect.left + x, clientY: rect.top + y, pointerId: 1 }));
}

function editorOf(canvas: Canvas): HTMLTextAreaElement | null {
    return canvas.canvas.parentElement!.querySelector("textarea");
}

// Types at the caret, as a keystroke does.
function type(editor: HTMLTextAreaElement, text: string): void {
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
}

describe("Regressions", () => {
    // ======================================================
    it("shows a collaborator's change in the editor, and keeps it when the user types", () => {
        const canvas = addCanvas();
        const text = new McText({ text: "Hello", x: 100, y: 120, fontSize: 20, writable: true });
        canvas.add(text);
        at(canvas, "dblclick", 110, 110);
        const editor = editorOf(canvas)!;

        text.text = "Hello (Bob)";
        canvas.render();
        expect(editor.value).toBe("Hello (Bob)");

        type(editor, "!");
        expect(text.text).toBe("Hello! (Bob)");
    });

    // ======================================================
    it("keeps a collaborator's change that lands just before a keystroke", () => {
        const canvas = addCanvas();
        const text = new McText({ text: "Hello", x: 100, y: 120, fontSize: 20, writable: true });
        canvas.add(text);
        at(canvas, "dblclick", 110, 110);

        // No render in between.
        text.text = "Hello (Bob)";
        type(editorOf(canvas)!, "!");

        expect(text.text).toBe("Hello! (Bob)");
    });

    // ======================================================
    it("keeps the caret in place when a collaborator types before it", () => {
        const canvas = addCanvas();
        const text = new McText({ text: "Hello", x: 100, y: 120, fontSize: 20, writable: true });
        canvas.add(text);
        at(canvas, "dblclick", 110, 110);
        const editor = editorOf(canvas)!;

        text.text = "Hey Hello";
        canvas.render();
        type(editor, "!");

        expect(text.text).toBe("Hey Hello!");
    });

    // ======================================================
    it("keeps a collaborator's change before the caret that lands just before a keystroke", () => {
        const canvas = addCanvas();
        const text = new McText({ text: "Hello", x: 100, y: 120, fontSize: 20, writable: true });
        canvas.add(text);
        at(canvas, "dblclick", 110, 110);

        // No render in between.
        text.text = "Hey Hello";
        type(editorOf(canvas)!, "!");

        expect(text.text).toBe("Hey Hello!");
    });

    // ======================================================
    it("edits an empty note by double-clicking anywhere in its width", () => {
        const canvas = addCanvas();
        canvas.add(new McText({ text: "", x: 50, y: 80, width: 200, padding: 12, background: "gold", writable: true }));

        at(canvas, "dblclick", 150, 75);

        expect(editorOf(canvas)).not.toBeNull();
    });

    // ======================================================
    it("keeps an image that fails to load selectable", async () => {
        const canvas = addCanvas();
        const element = document.createElement("img");
        element.src = "/no-such-asset.png";
        await new Promise((resolve) => element.addEventListener("error", resolve, { once: true }));
        const image = new McImage({ image: element, x: 100, y: 50, width: 200, height: 100, draggable: true });
        canvas.add(image);

        at(canvas, "pointerdown", 200, 100);
        at(canvas, "lostpointercapture", 200, 100);

        expect(canvas.selected).toBe(image);
    });

    // ======================================================
    it("keeps a word too long for its width whole, on the canvas and in the editor", () => {
        const canvas = addCanvas();
        const text = new McText({ text: "Supercalifragilistic word", x: 100, y: 120, fontSize: 16, width: 100, writable: true });
        canvas.add(text);
        at(canvas, "dblclick", 110, 110);

        expect(text["_lines"]).toEqual(["Supercalifragilistic", "word"]);
        expect(getComputedStyle(editorOf(canvas)!).overflowWrap).toBe("normal");
    });
});