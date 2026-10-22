import {
    DEFAULT_FILL,
    DEFAULT_FONT_FAMILY,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_STYLE,
    DEFAULT_FONT_WEIGHT,
    DEFAULT_TEXT_ALIGN,
    DEFAULT_TEXT_BASELINE,
    DEFAULT_TEXT_DIRECTION,
} from "./config.js";
import { McNode, type McNodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Point, Rect } from "./types.js";

export interface McTextOptions extends McNodeOptions {
    text: string;
    fontSize?: number;
    /**
     * CSS font-family. Quote names like '"Press Start 2P"' or they
     * fall back to the default font.
     */
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    fill?: Paint;
    align?: "left" | "center" | "right";
    baseline?: CanvasTextBaseline;
    direction?: "ltr" | "rtl";
}

export interface McTextJSON extends Required<McTextOptions> {
    type: "text";
}

/**
 * A single line of text, aligned to the node's position by
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
    direction: "ltr" | "rtl";
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
        direction = DEFAULT_TEXT_DIRECTION,
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
        this.direction = direction;
    }

    toJSON(): McTextJSON {
        return {
            ...super.toJSON(),
            type: "text",
            text: this.text,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            fontWeight: this.fontWeight,
            fontStyle: this.fontStyle,
            fill: this.fill,
            align: this.align,
            baseline: this.baseline,
            direction: this.direction,
        };
    }

    /**
     * The advance width by the font's full height, grown to fit
     * letters that reach past it, such as italics.
     * @returns The box in the text's own space.
     */
    getLocalBounds(): Rect {
        const font = this._font();
        const key = `${font}|${this.align}|${this.baseline}|${this.direction}|${this.text}`;
        if (key === this._boundsKey) {
            return this._bounds;
        }

        const context = sharedContextInstance();
        // The context ignores a font CSS can't parse
        context.font = `${DEFAULT_FONT_STYLE} ${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
        context.font = font;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.direction = this.direction;
        const metrics = context.measureText(this.text);

        // With the align and baseline set, the metrics start at the position.
        const width = metrics.width;
        let x = 0;
        if (this.align === "center") {
            x = -width / 2;
        } else if (this.align === "right") {
            x = -width;
        }

        const left = Math.min(x, -metrics.actualBoundingBoxLeft);
        const right = Math.max(x + width, metrics.actualBoundingBoxRight);
        const top = -Math.max(metrics.fontBoundingBoxAscent, metrics.actualBoundingBoxAscent);
        const bottom = Math.max(metrics.fontBoundingBoxDescent, metrics.actualBoundingBoxDescent);
        const bounds = { x: left, y: top, width: right - left, height: bottom - top };

        this._bounds = bounds;
        // Until a web font loads, the text is measured in a fallback font.
        this._boundsKey = this._fontLoaded(font, this.text) ? key : "";
        return bounds;
    }

    resize(anchor: Point, corner: Point): void {
        const bounds = this.getLocalBounds();
        const scaleY = Math.abs(corner.y - anchor.y) / bounds.height;
        const scale = bounds.width > 0 ? Math.max(Math.abs(corner.x - anchor.x) / bounds.width, scaleY) : scaleY;
        // Text grows from its position, so this keeps the anchor in place.
        const position = this.localToBoard({ x: anchor.x * (1 - scale), y: anchor.y * (1 - scale) });
        this.x = position.x;
        this.y = position.y;
        this.fontSize *= scale;
    }

    protected draw(context: CanvasRenderingContext2D): void {
        context.font = `${DEFAULT_FONT_STYLE} ${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
        context.font = this._font();
        context.fillStyle = this.fill;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.direction = this.direction;
        context.fillText(this.text, 0, 0);
    }

    private _font(): string {
        return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    }

    private _fontLoaded(font: string, text: string): boolean {
    try {
        return document.fonts.check(font, text);
    } catch {
        return true;
    }
}
}
