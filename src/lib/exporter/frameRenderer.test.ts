import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_WEBCAM_OVERLAY,
	type CursorTelemetryPoint,
} from "../../components/video-editor/types";
import { buildLoopedCursorTelemetry } from "../../components/video-editor/videoPlayback/cursorLoopTelemetry";

vi.mock("pixi.js", () => ({
	Application: vi.fn(),
	Container: vi.fn(),
	Sprite: vi.fn(),
	Graphics: vi.fn(),
	BlurFilter: vi.fn(),
	Texture: {
		from: vi.fn(() => ({ destroy: vi.fn() })),
	},
}));

vi.mock("pixi-filters/motion-blur", () => ({
	MotionBlurFilter: vi.fn(),
}));

vi.mock("@/lib/assetPath", () => ({
	getAssetPath: vi.fn(async (value: string) => value),
	getRenderableAssetUrl: vi.fn((value: string) => value),
}));

vi.mock("@/components/video-editor/videoPlayback/zoomRegionUtils", () => ({
	findDominantRegion: vi.fn(() => ({
		region: null,
		strength: 0,
		blendedScale: 1,
		transition: null,
	})),
}));

vi.mock("@/components/video-editor/videoPlayback/zoomTransform", () => ({
	applyZoomTransform: vi.fn(),
	computeFocusFromTransform: vi.fn(() => ({ cx: 0.5, cy: 0.5 })),
	computeZoomTransform: vi.fn(() => ({ scale: 1, x: 0, y: 0 })),
	createMotionBlurState: vi.fn(() => ({})),
}));

vi.mock("./annotationRenderer", () => ({
	renderAnnotations: vi.fn(),
}));

vi.mock("@/components/video-editor/videoPlayback/cursorRenderer", () => ({
	PixiCursorOverlay: class {
		container = {};
		update = vi.fn();
		destroy = vi.fn();
	},
	DEFAULT_CURSOR_CONFIG: {
		dotRadius: 28,
		smoothingFactor: 0.18,
		motionBlur: 0,
		clickBounce: 1,
		sway: 0,
	},
	preloadCursorAssets: vi.fn(async () => undefined),
}));

import { FrameRenderer } from "./frameRenderer";

type Listener = {
	callback: () => void;
	once: boolean;
};

type MockFn = ReturnType<typeof vi.fn>;

type FrameRendererPrivate = {
	app: { stage: object; renderer: { render: MockFn; canvas: object } };
	cameraContainer: object;
	videoContainer: { addChild: MockFn; position: { set: MockFn }; filters: unknown[] };
	cursorContainer: { addChild: MockFn };
	maskGraphics: { clear: MockFn; roundRect: MockFn; fill: MockFn };
	videoSprite: {
		texture: { destroy: MockFn };
		scale: { set: MockFn };
		position: { set: MockFn };
	};
	cursorOverlay: { update: MockFn; container: object };
	updateAnimationState: (timeMs: number) => number;
	compositeWithShadows: () => void;
	webcamVideoElement: FakeVideoElement;
	webcamFrameCacheCanvas: ReturnType<typeof createMockCanvas>;
	webcamFrameCacheCtx: CanvasRenderingContext2D;
	lastSyncedWebcamTime: number | null;
	currentVideoTime: number;
	animationState: { appliedScale: number };
	webcamSeekPromise: Promise<void> | null;
	syncWebcamFrame: (targetTime: number) => Promise<void>;
	renderFrame: (videoFrame: VideoFrame, timestamp: number) => Promise<void>;
	drawWebcamOverlay: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
};

class FakeVideoElement {
	duration: number;
	readyState: number;
	seeking = false;
	videoWidth: number;
	videoHeight: number;
	muted = true;
	preload = "auto";
	playsInline = true;
	src = "";

	private currentTimeValue: number;
	private listeners = new Map<string, Listener[]>();

	constructor({
		duration = 5,
		currentTime = 0,
		readyState = 2,
		videoWidth = 1280,
		videoHeight = 720,
	}: {
		duration?: number;
		currentTime?: number;
		readyState?: number;
		videoWidth?: number;
		videoHeight?: number;
	} = {}) {
		this.duration = duration;
		this.currentTimeValue = currentTime;
		this.readyState = readyState;
		this.videoWidth = videoWidth;
		this.videoHeight = videoHeight;
	}

	get currentTime() {
		return this.currentTimeValue;
	}

	set currentTime(next: number) {
		this.currentTimeValue = next;
		this.seeking = true;
		queueMicrotask(() => {
			this.seeking = false;
			this.dispatch("seeked");
		});
	}

