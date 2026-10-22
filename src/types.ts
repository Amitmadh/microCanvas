export type Paint = string;

export interface Point {
    x: number;
    y: number;
}

/** Positioned by its top-left corner. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
