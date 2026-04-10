import { describe, expect, it } from "vitest";

import {
	getHookCursorScreenPoint,
	getHookMouseButton,
	getWindowBoundsFromNativeSource,
	mergePendingCursorSamples,
	normalizeCursorPointForBounds,
	normalizeHookMouseButton,
} from "./cursorTelemetry";
import { getDisplayBoundsForSource } from "./windowBounds";

describe("cursorTelemetry helpers", () => {
	it("normalizes hook mouse button codes", () => {
		expect(normalizeHookMouseButton(undefined)).toBe(1);
		expect(normalizeHookMouseButton(2)).toBe(2);
		expect(normalizeHookMouseButton(39)).toBe(2);
		expect(normalizeHookMouseButton(3)).toBe(3);
		expect(normalizeHookMouseButton(38)).toBe(3);
	});

	it("reads hook mouse button and cursor screen points from alternate event shapes", () => {
		expect(getHookMouseButton({ data: { mouseButton: 39 } })).toBe(2);
		expect(getHookCursorScreenPoint({ data: { screenX: 10, screenY: 20 } })).toEqual({
			x: 10,
			y: 20,
		});
		expect(getHookCursorScreenPoint({ screenX: "bad", screenY: 20 })).toBeNull();
	});

	it("normalizes cursor points and validates native window bounds", () => {
		expect(
			normalizeCursorPointForBounds({ x: 75, y: 25 }, { x: 50, y: 0, width: 100, height: 50 }),
		).toEqual({
			cx: 0.25,
			cy: 0.5,
		});
		expect(
			getWindowBoundsFromNativeSource({
				id: "window:1",
				name: "Docs",
				x: 1,
				y: 2,
				width: 300,
				height: 200,
			}),
		).toEqual({ x: 1, y: 2, width: 300, height: 200 });
		expect(
			getWindowBoundsFromNativeSource({
				id: "window:1",
				name: "Docs",
				x: 1,
				y: 2,
				width: 0,
				height: 200,
			}),
		).toBeNull();
	});

	it("normalizes cursor points using selected window bounds or selected display provenance", () => {
		const selectedWindowBounds = getWindowBoundsFromNativeSource({
			id: "window:7",
			name: "Docs",
			x: 320,
			y: 180,
			width: 1280,
			height: 720,
		});

		expect(selectedWindowBounds).toEqual({
			x: 320,
			y: 180,
			width: 1280,
			height: 720,
		});
		expect(normalizeCursorPointForBounds({ x: 960, y: 540 }, selectedWindowBounds!)).toEqual({
			cx: 0.5,
			cy: 0.5,
		});

		const primaryDisplayBounds = { x: 0, y: 0, width: 1920, height: 1080 };
		const selectedDisplayBounds = getDisplayBoundsForSource(
			{ id: "screen:2", name: "Display 2", display_id: "999" },
			[{ id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }],
			primaryDisplayBounds,
		);

		expect(selectedDisplayBounds).toEqual(primaryDisplayBounds);
		expect(normalizeCursorPointForBounds({ x: 960, y: 540 }, selectedDisplayBounds)).toEqual({
			cx: 0.5,
			cy: 0.5,
		});
	});

	it("merges pending cursor samples without duplicating past timestamps", () => {
		const pending = [
			{ timeMs: 10, cx: 0.1, cy: 0.1 },
			{ timeMs: 20, cx: 0.2, cy: 0.2 },
		];
		const active = [
			{ timeMs: 15, cx: 0.15, cy: 0.15 },
			{ timeMs: 25, cx: 0.25, cy: 0.25 },
		];

		expect(mergePendingCursorSamples(pending, active)).toEqual([
			{ timeMs: 10, cx: 0.1, cy: 0.1 },
			{ timeMs: 20, cx: 0.2, cy: 0.2 },
			{ timeMs: 25, cx: 0.25, cy: 0.25 },
		]);
	});
});
