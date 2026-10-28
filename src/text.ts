import {
    DEFAULT_FILL,
    DEFAULT_FONT_FAMILY,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_STYLE,
    DEFAULT_FONT_WEIGHT,
    DEFAULT_STROKE_WIDTH,
    DEFAULT_TEXT_ALIGN,
    DEFAULT_TEXT_BASELINE,
    DEFAULT_TEXT_DIRECTION,
} from "./config.js";
import { McNode, type McNodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Point, Rect } from "./types.js";

export interface McTextOptions extends McNodeOptions {
    text: string;
    /** Wraps lines to this width, at spaces. Null breaks them only at \n. */
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
    stroke?: Paint | null;
    strokeWidth?: number;
    /** Times the font's height. */
    lineHeight?: number;
    align?: "left" | "center" | "right";
    baseline?: CanvasTextBaseline;
    direction?: "ltr" | "rtl";
    /** Outside the width. */
    padding?: number;
    background?: Paint | null;
    cornerRadius?: number;
    /** Lets the user edit the text in place by double-clicking it. */
    writable?: boolean;
}

export interface McTextJSON extends Required<McTextOptions> {
    type: "text";
}

/**
 * Text aligned to the node's position by align and baseline. Its lines
 * break at \n, and wrap at spaces given a width, and stack below the first.
 */
export class McText extends McNode {
    width: number | null;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    fill: Paint;
    stroke: Paint | null;
    strokeWidth: number;
    lineHeight: number;
    align: "left" | "center" | "right";
    baseline: CanvasTextBaseline;
    direction: "ltr" | "rtl";
    padding: number;
    background: Paint | null;
    cornerRadius: number;
    writable: boolean;
    /** @internal */
    _editing = false;
    private _boundsKey = "";
    private _bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
    private _lines: string[] = [];
    private _lineHeight = 0;
    private _ascent = 0;
    private _descent = 0;
    private _widest = 0;
    private _text = "";

    constructor({
        text,
        width = null,
        fontSize = DEFAULT_FONT_SIZE,
        fontFamily = DEFAULT_FONT_FAMILY,
        fontWeight = DEFAULT_FONT_WEIGHT,
        fontStyle = DEFAULT_FONT_STYLE,
        fill = DEFAULT_FILL,
        stroke = null,
        strokeWidth = DEFAULT_STROKE_WIDTH,
        lineHeight = 1,
        align = DEFAULT_TEXT_ALIGN,
        baseline = DEFAULT_TEXT_BASELINE,
        direction = DEFAULT_TEXT_DIRECTION,
        padding = 0,
        background = null,
        cornerRadius = 0,
        writable = false,
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
        this.stroke = stroke;
        this.strokeWidth = strokeWidth;
        this.lineHeight = lineHeight;
        this.align = align;
        this.baseline = baseline;
        this.direction = direction;
        this.padding = padding;
        this.background = background;
        this.cornerRadius = cornerRadius;
        this.writable = writable;
    }

    /** Its line breaks are kept as \n, as a textarea reports them. */
    get text(): string {
        return this._text;
    }

    set text(text: string) {
        this._text = text.replace(/\r\n?/g, "\n");
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
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            lineHeight: this.lineHeight,
            align: this.align,
            baseline: this.baseline,
            direction: this.direction,
            padding: this.padding,
            background: this.background,
            cornerRadius: this.cornerRadius,
            writable: this.writable,
        };
    }

