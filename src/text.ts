import { Node, type NodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Rect } from "./types.js";

export interface TextOptions extends NodeOptions {
    text: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    fill?: Paint;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
}

export class Text extends Node {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    fill: Paint;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;

    constructor({
        text,
        fontSize = 14,
        fontFamily = "sans-serif",
        fontWeight = "normal",
        fontStyle = "normal",
        fill = "black",
        align = "start",
        baseline = "alphabetic",
        ...options
    }: TextOptions) {
        super(options);
        this.text = text;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
        this.fontWeight = fontWeight;
        this.fontStyle = fontStyle;
        this.fill = fill;
        this.align = align;
        this.baseline = baseline;
    }

    /**
     * @method getLocalBounds
     * @description The text's advance width by the font's full height, so the
     * box doesn't change with which letters are in it.
     * @returns The box in the text's own coordinate space.
     */
    getLocalBounds(): Rect {
        const context = sharedContextInstance();
        context.font = this._font();
        context.textBaseline = this.baseline;
        const metrics = context.measureText(this.text);

        // With the baseline set, the font's ascent and descent are measured
        // from the node's position. "start" and "end" are taken as
        // left-to-right.
        const width = metrics.width;
        let x = 0;
        if (this.align === "center") {
            x = -width / 2;
        } else if (this.align === "right" || this.align === "end") {
            x = -width;
        }

        const ascent = metrics.fontBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent;
        return { x, y: -ascent, width, height: ascent + descent };
    }

    protected draw(context: CanvasRenderingContext2D): void {
        context.font = this._font();
        context.fillStyle = this.fill;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.fillText(this.text, 0, 0);
    }

    private _font(): string {
        return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    }
}
