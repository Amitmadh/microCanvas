import { Shape, type ShapeOptions } from "./shape.js";

export interface RectangleOptions extends ShapeOptions {
    width: number;
    height: number;
}

export class Rectangle extends Shape {
    width: number;
    height: number;

    constructor({ width, height, ...options }: RectangleOptions) {
        super(options);
        this.width = width;
        this.height = height;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        context.rect(0, 0, this.width, this.height);
    }
}
