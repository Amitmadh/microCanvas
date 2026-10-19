let sharedContext: CanvasRenderingContext2D | null = null;

/**
 * A 2D context that is never shown, shared by all nodes for measuring text and
 * testing points against paths. Its transform is always the identity, so a
 * path traced on it is in whatever space the caller is working in.
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
