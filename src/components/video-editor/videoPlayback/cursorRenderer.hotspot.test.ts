import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => ({
	Assets: {
		load: vi.fn().mockResolvedValue(undefined),
	},
	BlurFilter: class BlurFilter {
		blur = 0;
		quality = 0;
		padding = 0;

		destroy() {
			return undefined;
		}
	},
	Container: class Container {
		label = "";
		filters: unknown = null;
		children = [] as unknown[];
		visible = true;

		addChild(...children: unknown[]) {
			this.children = [...this.children, ...children];
		}

		destroy() {
			return undefined;
		}
	},
	Graphics: class Graphics {
		clear() {
			return undefined;
		}

		destroy() {
			return undefined;
		}
	},
	Sprite: class Sprite {
		anchor = { set: vi.fn() };
		visible = false;
		tint = 0;
		alpha = 1;
		filters: unknown = null;
		height = 0;
		width = 0;
		rotation = 0;
		scale = { set: vi.fn() };
		position = { set: vi.fn() };

		constructor(public texture: unknown) {}
	},
	Texture: {
		from: vi.fn((url: string) => ({ url })),
	},
}));

vi.mock("pixi-filters/motion-blur", () => ({
	MotionBlurFilter: class MotionBlurFilter {
		velocity = { x: 0, y: 0 };
		kernelSize = 5;
		offset = 0;

		destroy() {
			return undefined;
		}
	},
}));

vi.mock("./uploadedCursorAssets", () => ({
	UPLOADED_CURSOR_SAMPLE_SIZE: 100,
	uploadedCursorAssets: {
		arrow: {
			url: "uploaded-arrow.svg",
			trim: { x: 0, y: 0, width: 20, height: 40 },
			fallbackAnchor: { x: 0.1, y: 0.2 },
		},
		text: {
			url: "uploaded-text.svg",
			trim: { x: 0, y: 0, width: 30, height: 60 },
			fallbackAnchor: { x: 0.2, y: 0.3 },
		},
	},
}));

const IMAGE_DIMENSIONS = new Map<string, { width: number; height: number }>([
	["uploaded-arrow.svg", { width: 100, height: 100 }],
	["uploaded-text.svg", { width: 100, height: 100 }],
]);

class FakeImage {
	public naturalWidth = 0;
	public naturalHeight = 0;
	public onload: null | (() => void) = null;
	public onerror: null | (() => void) = null;

	set src(value: string) {
		const fromDataUrl = value.match(/mock-canvas:(\d+)x(\d+)/);
		const dimensions = fromDataUrl
			? {
					width: Number.parseInt(fromDataUrl[1], 10),
					height: Number.parseInt(fromDataUrl[2], 10),
				}
			: (IMAGE_DIMENSIONS.get(value) ?? { width: 32, height: 32 });

		this.naturalWidth = dimensions.width;
		this.naturalHeight = dimensions.height;
		queueMicrotask(() => {
			this.onload?.();
		});
	}
}

function createDocumentCanvas() {
	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => ({ drawImage: vi.fn() })),
		toDataURL: vi.fn(function toDataUrl(this: { width: number; height: number }) {
			return `mock-canvas:${this.width}x${this.height}`;
		}),
	};

	return canvas;
}

function createDrawContext() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		drawImage: vi.fn(),
		filter: "",
		globalAlpha: 1,
	} as unknown as CanvasRenderingContext2D & {
		drawImage: ReturnType<typeof vi.fn>;
	};
}

async function loadCursorRenderer(): Promise<typeof import("./cursorRenderer")> {
	const module: typeof import("./cursorRenderer") = await import("./cursorRenderer");
	await module.preloadCursorAssets();
	return module;
}

