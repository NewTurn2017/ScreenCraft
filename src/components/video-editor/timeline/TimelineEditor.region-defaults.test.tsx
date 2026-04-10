import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();

	return {
		...actual,
		useCallback: function useCallback<T extends (...args: never[]) => unknown>(fn: T) {
			return fn;
		},
		useEffect: function useEffect() {
			return undefined;
		},
		useMemo: function useMemo<T>(factory: () => T) {
			return factory();
		},
		useRef: function useRef<T>(value: T) {
			return { current: value };
		},
		useState: function useState<T>(initial: T | (() => T)) {
			return [typeof initial === "function" ? (initial as () => T)() : initial, vi.fn()];
		},
	};
});

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string) => key,
}));

vi.mock("@/contexts/ShortcutsContext", () => ({
	useShortcuts: () => ({
		shortcuts: {
			addAnnotation: [],
			addKeyframe: [],
			addSpeed: [],
			addTrim: [],
			addZoom: [],
		},
		isMac: false,
	}),
}));

vi.mock("@/lib/shortcuts", () => ({
	matchesShortcut: vi.fn(() => false),
}));

vi.mock("@/utils/platformUtils", () => ({
	formatShortcut: vi.fn(async () => "Mock Shortcut"),
}));

vi.mock("../editorPreferences", () => ({
	loadEditorPreferences: vi.fn(() => ({
		customAspectHeight: "9",
		customAspectWidth: "16",
	})),
	saveEditorPreferences: vi.fn(),
}));

import TimelineEditor from "./TimelineEditor";

type ClickableNode = {
	props?: {
		children?: unknown;
		title?: string;
		onClick?: (() => void | Promise<void>) | undefined;
	};
};

function isClickableNode(node: unknown): node is ClickableNode {
	return typeof node === "object" && node !== null && "props" in node;
}

function findNodeByTitle(node: unknown, title: string): ClickableNode | null {
	if (Array.isArray(node)) {
		for (const child of node) {
			const match = findNodeByTitle(child, title);
			if (match) {
				return match;
			}
		}

		return null;
	}

	if (!isClickableNode(node)) {
		return null;
	}

	if (node.props?.title === title) {
		return node;
	}

	return findNodeByTitle(node.props?.children, title);
}

async function clickToolbarAction(node: unknown, title: string) {
	const match = findNodeByTitle(node, title);

	if (!match?.props?.onClick) {
		throw new Error(`Could not find clickable timeline action: ${title}`);
	}

	await match.props.onClick();
}

function createTimelineEditorProps(overrides: Partial<Parameters<typeof TimelineEditor>[0]> = {}) {
	return {
		videoDuration: 120,
		currentTime: 2,
		onSeek: vi.fn(),
		cursorTelemetry: [],
		zoomRegions: [],
		onZoomAdded: vi.fn(),
		onZoomSuggested: vi.fn(),
		onZoomSpanChange: vi.fn(),
		onZoomDelete: vi.fn(),
		selectedZoomId: null,
		onSelectZoom: vi.fn(),
		trimRegions: [],
		onTrimAdded: vi.fn(),
		onTrimSpanChange: vi.fn(),
		onTrimDelete: vi.fn(),
		selectedTrimId: null,
		onSelectTrim: vi.fn(),
		annotationRegions: [],
		onAnnotationAdded: vi.fn(),
		onAnnotationSpanChange: vi.fn(),
		onAnnotationDelete: vi.fn(),
		selectedAnnotationId: null,
		onSelectAnnotation: vi.fn(),
		speedRegions: [],
		onSpeedAdded: vi.fn(),
		onSpeedSpanChange: vi.fn(),
		onSpeedDelete: vi.fn(),
		selectedSpeedId: null,
		onSelectSpeed: vi.fn(),
		audioRegions: [],
		onAudioAdded: vi.fn(),
		onAudioSpanChange: vi.fn(),
		onAudioDelete: vi.fn(),
		selectedAudioId: null,
		onSelectAudio: vi.fn(),
		aspectRatio: "16:9" as const,
		onAspectRatioChange: vi.fn(),
		...overrides,
	};
}

function getFirstSpan(spy: ReturnType<typeof vi.fn>) {
	const [span] = spy.mock.calls[0] as [{ start: number; end: number }];
	return span;
}

describe("TimelineEditor region default durations", () => {
	it("keeps trim, speed, and text regions on one unified long-clip default that exceeds 1000ms", async () => {
		const onTrimAdded = vi.fn();
		const onSpeedAdded = vi.fn();
		const onAnnotationAdded = vi.fn();

		const tree = TimelineEditor(
			createTimelineEditorProps({
				onAnnotationAdded,
				onSpeedAdded,
				onTrimAdded,
			}),
		);

		await clickToolbarAction(tree, "trim.addTrim");
		await clickToolbarAction(tree, "addSpeed");
		await clickToolbarAction(tree, "annotation.addAnnotation");

		const trimSpan = getFirstSpan(onTrimAdded);
		const speedSpan = getFirstSpan(onSpeedAdded);
		const annotationSpan = getFirstSpan(onAnnotationAdded);

		expect(trimSpan.start).toBe(2000);
		expect(speedSpan.start).toBe(2000);
		expect(annotationSpan.start).toBe(2000);

		expect(trimSpan.end - trimSpan.start).toBeGreaterThan(1000);
		expect(speedSpan.end - speedSpan.start).toBeGreaterThan(1000);
		expect(annotationSpan.end - annotationSpan.start).toBeGreaterThan(1000);

		expect(speedSpan).toEqual(trimSpan);
		expect(annotationSpan).toEqual(trimSpan);
	});

	it("clamps unified trim, speed, and text defaults to the remaining short clip length", async () => {
		const onTrimAdded = vi.fn();
		const onSpeedAdded = vi.fn();
		const onAnnotationAdded = vi.fn();

		const tree = TimelineEditor(
			createTimelineEditorProps({
				currentTime: 0.2,
				videoDuration: 0.6,
				onAnnotationAdded,
				onSpeedAdded,
				onTrimAdded,
			}),
		);

		await clickToolbarAction(tree, "trim.addTrim");
		await clickToolbarAction(tree, "addSpeed");
		await clickToolbarAction(tree, "annotation.addAnnotation");

		expect(getFirstSpan(onTrimAdded)).toEqual({ end: 600, start: 200 });
		expect(getFirstSpan(onSpeedAdded)).toEqual({ end: 600, start: 200 });
		expect(getFirstSpan(onAnnotationAdded)).toEqual({ end: 600, start: 200 });
	});
});
