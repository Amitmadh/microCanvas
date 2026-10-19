/** Anything a 2D context accepts as a fill or stroke style. */
export type Paint = string | CanvasGradient | CanvasPattern;

export interface Point {
    x: number;
    y: number;
}

/** An axis-aligned rectangle, positioned by its top-left corner. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