	addEventListener(
		name: string,
		callback: () => void,
		options?: boolean | AddEventListenerOptions,
	) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push({
			callback,
			once: !!(typeof options === "object" && options?.once),
		});
		this.listeners.set(name, listeners);
	}

	removeEventListener(name: string, callback: () => void) {
		const listeners = this.listeners.get(name) ?? [];
		this.listeners.set(
			name,
			listeners.filter((listener) => listener.callback !== callback),
		);
	}

	load() {
		return undefined;
	}

	pause() {
		return undefined;
	}

	private dispatch(name: string) {
		const listeners = [...(this.listeners.get(name) ?? [])];
		if (listeners.length === 0) {
			return;
		}

		for (const listener of listeners) {
			listener.callback();
			if (listener.once) {
				this.removeEventListener(name, listener.callback);
			}
		}
	}
}

function createMockContext() {
	return {
		beginPath: vi.fn(),
		roundRect: vi.fn(),
		clip: vi.fn(),
		drawImage: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		clearRect: vi.fn(),
		filter: "",
	} as unknown as CanvasRenderingContext2D;
}

function createMockCanvas() {
	const context = createMockContext();
	return {
		width: 0,
		height: 0,
		context,
		getContext: vi.fn(() => context),
	};
}

function createRenderer() {
	return new FrameRenderer({
		width: 1920,
		height: 1080,
		wallpaper: "#000000",
		zoomRegions: [],
		showShadow: false,
		shadowIntensity: 0,
		backgroundBlur: 0,
		cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		webcam: {
			...DEFAULT_WEBCAM_OVERLAY,
			enabled: true,
			mirror: false,
			shadow: 0,
		},
		webcamUrl: "file:///tmp/webcam.webm",
		videoWidth: 1920,
		videoHeight: 1080,
	});
}

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

async function captureExportCursorUpdate(options: {
	cropRegion?: { x: number; y: number; width: number; height: number };
	videoWidth: number;
	videoHeight: number;
	playbackTimeMs: number;
	primePlaybackTimeMs?: number;
	cursorTelemetry: SharedCursorFixturePoint[];
	showCursor?: boolean;
}) {
	const renderer = new FrameRenderer({
		width: 1920,
		height: 1080,
		wallpaper: "#000000",
		zoomRegions: [],
		showShadow: false,
		shadowIntensity: 0,
		backgroundBlur: 0,
		cropRegion: options.cropRegion ?? { x: 0, y: 0, width: 1, height: 1 },
		webcam: {
			...DEFAULT_WEBCAM_OVERLAY,
			enabled: false,
			mirror: false,
			shadow: 0,
		},
		webcamUrl: null,
		videoWidth: options.videoWidth,
		videoHeight: options.videoHeight,
		cursorTelemetry: options.cursorTelemetry,
		showCursor: options.showCursor ?? true,
	}) as unknown as FrameRendererPrivate;

	const overlay = {
		update: vi.fn(),
		container: {},
	};

	renderer.app = {
		stage: {},
		renderer: {
			render: vi.fn(),
			canvas: {},
		},
	};
	renderer.cameraContainer = {};
	renderer.videoContainer = {
		addChild: vi.fn(),
		position: { set: vi.fn() },
		filters: [],
	};
	renderer.cursorContainer = {
		addChild: vi.fn(),
	};
	renderer.maskGraphics = {
		clear: vi.fn(),
		roundRect: vi.fn(),
		fill: vi.fn(),
	};
	renderer.videoSprite = {
		texture: { destroy: vi.fn() },
		scale: { set: vi.fn() },
		position: { set: vi.fn() },
	};
	renderer.cursorOverlay = overlay;
	renderer.updateAnimationState = vi.fn(() => 0);
	renderer.compositeWithShadows = vi.fn();

	if (typeof options.primePlaybackTimeMs === "number") {
		await renderer.renderFrame({} as VideoFrame, options.primePlaybackTimeMs * 1000);
		overlay.update.mockClear();
	}

	await renderer.renderFrame({} as VideoFrame, options.playbackTimeMs * 1000);

	expect(overlay.update).toHaveBeenCalledTimes(1);
	return overlay.update.mock.calls[0];
}

