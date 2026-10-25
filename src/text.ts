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
    /** Wraps lines to this width, at spaces and at \n. Null keeps one line. */
    width?: number | null;
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
 * Text aligned to the node's position by align and baseline. Given a
 * width, it wraps into lines that stack below the first.
 */
export class McText extends McNode {
    text: string;
    width: number | null;
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
    private _lines: string[] = [];
    private _lineHeight = 0;

    constructor({
        text,
        width = null,
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
        this.width = width;
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
            width: this.width,
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
     * The widest line's advance width by the lines' full height, grown to fit
     * letters that reach past them, such as italics.
     * @returns The box in the text's own space.
     */
    getLocalBounds(): Rect {
        const font = this._font();
        const key = `${font}|${this.align}|${this.baseline}|${this.direction}|${this.width}|${this.text}`;
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
        this._lines = this.width === null ? [this.text] : this._wrap(context, this.width);
        const first = context.measureText(this._lines[0]);
        this._lineHeight = first.fontBoundingBoxAscent + first.fontBoundingBoxDescent;

        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        this._lines.forEach((line, i) => {
            const metrics = context.measureText(line);
            const y = i * this._lineHeight;
            const width = metrics.width;
            let x = 0;
            if (this.align === "center") {
                x = -width / 2;
            } else if (this.align === "right") {
                x = -width;
            }
            left = Math.min(left, x, -metrics.actualBoundingBoxLeft);
            right = Math.max(right, x + metrics.width, metrics.actualBoundingBoxRight);
            top = Math.min(top, y - Math.max(metrics.fontBoundingBoxAscent, metrics.actualBoundingBoxAscent));
            bottom = Math.max(bottom, y + Math.max(metrics.fontBoundingBoxDescent, metrics.actualBoundingBoxDescent));
        });
        const bounds = { x: left, y: top, width: right - left, height: bottom - top };

        this._bounds = bounds;
        // Until a web font loads, the text is measured in a fallback font.
        this._boundsKey = this._fontLoaded(font, this.text) ? key : "";
        return bounds;
    }

    resize(anchor: Point, corner: Point): void {
        const fixed = this.localToBoard(anchor);
        this.width = Math.abs(corner.x - anchor.x);
        const bounds = this.getLocalBounds();
        const moved = this.localToBoard({
            x: anchor.x < corner.x ? bounds.x : bounds.x + bounds.width,
            y: anchor.y < corner.y ? bounds.y : bounds.y + bounds.height,
        });
        this.x += fixed.x - moved.x;
        this.y += fixed.y - moved.y;
    }

    protected draw(context: CanvasRenderingContext2D): void {
        // Lays out the lines again, if anything changed.
        this.getLocalBounds();
        context.font = `${DEFAULT_FONT_STYLE} ${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
        context.font = this._font();
        context.fillStyle = this.fill;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.direction = this.direction;
        this._lines.forEach((line, i) => context.fillText(line, 0, i * this._lineHeight));
    }

    private _font(): string {
        return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    }

    // Breaks the text at \n, then at the last space that keeps each line within width.
    private _wrap(context: CanvasRenderingContext2D, width: number): string[] {
        const lines: string[] = [];
        for (const paragraph of this.text.split("\n")) {
            let line: string | null = null;
            for (const word of paragraph.split(" ")) {
                const longer: string = line === null ? word : `${line} ${word}`;
                if (line !== null && context.measureText(longer).width > width) {
                    lines.push(line);
                    line = word;
                } else {
                    line = longer;
                }
            }
            lines.push(line ?? "");
        }
        return lines;
    }

    private _fontLoaded(font: string, text: string): boolean {
        try {
            return document.fonts.check(font, text);
        } catch {
            return true;
        }
    }
}
