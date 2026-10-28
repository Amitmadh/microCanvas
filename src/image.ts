import { IMAGE_PLACEHOLDER_FILL } from "./config.js";
import { McNode, type McNodeOptions } from "./node.js";
import type { Point, Rect } from "./types.js";

export interface McImageOptions extends McNodeOptions {
    image: HTMLImageElement;
    /** Defaults to the image's natural width, 0 until it loads. */
    width?: number;
    /** Defaults to the image's natural height, 0 until it loads. */
    height?: number;
}

export interface McImageJSON extends Required<Omit<McImageOptions, "image">> {
    type: "image";
    src: string;
}

/**
 * A picture with its top-left corner at the node's position.
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

        if (!this._isLoaded()) {
            this.image.addEventListener("load", () => {
                // Sizes left at 0 take the natural ones, known now.
                this.width ||= this.image.naturalWidth;
                this.height ||= this.image.naturalHeight;
                this._canvas?.requestRender();
            }, { once: true });
        }
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

    toJSON(): McImageJSON {
        // As given, not resolved against the page.
        const src = this.image.getAttribute("src") ?? this.image.src;
        return { ...super.toJSON(), type: "image", src, width: this.width, height: this.height };
    }

    getLocalBounds(): Rect {
        return { x: 0, y: 0, width: this.width, height: this.height };
    }

    resize(anchor: Point, corner: Point): void {
        const topLeft = this.localToBoard({ x: Math.min(anchor.x, corner.x), y: Math.min(anchor.y, corner.y) });
        this.x = topLeft.x;
        this.y = topLeft.y;
        this.width = Math.abs(corner.x - anchor.x);
        this.height = Math.abs(corner.y - anchor.y);
    }

    protected draw(context: CanvasRenderingContext2D): void {
        if (this._isLoaded()) {
            context.drawImage(this.image, 0, 0, this.width, this.height);
        } else {
            context.fillStyle = IMAGE_PLACEHOLDER_FILL;
            context.fillRect(0, 0, this.width, this.height);
        }
    }

    private _isLoaded(): boolean {
        return this.image.naturalWidth > 0;
    }
}
