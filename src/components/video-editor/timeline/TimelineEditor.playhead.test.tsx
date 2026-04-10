import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookRuntime = vi.hoisted(() => {
	type EffectCallback = () => void | (() => void);
	type ComponentStore = {
		states: unknown[];
		refs: unknown[];
		setters: ReturnType<typeof vi.fn>[];
	};

	const stores = new Map<string, ComponentStore>();
	let currentComponent = "";
	let hookIndex = 0;
	let pendingEffects: EffectCallback[] = [];

	const getStore = (component: string) => {
		const existing = stores.get(component);
		if (existing) {
			return existing;
		}

		const created: ComponentStore = {
			states: [],
			refs: [],
			setters: [],
		};
		stores.set(component, created);
		return created;
	};

	return {
		begin(component: string) {
			currentComponent = component;
			hookIndex = 0;
			pendingEffects = [];
		},
		flushEffects() {
			for (const effect of pendingEffects) {
				effect();
			}
			pendingEffects = [];
		},
		reset() {
			stores.clear();
			currentComponent = "";
			hookIndex = 0;
			pendingEffects = [];
		},
		render<Result>(component: string, render: () => Result) {
			this.begin(component);
			const result = render();
			this.flushEffects();
			return result;
		},
		useState<T>(initialState: T | (() => T)) {
			const store = getStore(currentComponent);
			const stateIndex = hookIndex++;

			if (!(stateIndex in store.states)) {
				store.states[stateIndex] =
					typeof initialState === "function" ? (initialState as () => T)() : initialState;
			}

			if (!store.setters[stateIndex]) {
				store.setters[stateIndex] = vi.fn((nextState: T | ((previous: T) => T)) => {
					const previousState = store.states[stateIndex] as T;
					store.states[stateIndex] =
						typeof nextState === "function"
							? (nextState as (previous: T) => T)(previousState)
							: nextState;
					return store.states[stateIndex];
				});
			}

			return [
				store.states[stateIndex] as T,
				store.setters[stateIndex] as (next: T | ((previous: T) => T)) => T,
			] as const;
		},
		useRef<T>(initialValue: T) {
			const store = getStore(currentComponent);
			const refIndex = hookIndex++;

			if (!(refIndex in store.refs)) {
				store.refs[refIndex] = { current: initialValue };
			}

			return store.refs[refIndex] as { current: T };
		},
		useMemo<T>(factory: () => T) {
			hookIndex++;
			return factory();
		},
		useCallback<T>(callback: T) {
			hookIndex++;
			return callback;
		},
		useEffect(effect: EffectCallback) {
			hookIndex++;
			pendingEffects.push(effect);
		},
		getSetter(component: string, stateIndex: number) {
			return getStore(component).setters[stateIndex];
		},
		getSetterByOrder(component: string, order: number) {
			return getStore(component).setters.filter(Boolean)[order];
		},
	};
});

const timelineContext = vi.hoisted(() => ({
	value: {
		direction: "ltr" as const,
		range: { start: 5_000, end: 15_000 },
		sidebarWidth: 40,
		style: {},
		setTimelineRef: vi.fn(),
		valueToPixels: (value: number) => value,
		pixelsToValue: (value: number) => value,
	},
}));

vi.mock("react", async () => {
	const actual = await vi.importActual<typeof import("react")>("react");

	return {
		...actual,
		useState: hookRuntime.useState,
		useRef: hookRuntime.useRef,
		useMemo: hookRuntime.useMemo,
		useCallback: hookRuntime.useCallback,
		useEffect: hookRuntime.useEffect,
	};
});

vi.mock("dnd-timeline", () => ({
	useTimelineContext: () => timelineContext.value,
}));

vi.mock("lucide-react", () => {
	const Icon = () => null;
	return {
		Check: Icon,
		ChevronDown: Icon,
		Gauge: Icon,
		MessageSquare: Icon,
		Music: Icon,
		Plus: Icon,
		Scissors: Icon,
		WandSparkles: Icon,
		ZoomIn: Icon,
	};
});

vi.mock("sonner", () => ({
	toast: { error: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children?: ReactNode }) => children ?? null,
	DropdownMenuContent: ({ children }: { children?: ReactNode }) => children ?? null,
	DropdownMenuItem: ({ children }: { children?: ReactNode }) => children ?? null,
	DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string) => key,
}));

vi.mock("@/contexts/ShortcutsContext", () => ({
	useShortcuts: () => ({ shortcuts: {}, isMac: false }),
}));

