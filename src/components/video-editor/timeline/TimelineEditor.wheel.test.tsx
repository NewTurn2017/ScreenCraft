// @vitest-environment happy-dom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimelineEditor from "./TimelineEditor";

const timelineEditorTestState = vi.hoisted(() => ({
	latestWrapperProps: null as null | {
		range: { start: number; end: number };
		onRangeChange: (
			value:
				| { start: number; end: number }
				| ((previous: { start: number; end: number }) => { start: number; end: number }),
		) => void;
	},
}));

vi.mock("dnd-timeline", () => ({
	useTimelineContext: () => ({
		direction: "ltr",
		range: timelineEditorTestState.latestWrapperProps?.range ?? { start: 0, end: 100_000 },
		sidebarWidth: 0,
		setTimelineRef: vi.fn(),
		style: {},
		valueToPixels: (value: number) => value,
		pixelsToValue: (value: number) => value,
	}),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuItem: ({
		children,
		onClick,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
	}) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string) => key,
}));

vi.mock("@/contexts/ShortcutsContext", () => ({
	useShortcuts: () => ({ shortcuts: [], isMac: false }),
}));

vi.mock("@/lib/shortcuts", () => ({
	matchesShortcut: () => false,
}));

vi.mock("@/utils/platformUtils", () => ({
	formatShortcut: async (parts: string[]) => parts.join("+"),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

vi.mock("../editorPreferences", () => ({
	loadEditorPreferences: () => ({
		customAspectWidth: "16",
		customAspectHeight: "9",
	}),
	saveEditorPreferences: vi.fn(),
}));

vi.mock("../projectPersistence", () => ({
	toFileUrl: (value: string) => value,
}));

vi.mock("../TutorialHelp", () => ({
	TutorialHelp: () => null,
}));

vi.mock("./KeyframeMarkers", () => ({
	default: () => null,
}));

vi.mock("./Item", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./Row", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./TimelineWrapper", () => ({
	clampTimelineRange: (range: { start: number; end: number }) => range,
	default: ({
		children,
		range,
		onRangeChange,
	}: {
		children: React.ReactNode;
		range: { start: number; end: number };
		onRangeChange: (
			value:
				| { start: number; end: number }
				| ((previous: { start: number; end: number }) => { start: number; end: number }),
		) => void;
	}) => {
		timelineEditorTestState.latestWrapperProps = { range, onRangeChange };
		return <div data-testid="timeline-wrapper">{children}</div>;
	},
}));

vi.mock("./zoomSuggestionUtils", () => ({
	detectInteractionCandidates: () => [],
	normalizeCursorTelemetry: () => [],
}));

function createProps() {
	return {
		videoDuration: 100,
		currentTime: 0,
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
	};
}

function getLatestWrapperProps() {
	if (!timelineEditorTestState.latestWrapperProps) {
		throw new Error("TimelineWrapper props were not captured");
	}

	return timelineEditorTestState.latestWrapperProps;
}

async function dispatchWheel(target: HTMLDivElement, init: WheelEventInit) {
	const event = new WheelEvent("wheel", {
		bubbles: true,
		cancelable: true,
		...init,
	});

	const modifierState = {
		Shift: Boolean(init.shiftKey),
		Control: Boolean(init.ctrlKey),
		Meta: Boolean(init.metaKey),
	};

	Object.defineProperties(event, {
		shiftKey: {
			configurable: true,
			value: modifierState.Shift,
		},
		ctrlKey: {
			configurable: true,
			value: modifierState.Control,
		},
		metaKey: {
			configurable: true,
			value: modifierState.Meta,
		},
		clientX: {
			configurable: true,
			value: init.clientX ?? 0,
		},
		getModifierState: {
			configurable: true,
			value: (key: string) => modifierState[key as keyof typeof modifierState] ?? false,
		},
	});

	flushSync(() => {
		target.dispatchEvent(event);
	});

	return event;
}

async function renderTimelineEditor() {
	const host = document.createElement("div");
	document.body.appendChild(host);

	const root = createRoot(host);

	flushSync(() => {
		root.render(<TimelineEditor {...createProps()} />);
	});

	await Promise.resolve();

	const wrapper = host.querySelector('[data-testid="timeline-wrapper"]');
	if (!(wrapper instanceof HTMLDivElement) || !(wrapper.parentElement instanceof HTMLDivElement)) {
		throw new Error("Timeline wheel target was not rendered");
	}

	const wheelTarget = wrapper.parentElement;
	Object.defineProperty(wheelTarget, "clientWidth", {
		configurable: true,
		value: 500,
	});
	Object.defineProperty(wheelTarget, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			bottom: 100,
			height: 100,
			left: 0,
			right: 500,
			top: 0,
			width: 500,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}),
	});

	return {
		root,
		wheelTarget,
		async setVisibleRange(range: { start: number; end: number }) {
			flushSync(() => {
				getLatestWrapperProps().onRangeChange(range);
			});
		},
		getRange() {
			return getLatestWrapperProps().range;
		},
	};
}

let mountedRoot: Root | null = null;

afterEach(async () => {
	if (mountedRoot) {
		flushSync(() => {
			mountedRoot?.unmount();
		});
	}

	mountedRoot = null;
	timelineEditorTestState.latestWrapperProps = null;
	document.body.innerHTML = "";
	vi.clearAllMocks();
});

describe("TimelineEditor wheel interactions", () => {
	it("pans the visible range for plain horizontal wheel input", async () => {
		const view = await renderTimelineEditor();
		mountedRoot = view.root;

		await view.setVisibleRange({ start: 10_000, end: 60_000 });

		const event = await dispatchWheel(view.wheelTarget, {
			deltaX: 100,
		});

		expect(event.defaultPrevented).toBe(true);
		expect(view.getRange()).toEqual({ start: 20_000, end: 70_000 });
	});

	it("treats Shift + wheel as horizontal panning", async () => {
		const view = await renderTimelineEditor();
		mountedRoot = view.root;

		await view.setVisibleRange({ start: 20_000, end: 70_000 });

		const event = await dispatchWheel(view.wheelTarget, {
			deltaY: 50,
			shiftKey: true,
		});

		expect(event.defaultPrevented).toBe(true);
		expect(view.getRange()).toEqual({ start: 25_000, end: 75_000 });
	});

	it("changes the visible range for Ctrl/Cmd + wheel zoom", async () => {
		const view = await renderTimelineEditor();
		mountedRoot = view.root;

		await view.setVisibleRange({ start: 10_000, end: 60_000 });

		const event = await dispatchWheel(view.wheelTarget, {
			clientX: 125,
			ctrlKey: true,
			deltaY: -100,
		});

		expect(event.defaultPrevented).toBe(true);
		expect(view.getRange()).toEqual({ start: 12_500, end: 52_500 });
	});
});