    /**
     * The widest line's advance width by the lines' full height, grown to fit
     * letters that reach past them, such as italics, then by the outline and padding.
     * @returns The box in the text's own space.
     */
    getLocalBounds(): Rect {
        const font = this._font();
        const outset = this._outset();
        const key = `${font}|${this.align}|${this.baseline}|${this.direction}|${this.width}|${this.lineHeight}|${outset}|${this.text}`;
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
        this._lines = this.width === null ? this.text.split("\n") : this._wrap(context, this.width);
        const first = context.measureText(this._lines[0]);
        this._ascent = first.fontBoundingBoxAscent;
        this._descent = first.fontBoundingBoxDescent;
        this._lineHeight = (this._ascent + this._descent) * this.lineHeight;

        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        let widest = 0;
        this._lines.forEach((line, i) => {
            const metrics = context.measureText(line);
            const y = i * this._lineHeight;
            const width = metrics.width;
            widest = Math.max(widest, width);
            const x = this._lineLeft(width);
            left = Math.min(left, x, -metrics.actualBoundingBoxLeft);
            right = Math.max(right, x + metrics.width, metrics.actualBoundingBoxRight);
            top = Math.min(top, y - Math.max(metrics.fontBoundingBoxAscent, metrics.actualBoundingBoxAscent));
            bottom = Math.max(bottom, y + Math.max(metrics.fontBoundingBoxDescent, metrics.actualBoundingBoxDescent));
        });
        if (this.width !== null) {
            left = Math.min(left, this._lineLeft(this.width));
            right = Math.max(right, this._lineLeft(this.width) + this.width);
        }
        const bounds = {
            x: left - outset,
            y: top - outset,
            width: right - left + 2 * outset,
            height: bottom - top + 2 * outset,
        };

        this._widest = widest;
        this._bounds = bounds;

        // While a web font loads, the text is measured in a fallback.
        this._boundsKey = document.fonts.status === "loading" ? "" : key;
        return bounds;
    }

    resize(anchor: Point, corner: Point): void {
        const fixed = this.localToBoard(anchor);
        this.width = Math.max(0, Math.abs(corner.x - anchor.x) - 2 * this._outset());
        const bounds = this.getLocalBounds();
        const moved = this.localToBoard({
            x: anchor.x < corner.x ? bounds.x : bounds.x + bounds.width,
            y: anchor.y < corner.y ? bounds.y : bounds.y + bounds.height,
        });
        this.x += fixed.x - moved.x;
        this.y += fixed.y - moved.y;
    }

    /**
     * @internal
     * Where Canvas puts the editor: the lines' box by their advance widths
     * and the line height, in the text's own space, the font, and how far
     * a word longer than the width passes it.
     */
    _editorLayout(): { box: Rect; font: string; lineHeight: number; overflow: number } {
        this.getLocalBounds();
        const width = this.width ?? this._widest;
        const halfLeading = (this._lineHeight - this._ascent - this._descent) / 2;
        return {
            box: {
                x: this._lineLeft(width),
                y: -this._ascent - halfLeading,
                width,
                height: this._lines.length * this._lineHeight,
            },
            font: this._font(),
            lineHeight: this._lineHeight,
            overflow: Math.max(0, this._widest - width),
        };
    }

    protected draw(context: CanvasRenderingContext2D): void {
        // Lays out the lines again, if anything changed.
        const bounds = this.getLocalBounds();
        if (this.background) {
            context.beginPath();
            context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, this.cornerRadius);
            context.fillStyle = this.background;
            context.fill();
        }
        if (this._editing) {
            return;
        }

        context.font = `${DEFAULT_FONT_STYLE} ${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
        context.font = this._font();
        context.fillStyle = this.fill;
        context.textAlign = this.align;
        context.textBaseline = this.baseline;
        context.direction = this.direction;
        const stroke = this.strokeWidth > 0 ? this.stroke : null;
        if (stroke) {
            context.strokeStyle = stroke;
            context.lineWidth = this.strokeWidth;
            // Miter corners would pass the bounds.
            context.lineJoin = "round";
        }
        this._lines.forEach((line, i) => {
            const y = i * this._lineHeight;
            context.fillText(line, 0, y);
            if (stroke) {
                context.strokeText(line, 0, y);
            }
        });
    }

    private _font(): string {
        return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    }

    private _outset(): number {
        return this.padding + (this.stroke ? this.strokeWidth / 2 : 0);
    }

    private _lineLeft(width: number): number {
        if (this.align === "center") {
            return -width / 2;
        }
        if (this.align === "right") {
            return -width;
        }
        return 0;
    }

    // Breaks the text at \n, then after the last space or hyphen that keeps
    // each line within width. A longer word overflows it.
    private _wrap(context: CanvasRenderingContext2D, width: number): string[] {
        const lines: string[] = [];
        for (const paragraph of this.text.split("\n")) {
            let line = "";
            for (const word of paragraph.split(/(?<=[ -])/)) {
                if (line && context.measureText((line + word).trimEnd()).width > width) {
                    lines.push(line.trimEnd());
                    line = "";
                }
                line += word;
            }
            lines.push(line.trimEnd());
        }
        return lines;
    }
}
