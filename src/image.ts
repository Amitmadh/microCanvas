import { McNode, type McNodeOptions } from "./node.js";
import type { Point, Rect } from "./types.js";

export interface McImageOptions extends McNodeOptions {
    image: HTMLImageElement;
    /** Defaults to the image's own width, which is 0 until it has loaded. */
    width?: number;
    /** Defaults to the image's own height, which is 0 until it has loaded. */
    height?: number;
}

/**
 * @class McImage
 * @description A picture with its top-left corner at the node's position.
 * Nothing shows until it has loaded; use McImage.load() to load one from a URL.
 */
export class McImage extends McNode {
    image: HTMLImageElement;
    width: number;
    height: number;

    constructor({ image, width = image.naturalWidth, height = image.naturalHeight, ...options }: McImageOptions) {
        super(options);
        this.image = image;
        this.width = width;
        this.height = height;
    }

    static async load(url: string, options: Omit<McImageOptions, "image"> = {}): Promise<McImage> {
        const element = document.createElement("img");
        element.src = url;
        try {
            await element.decode();
        } catch {
            throw new Error(`Could not load image "${url}".`);
        }
        return new McImage({ ...options, image: element });
    }

    getLocalBounds(): Rect {
        return { x: 0, y: 0, width: this.width, height: this.height };
    }

    protected draw(context: CanvasRenderingContext2D): void {
        if (!this._isLoaded()) {
            return;
        }
        context.drawImage(this.image, 0, 0, this.width, this.height);
    }

    /**
     * @method containsLocalPoint
     * @description Hits anywhere in the image's box, transparent pixels
     * included, but only once there's something drawn.
     * @param point The point in the image's own coordinate space.
     * @returns True if the image has loaded and the point is in its box.
     */
    protected containsLocalPoint(point: Point): boolean {
        return this._isLoaded() && super.containsLocalPoint(point);
    }

    private _isLoaded(): boolean {
        return this.image.naturalWidth > 0;
    }
}
