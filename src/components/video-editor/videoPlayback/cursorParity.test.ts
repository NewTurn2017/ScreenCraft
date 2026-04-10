import { describe, expect, it, vi } from "vitest";

import { createVideoEventHandlers } from "./videoEventHandlers";
import { layoutVideoContent } from "./layoutUtils";
import { buildLoopedCursorTelemetry } from "./cursorLoopTelemetry";
import type { CursorTelemetryPoint } from "../types";

type SharedCursorFixturePoint = Pick<
	CursorTelemetryPoint,
	"timeMs" | "cx" | "cy" | "interactionType" | "cursorType"
>;

const baseCursorTelemetry: SharedCursorFixturePoint[] = [
	{ timeMs: 0, cx: 0.1, cy: 0.2, interactionType: "move", cursorType: "arrow" },
	{ timeMs: 900, cx: 0.5, cy: 0.45, interactionType: "click", cursorType: "pointer" },
	{ timeMs: 1500, cx: 0.82, cy: 0.78, interactionType: "move", cursorType: "text" },
];

const loopedCursorTelemetry = buildLoopedCursorTelemetry(baseCursorTelemetry, 1800);

type LayoutParams = Parameters<typeof layoutVideoContent>[0];

function capturePreviewCursorUpdate(options: {
	videoWidth: number;
	videoHeight: number;
	cropRegion?: { x: number; y: number; width: number; height: number };
	playbackTimeSeconds: number;
	telemetry: SharedCursorFixturePoint[];
	isPlaying: boolean;
	isSeeking: boolean;
}) {
	const overlay = {
		update: vi.fn(),
	};
	const currentTimeRef = { current: 0 };
	const isSeekingRef = { current: false };
	const isPlayingRef = { current: options.isPlaying };
	const timeUpdateAnimationRef = { current: null as number | null };
	const video = {
		currentTime: options.playbackTimeSeconds,
		paused: !options.isPlaying,
		ended: false,
		duration: 10,
		pause: vi.fn(),
		playbackRate: 1,
	} as unknown as HTMLVideoElement;

	const { handleSeeked, handleSeeking } = createVideoEventHandlers({
		video,
		isSeekingRef,
		isPlayingRef,
		allowPlaybackRef: { current: true },
		currentTimeRef,
		timeUpdateAnimationRef,
		onPlayStateChange: vi.fn(),
		onTimeUpdate: vi.fn(),
		trimRegionsRef: { current: [] },
		speedRegionsRef: { current: [] },
	});

	if (options.isSeeking) {
		handleSeeking();
	} else {
		handleSeeked();
	}

	const layout = layoutVideoContent({
		container: {
			clientWidth: 1920,
			clientHeight: 1080,
		} as HTMLDivElement,
		app: {
			renderer: { resize: vi.fn() },
			canvas: { style: {} },
		} as unknown as LayoutParams["app"],
		videoSprite: {
			scale: { set: vi.fn() },
			position: { set: vi.fn() },
		} as unknown as LayoutParams["videoSprite"],
		maskGraphics: {
			clear: vi.fn(),
			roundRect: vi.fn(),
			fill: vi.fn(),
		} as unknown as LayoutParams["maskGraphics"],
		videoElement: {
			videoWidth: options.videoWidth,
			videoHeight: options.videoHeight,
		} as HTMLVideoElement,
		cropRegion: options.cropRegion,
		padding: 50,
		borderRadius: 0,
	});

	if (!layout) {
		throw new Error("Expected preview layout to resolve");
	}

	overlay.update(
		options.telemetry,
		currentTimeRef.current,
		layout.maskRect,
		true,
		!isPlayingRef.current || isSeekingRef.current,
	);

	expect(overlay.update).toHaveBeenCalledTimes(1);
	return overlay.update.mock.calls[0];
}

describe("preview cursor parity fixtures", () => {
	it("captures the full-frame preview seam", () => {
		const actual = capturePreviewCursorUpdate({
			videoWidth: 1280,
			videoHeight: 720,
			playbackTimeSeconds: 1.5,
			telemetry: baseCursorTelemetry,
			isPlaying: false,
			isSeeking: false,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 320, y: 180, width: 1280, height: 720 },
			true,
			true,
		]);
	});

	it("captures the crop-enabled preview seam", () => {
		const actual = capturePreviewCursorUpdate({
			videoWidth: 1280,
			videoHeight: 720,
			cropRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
			playbackTimeSeconds: 1.5,
			telemetry: baseCursorTelemetry,
			isPlaying: true,
			isSeeking: false,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 640, y: 360, width: 640, height: 360 },
			true,
			false,
		]);
	});

	it("captures the zoom-enabled paused preview seam", () => {
		const actual = capturePreviewCursorUpdate({
			videoWidth: 1920,
			videoHeight: 1080,
			playbackTimeSeconds: 1.5,
			telemetry: baseCursorTelemetry,
			isPlaying: false,
			isSeeking: false,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 192, y: 108, width: 1536, height: 864 },
			true,
			true,
		]);
	});

	it("captures the looped cursor telemetry preview seam", () => {
		const actual = capturePreviewCursorUpdate({
			videoWidth: 1280,
			videoHeight: 720,
			playbackTimeSeconds: 1.1,
			telemetry: loopedCursorTelemetry,
			isPlaying: false,
			isSeeking: false,
		});

		expect(actual).toEqual([
			loopedCursorTelemetry,
			1100,
			{ x: 320, y: 180, width: 1280, height: 720 },
			true,
			true,
		]);
	});
});
