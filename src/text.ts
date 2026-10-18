import { Node, type NodeOptions } from "./node.js";
import type { Paint } from "./types.js";

export interface TextOptions extends NodeOptions {
    text: string;
    /** Font size in CSS pixels. */
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    fill?: Paint;
    /** Horizontal alignment relative to the node's position. */
    align?: CanvasTextAlign;
    /** Vertical alignment relative to the node's position. */
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

    protected draw(context: CanvasRenderingContext2D): void {
        context.font = '${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}';
        context.fillStyle = this.fill;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.fillText(this.text, 0, 0);
    }
}