describe("FrameRenderer webcam export path", () => {
	const createdCanvases: ReturnType<typeof createMockCanvas>[] = [];

	beforeEach(() => {
		createdCanvases.length = 0;

		Object.assign(globalThis, {
			window: globalThis,
			requestAnimationFrame: (callback: FrameRequestCallback) => {
				callback(0);
				return 1;
			},
			HTMLMediaElement: {
				HAVE_CURRENT_DATA: 2,
			},
			document: {
				createElement: vi.fn((tag: string) => {
					if (tag !== "canvas") {
						throw new Error(`Unexpected element requested in test: ${tag}`);
					}

					const canvas = createMockCanvas();
					createdCanvases.push(canvas);
					return canvas;
				}),
			},
		});
	});

	it("clamps webcam sync seeks to the media duration", async () => {
		const renderer = createRenderer() as unknown as FrameRendererPrivate;
		const webcamVideo = new FakeVideoElement({ duration: 4.5, currentTime: 0.25 });
		renderer.webcamVideoElement = webcamVideo;

		await renderer.syncWebcamFrame(12);

		expect(webcamVideo.currentTime).toBe(4.5);
		expect(renderer.lastSyncedWebcamTime).toBe(4.5);
		expect(renderer.webcamSeekPromise).toBeNull();
	});

	it("uses the cached webcam frame when the live video is out of sync", () => {
		const renderer = createRenderer() as unknown as FrameRendererPrivate;
		const outputContext = createMockContext();
		const webcamVideo = new FakeVideoElement({
			currentTime: 2,
			readyState: 2,
			videoWidth: 640,
			videoHeight: 360,
		});
		const cachedFrameCanvas = createMockCanvas();
		cachedFrameCanvas.width = 640;
		cachedFrameCanvas.height = 360;

		renderer.webcamVideoElement = webcamVideo;
		renderer.webcamFrameCacheCanvas = cachedFrameCanvas;
		renderer.webcamFrameCacheCtx = cachedFrameCanvas.getContext();
		renderer.lastSyncedWebcamTime = 1.5;
		renderer.currentVideoTime = 2;
		renderer.animationState.appliedScale = 1;

		renderer.drawWebcamOverlay(outputContext, 1280, 720);

		const bubbleCanvas = createdCanvases[0];
		expect(bubbleCanvas).toBeDefined();
		expect((bubbleCanvas.context.drawImage as unknown as MockFn).mock.calls[0][0]).toBe(
			cachedFrameCanvas,
		);
		expect((outputContext.drawImage as unknown as MockFn).mock.calls[0][0]).toBe(bubbleCanvas);
	});

	it("uses the live webcam frame and refreshes the cache when the video is synchronized", () => {
		const renderer = createRenderer() as unknown as FrameRendererPrivate;
		const outputContext = createMockContext();
		const webcamVideo = new FakeVideoElement({
			currentTime: 2,
			readyState: 2,
			videoWidth: 800,
			videoHeight: 600,
		});

		renderer.webcamVideoElement = webcamVideo;
		renderer.lastSyncedWebcamTime = 2;
		renderer.currentVideoTime = 2;
		renderer.animationState.appliedScale = 1;

		renderer.drawWebcamOverlay(outputContext, 1280, 720);

		const bubbleCanvas = createdCanvases[0];
		const cacheCanvas = createdCanvases[1];
		expect(cacheCanvas).toBeDefined();
		expect((cacheCanvas.context.drawImage as unknown as MockFn).mock.calls[0][0]).toBe(webcamVideo);
		expect((bubbleCanvas.context.drawImage as unknown as MockFn).mock.calls[0][0]).toBe(
			webcamVideo,
		);
		expect((outputContext.drawImage as unknown as MockFn).mock.calls[0][0]).toBe(bubbleCanvas);
	});
});

describe("FrameRenderer cursor preview parity", () => {
	it("matches the preview seam for the full-frame fixture", async () => {
		const actual = await captureExportCursorUpdate({
			videoWidth: 1280,
			videoHeight: 720,
			playbackTimeMs: 1500,
			cursorTelemetry: baseCursorTelemetry,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 320, y: 180, width: 1280, height: 720 },
			true,
			true,
		]);
	});

	it("matches the preview seam for the cropped fixture", async () => {
		const actual = await captureExportCursorUpdate({
			cropRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
			videoWidth: 1280,
			videoHeight: 720,
			primePlaybackTimeMs: 1400,
			playbackTimeMs: 1500,
			cursorTelemetry: baseCursorTelemetry,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 640, y: 360, width: 640, height: 360 },
			true,
			false,
		]);
	});

	it("matches the preview seam for the zoom-enabled paused fixture", async () => {
		const actual = await captureExportCursorUpdate({
			videoWidth: 1920,
			videoHeight: 1080,
			playbackTimeMs: 1500,
			cursorTelemetry: baseCursorTelemetry,
		});

		expect(actual).toEqual([
			baseCursorTelemetry,
			1500,
			{ x: 192, y: 108, width: 1536, height: 864 },
			true,
			true,
		]);
	});

	it("matches the preview seam for looped cursor telemetry", async () => {
		const actual = await captureExportCursorUpdate({
			videoWidth: 1280,
			videoHeight: 720,
			playbackTimeMs: 1100,
			cursorTelemetry: loopedCursorTelemetry,
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
