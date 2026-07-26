import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachSwipe, SwipeDirection } from "./swipe";

/** A pointer gesture from (x0,y0) to (x1,y1), touch by default, over `durationMs` */
function gesture(target: HTMLElement, x0: number, y0: number, x1: number, y1: number, options: { pointerType?: string, durationMs?: number } = {}): void {
    const pointerType = options.pointerType ?? "touch";
    target.dispatchEvent(new PointerEvent("pointerdown", { clientX: x0, clientY: y0, pointerType, bubbles: true }));
    if (options.durationMs != null) {
        vi.advanceTimersByTime(options.durationMs);
    }
    target.dispatchEvent(new PointerEvent("pointerup", { clientX: x1, clientY: y1, pointerType, bubbles: true }));
}

describe("attachSwipe", () => {

    let target: HTMLElement;
    let onSwipe: (direction: SwipeDirection) => void;
    let directions: SwipeDirection[];
    let dispose: () => void;

    beforeEach(() => {
        target = document.createElement("div");
        document.body.appendChild(target);
        directions = [];
        onSwipe = (direction) => directions.push(direction);
        dispose = attachSwipe(target, { onSwipe });
    });

    afterEach(() => {
        dispose();
        target.remove();
        vi.useRealTimers();
    });

    it("fires 'left' for a leftward drag past the threshold", () => {
        gesture(target, 300, 100, 200, 105);
        expect(directions).toEqual(["left"]);
    });

    it("fires 'right' for a rightward drag past the threshold", () => {
        gesture(target, 100, 100, 220, 100);
        expect(directions).toEqual(["right"]);
    });

    it("ignores a drag shorter than the threshold", () => {
        gesture(target, 100, 100, 130, 100);
        expect(directions).toEqual([]);
    });

    it("ignores a mostly-vertical drag (a scroll, not a swipe)", () => {
        gesture(target, 100, 100, 170, 300);
        expect(directions).toEqual([]);
    });

    it("ignores a mouse drag — touch only", () => {
        gesture(target, 100, 100, 220, 100, { pointerType: "mouse" });
        expect(directions).toEqual([]);
    });

    it("ignores a gesture starting inside a [data-no-swipe] ancestor", () => {
        const guarded = document.createElement("div");
        guarded.setAttribute("data-no-swipe", "");
        target.appendChild(guarded);
        gesture(guarded, 100, 100, 220, 100);
        expect(directions).toEqual([]);
    });

    it("ignores a pointercancel — no swipe fires", () => {
        target.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, pointerType: "touch", bubbles: true }));
        target.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
        target.dispatchEvent(new PointerEvent("pointerup", { clientX: 220, clientY: 100, pointerType: "touch", bubbles: true }));
        expect(directions).toEqual([]);
    });

    it("respects a custom threshold", () => {
        dispose();
        directions = [];
        dispose = attachSwipe(target, { onSwipe, threshold: 200 });
        gesture(target, 100, 100, 250, 100); // 150px, under the custom threshold
        expect(directions).toEqual([]);
    });

    it("stops firing once disposed", () => {
        dispose();
        gesture(target, 100, 100, 220, 100);
        expect(directions).toEqual([]);
    });

    it("ignores a gesture slower than maxDurationMs", () => {
        vi.useFakeTimers();
        dispose();
        directions = [];
        dispose = attachSwipe(target, { onSwipe, maxDurationMs: 300 });
        gesture(target, 100, 100, 220, 100, { durationMs: 500 });
        expect(directions).toEqual([]);
    });

});
