import type { Canvas } from "./canvas.js";
import type { McText } from "./text.js";

/**
 * A textarea over a writable text, where the user edits it in place. It asks
 * to be closed on Escape and when it loses focus.
 * @param canvas The canvas the text is on.
 * @param node The text to edit.
 * @param onClose Called when the user ends editing from the textarea.
 */
export class TextEditor {
    readonly node: McText;
    private readonly _canvas: Canvas;
    private readonly _textarea = document.createElement("textarea");
    private readonly _before: string;

    constructor(canvas: Canvas, node: McText, onClose: () => void) {
        this._canvas = canvas;
        this.node = node;
        this._before = node.text;

        const textarea = this._textarea;
        textarea.value = node.text;
        Object.assign(textarea.style, {
            position: "absolute",
            margin: "0",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            overflow: "hidden",
            boxSizing: "content-box",
            transformOrigin: "0 0",
        });
        textarea.addEventListener("input", () => {
            node.text = textarea.value;
            canvas.whileChange?.(node);
            canvas.requestRender();
        });
        textarea.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        });
        textarea.addEventListener("blur", onClose);

        this.place();
        canvas.canvas.after(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    /**
     * Lays the textarea over the text, with its font, rotation and scale and
     * the canvas's pan and zoom.
     */
    place(): void {
        const { node, _canvas: canvas } = this;
        const { box, font, lineHeight } = node._editorLayout();
        // Room for the caret past either end of a line, and for a line more.
        const slack = node.fontSize;
        const origin = canvas.boardToScreen(node.localToBoard({ x: box.x - slack, y: box.y }));
        const cos = Math.cos(node.rotation);
        const sin = Math.sin(node.rotation);
        const scaleX = canvas.zoom * node.scaleX;
        const scaleY = canvas.zoom * node.scaleY;
        Object.assign(this._textarea.style, {
            left: `${canvas.canvas.offsetLeft + canvas.canvas.clientLeft}px`,
            top: `${canvas.canvas.offsetTop + canvas.canvas.clientTop}px`,
            width: `${box.width}px`,
            height: `${box.height + lineHeight}px`,
            padding: `0 ${slack}px`,
            font,
            lineHeight: `${lineHeight}px`,
            color: node.fill,
            opacity: String(node.opacity),
            textAlign: node.align,
            direction: node.direction,
            whiteSpace: node.width === null ? "pre" : "pre-wrap",
            transform: `matrix(${scaleX * cos}, ${scaleX * sin}, ${-scaleY * sin}, ${scaleY * cos}, ${origin.x}, ${origin.y})`,
        });
    }

    /**
     * Removes the textarea, and calls the canvas's onChange if the text
     * changed.
     */
    close(): void {
        this._textarea.remove();
        if (this.node.text !== this._before) {
            this._canvas.onChange?.(this.node);
        }
        this._canvas.requestRender();
    }
}
