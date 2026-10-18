import type { Canvas } from "./canvas.js";

export interface NodeOptions {
    x?: number;
    y?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    opacity?: number;
    visible?: boolean;
}

export abstract class Node {
    x: number;
    y: number;
    /** Rotation around the node's position, in radians. */
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    visible: boolean;

    constructor({
        x = 0,
        y = 0,
        rotation = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1,
        visible = true,
    }: NodeOptions = {}) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.opacity = opacity;
        this.visible = visible;
    }

    render(context: CanvasRenderingContext2D): void {
        if (!this.visible || this.opacity <= 0) {
            return;
        }

        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.rotation);
        context.scale(this.scaleX, this.scaleY);
        context.globalAlpha *= this.opacity;
        this.draw(context);
        context.restore();
    }

    /**
     * Draws the node in its own coordinate space, with (0, 0) at the node's
     * position. Any context state changed here is restored after drawing.
     */
    protected abstract draw(context: CanvasRenderingContext2D): void;
}