describe("cursorRenderer hotspot regression coverage", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubGlobal("Image", FakeImage);
		vi.stubGlobal("navigator", { platform: "MacIntel" });
		vi.stubGlobal("document", {
			createElement: vi.fn((tagName: string) => {
				if (tagName !== "canvas") {
					throw new Error(`Unexpected element requested: ${tagName}`);
				}

				return createDocumentCanvas();
			}),
		});
		vi.stubGlobal("window", {
			electronAPI: {
				getSystemCursorAssets: vi.fn().mockResolvedValue({
					success: true,
					cursors: {
						arrow: {
							dataUrl: "system-arrow.png",
							hotspotX: 15,
							hotspotY: 20,
							width: 20,
							height: 40,
						},
						text: {
							dataUrl: "system-text.png",
							hotspotX: 10,
							hotspotY: 45,
							width: 30,
							height: 60,
						},
					},
				}),
			},
		});
	});

	it("renders the arrow cursor using the system hotspot when native metadata is available", async () => {
		const { DEFAULT_CURSOR_CONFIG, SmoothedCursorState, drawCursorOnCanvas } =
			await loadCursorRenderer();
		const context = createDrawContext();
		const smoothedState = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);

		drawCursorOnCanvas(
			context,
			[{ timeMs: 0, cx: 0.5, cy: 0.25, interactionType: "move", cursorType: "arrow" }],
			0,
			{ x: 100, y: 50, width: 1920, height: 1080 },
			smoothedState,
		);

		expect(context.drawImage).toHaveBeenCalledTimes(1);
		expect(context.drawImage.mock.calls[0]?.[1]).toBeCloseTo(1049.5, 6);
		expect(context.drawImage.mock.calls[0]?.[2]).toBeCloseTo(306, 6);
	});

	it("renders a non-arrow cursor using its own hotspot rather than reusing the arrow anchor", async () => {
		const { DEFAULT_CURSOR_CONFIG, SmoothedCursorState, drawCursorOnCanvas } =
			await loadCursorRenderer();
		const context = createDrawContext();
		const smoothedState = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);

		drawCursorOnCanvas(
			context,
			[{ timeMs: 0, cx: 0.5, cy: 0.25, interactionType: "move", cursorType: "text" }],
			0,
			{ x: 100, y: 50, width: 1920, height: 1080 },
			smoothedState,
		);

		expect(context.drawImage).toHaveBeenCalledTimes(1);
		expect(context.drawImage.mock.calls[0]?.[1]).toBeCloseTo(1055.333333, 6);
		expect(context.drawImage.mock.calls[0]?.[2]).toBeCloseTo(299, 6);
	});

	it("snaps to the exact click sample instead of lagging behind smoothed motion on click frames", async () => {
		const { DEFAULT_CURSOR_CONFIG, SmoothedCursorState, drawCursorOnCanvas } =
			await loadCursorRenderer();
		const context = createDrawContext();
		const smoothedState = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
		const viewport = { x: 100, y: 50, width: 1920, height: 1080 };
		const samples = [
			{ timeMs: 0, cx: 0.2, cy: 0.8, interactionType: "move", cursorType: "arrow" },
			{ timeMs: 100, cx: 0.5, cy: 0.25, interactionType: "click", cursorType: "arrow" },
		] as const;

		drawCursorOnCanvas(context, [samples[0]], 0, viewport, smoothedState);
		context.drawImage.mockClear();

		drawCursorOnCanvas(context, [...samples], 100, viewport, smoothedState);

		expect(context.drawImage).toHaveBeenCalledTimes(1);
		expect(context.drawImage.mock.calls[0]?.[1]).toBeCloseTo(1049.5, 6);
		expect(context.drawImage.mock.calls[0]?.[2]).toBeCloseTo(306, 6);
	});

	it("keeps the cursor pinned to the click position during the click animation even if a move sample follows immediately", async () => {
		const { DEFAULT_CURSOR_CONFIG, SmoothedCursorState, drawCursorOnCanvas } =
			await loadCursorRenderer();
		const context = createDrawContext();
		const smoothedState = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
		const viewport = { x: 100, y: 50, width: 1920, height: 1080 };
		const samples = [
			{ timeMs: 0, cx: 0.2, cy: 0.8, interactionType: "move", cursorType: "arrow" },
			{ timeMs: 100, cx: 0.5, cy: 0.25, interactionType: "click", cursorType: "arrow" },
			{ timeMs: 108, cx: 0.5, cy: 0.29, interactionType: "move", cursorType: "arrow" },
		] as const;

		drawCursorOnCanvas(context, [samples[0]], 0, viewport, smoothedState);
		context.drawImage.mockClear();

		drawCursorOnCanvas(context, [...samples], 108, viewport, smoothedState);

		expect(context.drawImage).toHaveBeenCalledTimes(1);
		expect(context.drawImage.mock.calls[0]?.[1]).toBeCloseTo(1049.5, 0);
		expect(context.drawImage.mock.calls[0]?.[2]).toBeCloseTo(306, 0);
	});
});
