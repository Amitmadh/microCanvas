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
    private _shown: string;

    constructor(canvas: Canvas, node: McText, onClose: () => void) {
        this._canvas = canvas;
        this.node = node;
        this._before = node.text;
        this._shown = node.text;
        node._editing = true;

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
            overflowWrap: "normal",
        });
        textarea.addEventListener("input", () => {
            this._applyEdit();
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
     * Lays the textarea over the text, with its text, font, rotation and scale
     * and the canvas's pan and zoom.
     */
    place(): void {
        const { node, _canvas: canvas, _textarea: textarea } = this;
        if (textarea.value !== node.text) {
            // Setting the value moves the caret to the end, so it's put back after.
            const [start, end] = this._moveRange(textarea.selectionStart, textarea.selectionEnd, textarea.value, node.text);
            textarea.value = node.text;
            textarea.setSelectionRange(start, end);
            this._shown = node.text;
        }
        const { box, font, lineHeight, overflow } = node._editorLayout();
        // Room for the caret past either end of a line, and for a line more.
        const slack = node.fontSize;
        // A word longer than the width passes the line's end, as in CSS.
        const [left, right] = node.direction === "rtl" ? [slack + overflow, slack] : [slack, slack + overflow];
        const origin = canvas.boardToScreen(node.localToBoard({ x: box.x - left, y: box.y }));
        const cos = Math.cos(node.rotation);
        const sin = Math.sin(node.rotation);
        const scaleX = canvas.zoom * node.scaleX;
        const scaleY = canvas.zoom * node.scaleY;
        Object.assign(textarea.style, {
            left: `${canvas.canvas.offsetLeft + canvas.canvas.clientLeft}px`,
            top: `${canvas.canvas.offsetTop + canvas.canvas.clientTop}px`,
            width: `${box.width}px`,
            height: `${box.height + lineHeight}px`,
            padding: `0 ${right}px 0 ${left}px`,
            font,
            lineHeight: `${lineHeight}px`,
            color: node.fill,
            webkitTextStroke: node.stroke ? `${node.strokeWidth}px ${node.stroke}` : "",
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
     * @param report False to skip onChange, as for a text that was removed.
     */
    close(report = true): void {
        this._textarea.remove();
        this.node._editing = false;
        if (report && this.node.text !== this._before) {
            this._canvas.onChange?.(this.node);
        }
        this._canvas.requestRender();
    }

    private _applyEdit(): void {
        const before = this._shown;
        const after = this._textarea.value;
        const [start, end] = this._commonEnds(before, after);
        // The text may have changed since it was shown.
        const text = this.node.text;
        const [from, to] = this._moveRange(start, before.length - end, before, text);
        this.node.text = text.slice(0, from) + after.slice(start, after.length - end) + text.slice(Math.max(from, to));
        this._shown = after;
    }

    private _commonEnds(a: string, b: string): [number, number] {
        let start = 0;
        while (start < a.length && start < b.length && a[start] === b[start]) {
            start++;
        }
        let end = 0;
        while (end < a.length - start && end < b.length - start
            && a[a.length - 1 - end] === b[b.length - 1 - end]) {
            end++;
        }
        return [start, end];
    }

    private _moveRange(from: number, to: number, before: string, after: string): [number, number] {
        const [start, end] = this._commonEnds(before, after);
        const move = (index: number): number => {
            if (index <= start) {
                return index;
            }
            if (index >= before.length - end) {
                return index + after.length - before.length;
            }
            return after.length - end;
        };
        return [move(from), move(to)];
    }
}
