export type SwipeDirection = "left" | "right";

export interface SwipeOptions {
    /** Called once a completed gesture reads as a swipe */
    onSwipe(direction: SwipeDirection): void;
    /** Minimum horizontal distance, in px, to count as a swipe rather than a tap */
    threshold?: number;
    /** How many times larger the horizontal distance must be than the vertical one — rejects a scroll read as a swipe */
    maxOffAxisRatio?: number;
    /** Gestures slower than this read as a drag, not a swipe */
    maxDurationMs?: number;
}

const DEFAULT_THRESHOLD = 60;
const DEFAULT_MAX_OFF_AXIS_RATIO = 2;
const DEFAULT_MAX_DURATION_MS = 600;

/**
 * Detects a horizontal swipe on `target` (ROADMAP tranche 4: "navigation
 * mobile par gestes... porte sur le contenu, pas sur le menu").
 *
 * Dagda has an opinion about *where* a swipe is detected (`PageContainer`
 * attaches this once, to `.shell-content` — see there) and none at all
 * about what it *means*: `onSwipe` is the app's own policy, same split as
 * `dagda-nav-toggle` between `Navbar` and `PageContainer`.
 *
 * Deliberately built on pointer `down`/`up`/`cancel` only, never `move`:
 * there is nothing here to call `preventDefault()` on, so native scrolling
 * inside the content area is never at risk of being broken by this — the
 * usual failure mode of a hand-rolled swipe detector.
 *
 * @returns a disposer removing the listeners
 */
export function attachSwipe(target: HTMLElement, options: SwipeOptions): () => void {
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const maxOffAxisRatio = options.maxOffAxisRatio ?? DEFAULT_MAX_OFF_AXIS_RATIO;
    const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    function onPointerDown(event: PointerEvent): void {
        // Touch only: a mouse drag is text selection, and a wide table or
        // Monaco's editor overlay are both full of them.
        if (event.pointerType !== "touch") {
            return;
        }
        // Opt-out ancestor: a horizontally-scrollable widget (a wide table,
        // the editor) sets this so a swipe meant for it doesn't also change
        // the page underneath.
        if (event.target instanceof Element && event.target.closest("[data-no-swipe]") != null) {
            return;
        }
        tracking = true;
        startX = event.clientX;
        startY = event.clientY;
        startTime = performance.now();
    }

    function onPointerUp(event: PointerEvent): void {
        if (!tracking) {
            return;
        }
        tracking = false;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const duration = performance.now() - startTime;

        if (duration > maxDurationMs) {
            return;
        }
        if (Math.abs(dx) < threshold) {
            return;
        }
        if (Math.abs(dx) <= Math.abs(dy) * maxOffAxisRatio) {
            // Not horizontal-dominant enough — a vertical scroll, not a swipe.
            return;
        }
        options.onSwipe(dx < 0 ? "left" : "right");
    }

    function onPointerCancel(): void {
        tracking = false;
    }

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);

    return () => {
        target.removeEventListener("pointerdown", onPointerDown);
        target.removeEventListener("pointerup", onPointerUp);
        target.removeEventListener("pointercancel", onPointerCancel);
    };
}
