import {
    DEFAULT_FILL,
    DEFAULT_FONT_FAMILY,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_STYLE,
    DEFAULT_FONT_WEIGHT,
    DEFAULT_TEXT_ALIGN,
    DEFAULT_TEXT_BASELINE,
} from "./config.js";
import { McNode, type McNodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Rect } from "./types.js";

export interface McTextOptions extends McNodeOptions {
    text: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    fill?: Paint;
    align?: "left" | "center" | "right";
    baseline?: CanvasTextBaseline;
}

/**
 * @class McText
 * @description A single line of text, aligned to the node's position by
 * align and baseline.
 */
export class McText extends McNode {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    fill: Paint;
    align: "left" | "center" | "right";
    baseline: CanvasTextBaseline;
    private _boundsKey = "";
    private _bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };

    constructor({
        text,
        fontSize = DEFAULT_FONT_SIZE,
        fontFamily = DEFAULT_FONT_FAMILY,
        fontWeight = DEFAULT_FONT_WEIGHT,
        fontStyle = DEFAULT_FONT_STYLE,
        fill = DEFAULT_FILL,
        align = DEFAULT_TEXT_ALIGN,
        baseline = DEFAULT_TEXT_BASELINE,
        ...options
    }: McTextOptions) {
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
     * @description The advance width by the font's full height, so the box
     * doesn't depend on which letters are in it.
     * @returns The box in the text's own space.
     */
    getLocalBounds(): Rect {
        const font = this._font();
        const key = `${font}|${this.align}|${this.baseline}|${this.text}`;
        if (key === this._boundsKey) {
            return this._bounds;
        }

        const context = sharedContextInstance();
        context.font = font;
        context.textBaseline = this.baseline;
        const metrics = context.measureText(this.text);

        // With the baseline set, ascent and descent start at the position.
        const width = metrics.width;
        let x = 0;
        if (this.align === "center") {
            x = -width / 2;
        } else if (this.align === "right") {
            x = -width;
        }

        const ascent = metrics.fontBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent;
        const bounds = { x, y: -ascent, width, height: ascent + descent };
        
        this._boundsKey = key;
        this._bounds = bounds;
        return bounds;
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
