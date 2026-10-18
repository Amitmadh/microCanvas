import { Node, type NodeOptions } from "./node.js";

export interface ImageOptions extends NodeOptions {
    image: CanvasImageSource;
    /** Defaults to the image's own width, or keeps its aspect ratio if only height is set. */
    width?: number;
    /** Defaults to the image's own height, or keeps its aspect ratio if only width is set. */
    height?: number;
}

/**
 * Draws an image, canvas, video or bitmap with its top-left corner at the
 * node's position. Nothing shows until the source has loaded; use
 * Image.load() to load one from a URL.
 */
export class Image extends Node {
    image: CanvasImageSource;
    private _width: number | undefined;
    private _height: number | undefined;

    constructor({ image, width, height, ...options }: ImageOptions) {
        super(options);
        this.image = image;
        this._width = width;
        this._height = height;
    }

    /** Loads an image from a URL and resolves once it's ready to draw. */
    static async load(url: string, options: Omit<ImageOptions, "image"> = {}): Promise<Image> {
        const element = document.createElement("img");
        element.src = url;
        try {
            await element.decode();
        } catch {
            throw new Error(`Could not load image "${url}".`);
        }
        return new Image({ ...options, image: element });
    }

    get width(): number {
        return this._size().width;
    }

    /** Set to undefined to go back to the image's own width. */
    set width(value: number | undefined) {
        this._width = value;
    }

    get height(): number {
        return this._size().height;
    }

    /** Set to undefined to go back to the image's own height. */
    set height(value: number | undefined) {
        this._height = value;
    }

    protected draw(context: CanvasRenderingContext2D): void {
        // Skip sources that haven't loaded or failed to load; drawImage()
        // throws on a broken image, which would stop the whole render.
        const natural = naturalSize(this.image);
        if (!natural.width || !natural.height) {
            return;
        }

        const { width, height } = this._size();
        context.drawImage(this.image, 0, 0, width, height);
    }

    private _size(): { width: number; height: number } {
        if (this._width !== undefined && this._height !== undefined) {
            return { width: this._width, height: this._height };
        }

        const natural = naturalSize(this.image);
        if (!natural.width || !natural.height) {
            return { width: this._width ?? 0, height: this._height ?? 0 };
        }
        if (this._width !== undefined) {
            return { width: this._width, height: (this._width * natural.height) / natural.width };
        }
        if (this._height !== undefined) {
            return { width: (this._height * natural.width) / natural.height, height: this._height };
        }
        return natural;
    }
}

function naturalSize(source: CanvasImageSource): { width: number; height: number } {
    if ("naturalWidth" in source) {
        return { width: source.naturalWidth, height: source.naturalHeight };
    }
    if ("videoWidth" in source) {
        return { width: source.videoWidth, height: source.videoHeight };
    }
    if ("displayWidth" in source) {
        return { width: source.displayWidth, height: source.displayHeight };
    }
    if (source instanceof SVGImageElement) {
        return { width: source.width.baseVal.value, height: source.height.baseVal.value };
    }
    return { width: source.width, height: source.height };
}
