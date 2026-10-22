let sharedContext: CanvasRenderingContext2D | null = null;

/**
 * A hidden 2D context shared for measuring text and testing
 * points against paths. Its transform is always the identity.
 * @returns The shared context, created on first use.
 */
export function sharedContextInstance(): CanvasRenderingContext2D {
    if (!sharedContext) {
        const context = document.createElement("canvas").getContext("2d");
        if (!context) {
            throw new Error("Could not get a 2D context for hit-testing.");
        }
        sharedContext = context;
    }
    return sharedContext;
}