vi.mock("@/lib/shortcuts", () => ({
	matchesShortcut: () => false,
}));

vi.mock("@/lib/utils", () => ({
	cn: (...classNames: Array<string | false | null | undefined>) =>
		classNames.filter(Boolean).join(" "),
}));

vi.mock("@/utils/aspectRatioUtils", () => ({
	ASPECT_RATIOS: ["native", "16:9"],
	getAspectRatioLabel: (value: string) => value,
	isCustomAspectRatio: (value: string) => value === "custom",
}));

vi.mock("@/utils/platformUtils", () => ({
	formatShortcut: vi.fn().mockResolvedValue("mock-shortcut"),
}));

vi.mock("../editorPreferences", () => ({
	loadEditorPreferences: () => ({ customAspectWidth: "16", customAspectHeight: "9" }),
	saveEditorPreferences: vi.fn(),
}));

vi.mock("../projectPersistence", () => ({
	toFileUrl: (path: string) => path,
}));

vi.mock("../TutorialHelp", () => ({
	TutorialHelp: () => null,
}));

vi.mock("./Item", () => ({
	default: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("./KeyframeMarkers", () => ({
	default: () => null,
}));

vi.mock("./Row", () => ({
	default: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("./TimelineWrapper", () => ({
	clampTimelineRange: (range: { start: number; end: number }) => range,
	default: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("./zoomSuggestionUtils", () => ({
	detectInteractionCandidates: () => [],
	normalizeCursorTelemetry: () => [],
}));

import TimelineEditor from "./TimelineEditor";

type Range = { start: number; end: number };
type PlaybackScenarioOptions = {
	range: Range;
	videoDurationMs: number;
	moveX: number;
	keyframes?: Array<{ id: string; time: number }>;
};
type ComponentFunction<Props extends Record<string, unknown> = Record<string, unknown>> = (
	props: Props,
) => unknown;
type ElementLike = { type: unknown; props: Record<string, unknown> };

function isElementLike(value: unknown): value is ElementLike {
	return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function isNamedComponent(
	element: ElementLike,
	name: string,
): element is ElementLike & {
	type: ComponentFunction;
} {
	return typeof element.type === "function" && element.type.name === name;
}

function findElement(
	node: unknown,
	predicate: (element: ElementLike) => boolean,
): ElementLike | null {
	if (Array.isArray(node)) {
		for (const child of node) {
			const match = findElement(child, predicate);
			if (match) {
				return match;
			}
		}
		return null;
	}

	if (!isElementLike(node)) {
		return null;
	}

	if (predicate(node)) {
		return node;
	}

	return findElement(node.props.children, predicate);
}

function createBaseProps() {
	return {
		videoDuration: 60,
		currentTime: 6,
		onSeek: vi.fn(),
		cursorTelemetry: [],
		zoomRegions: [],
		onZoomAdded: vi.fn(),
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
		aspectRatio: "native" as const,
		onAspectRatioChange: vi.fn(),
	};
}

function setupPlaybackScenario({
	range,
	videoDurationMs,
	moveX,
	keyframes = [],
}: PlaybackScenarioOptions) {
	timelineContext.value = {
		...timelineContext.value,
		range,
	};

	const listeners = new Map<string, (event: { clientX: number }) => void>();
	const baseProps = createBaseProps();
	const onSeek = baseProps.onSeek;

	vi.stubGlobal("window", {
		addEventListener: vi.fn((type: string, listener: (event: { clientX: number }) => void) => {
			listeners.set(type, listener);
		}),
		removeEventListener: vi.fn((type: string) => {
			listeners.delete(type);
		}),
	});

	vi.stubGlobal("document", {
		body: {
			style: {},
		},
	});

	const editorTree = hookRuntime.render("TimelineEditor", () => TimelineEditor(baseProps));
	const timelineElement = findElement(editorTree, (element) =>
		isNamedComponent(element, "Timeline"),
	);

	if (!timelineElement) {
		throw new Error("Timeline element was not found in TimelineEditor output.");
	}

	const renderTimeline = timelineElement.type as ComponentFunction<typeof timelineElement.props>;

	const timelineTree = hookRuntime.render("Timeline", () =>
		renderTimeline({
			...timelineElement.props,
			videoDurationMs,
			keyframes,
		}),
	);

	const playbackCursorElement = findElement(timelineTree, (element) =>
		isNamedComponent(element, "PlaybackCursor"),
	);

	if (!playbackCursorElement) {
		throw new Error("PlaybackCursor element was not found in Timeline output.");
	}

	const renderPlaybackCursor = playbackCursorElement.type as ComponentFunction<
		typeof playbackCursorElement.props
	>;

	(
		playbackCursorElement.props.timelineRef as {
			current: { getBoundingClientRect(): { left: number } } | null;
		}
	).current = {
		getBoundingClientRect: () => ({ left: 100 }),
	};

	const firstCursorTree = hookRuntime.render("PlaybackCursor", () =>
		renderPlaybackCursor({
			...playbackCursorElement.props,
			videoDurationMs,
			keyframes,
		}),
	);

	const dragHandle = findElement(
		firstCursorTree,
		(element) => typeof element.props.onMouseDown === "function",
	);

	if (!dragHandle?.props.onMouseDown) {
		throw new Error("Playback cursor drag handle was not found.");
	}

	const onMouseDown = dragHandle.props.onMouseDown as (event: { stopPropagation(): void }) => void;
	onMouseDown({ stopPropagation: vi.fn() });

	hookRuntime.render("PlaybackCursor", () =>
		renderPlaybackCursor({
			...playbackCursorElement.props,
			videoDurationMs,
			keyframes,
		}),
	);

	const mouseMove = listeners.get("mousemove");
	if (!mouseMove) {
		throw new Error("Playback cursor did not register a mousemove listener while dragging.");
	}

	const rangeSetter = hookRuntime.getSetterByOrder("TimelineEditor", 0);
	const rangeSetterCallsBeforeMove = rangeSetter.mock.calls.length;

	mouseMove({ clientX: 100 + timelineContext.value.sidebarWidth + moveX });

	return {
		onSeek,
		rangeSetter,
		rangeSetterCallsBeforeMove,
	};
}

function expectForwardRangeAdvance(
	rangeSetter: ReturnType<typeof vi.fn>,
	rangeSetterCallsBeforeMove: number,
	previousRange: Range,
	videoDurationMs: number,
) {
	expect(rangeSetter.mock.calls.length).toBeGreaterThan(rangeSetterCallsBeforeMove);

	const lastCall = rangeSetter.mock.calls[rangeSetter.mock.calls.length - 1];
	const rangeUpdate = lastCall?.[0];
	expect(rangeUpdate).toBeTypeOf("function");

	const nextRange = (rangeUpdate as (previous: Range) => Range)(previousRange);
	const previousSpan = previousRange.end - previousRange.start;
	const nextSpan = nextRange.end - nextRange.start;

	expect(nextSpan).toBe(previousSpan);
	expect(nextRange.start).toBeGreaterThan(previousRange.start);
	expect(nextRange.end).toBeGreaterThan(previousRange.end);
	expect(nextRange.end).toBeLessThanOrEqual(videoDurationMs);
}

describe("TimelineEditor playhead edge auto-pan regression coverage", () => {
	beforeEach(() => {
		hookRuntime.reset();
		timelineContext.value = {
			direction: "ltr",
			range: { start: 5_000, end: 15_000 },
			sidebarWidth: 40,
			style: {},
			setTimelineRef: vi.fn(),
			valueToPixels: (value: number) => value,
			pixelsToValue: (value: number) => value,
		};
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("seeks to the visible right edge and should advance the visible range for long recordings", () => {
		const previousRange = { start: 5_000, end: 15_000 };
		const { onSeek, rangeSetter, rangeSetterCallsBeforeMove } = setupPlaybackScenario({
			range: previousRange,
			videoDurationMs: 60_000,
			moveX: 10_000,
		});

		expect(onSeek).toHaveBeenLastCalledWith(15);
		expectForwardRangeAdvance(rangeSetter, rangeSetterCallsBeforeMove, previousRange, 60_000);
	});

	it("keeps keyframe snapping when dragged past the visible edge and should still push the range forward", () => {
		const previousRange = { start: 5_000, end: 15_000 };
		const { onSeek, rangeSetter, rangeSetterCallsBeforeMove } = setupPlaybackScenario({
			range: previousRange,
			videoDurationMs: 60_000,
			moveX: 10_100,
			keyframes: [{ id: "kf-edge", time: 15_000 }],
		});

		expect(onSeek).toHaveBeenLastCalledWith(15);
		expectForwardRangeAdvance(rangeSetter, rangeSetterCallsBeforeMove, previousRange, 60_000);
	});
});
