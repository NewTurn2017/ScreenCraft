// @vitest-environment happy-dom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Range } from "dnd-timeline";

import TimelineWrapper from "./TimelineWrapper";

const timelineWrapperTestState = vi.hoisted(() => ({
	latestContextProps: null as null | {
		onRangeChanged: (updater: (previous: Range) => Range) => void;
	},
}));

vi.mock("dnd-timeline", () => ({
	TimelineContext: ({
		children,
		onRangeChanged,
	}: {
		children: React.ReactNode;
		onRangeChanged: (updater: (previous: Range) => Range) => void;
	}) => {
		timelineWrapperTestState.latestContextProps = { onRangeChanged };
		return <div data-testid="timeline-context">{children}</div>;
	},
}));

function getLatestContextProps() {
	if (!timelineWrapperTestState.latestContextProps) {
		throw new Error("TimelineContext props were not captured");
	}

	return timelineWrapperTestState.latestContextProps;
}

function renderTimelineWrapper(
	overrides: Partial<React.ComponentProps<typeof TimelineWrapper>> = {},
) {
	const host = document.createElement("div");
	document.body.appendChild(host);

	const root = createRoot(host);
	const onRangeChange = vi.fn();

	flushSync(() => {
		root.render(
			<TimelineWrapper
				range={{ start: 0, end: 120_000 }}
				videoDuration={120}
				hasOverlap={() => false}
				onRangeChange={onRangeChange}
				minItemDurationMs={100}
				minVisibleRangeMs={300}
				onItemSpanChange={vi.fn()}
				{...overrides}
			>
				<div />
			</TimelineWrapper>,
		);
	});

	return { host, root, onRangeChange };
}

let mountedRoot: Root | null = null;

afterEach(() => {
	if (mountedRoot) {
		flushSync(() => {
			mountedRoot?.unmount();
		});
	}
	mountedRoot = null;
	timelineWrapperTestState.latestContextProps = null;
	document.body.innerHTML = "";
	vi.clearAllMocks();
});

describe("TimelineWrapper controlled range updates", () => {
	it("applies Ctrl/Cmd-wheel zoom updaters through the controlled range callback", () => {
		const view = renderTimelineWrapper();
		mountedRoot = view.root;

		flushSync(() => {
			getLatestContextProps().onRangeChanged((previous) => ({
				start: previous.start + 20_000,
				end: previous.end - 20_000,
			}));
		});

		expect(view.onRangeChange).toHaveBeenCalledTimes(1);

		const commitRange = view.onRangeChange.mock.calls[0][0] as (previous: Range) => Range;
		expect(commitRange({ start: 0, end: 120_000 })).toEqual({
			start: 20_000,
			end: 100_000,
		});
	});

	it("clamps modifier-wheel zoom updaters to a valid visible range near the timeline end", () => {
		const view = renderTimelineWrapper();
		mountedRoot = view.root;

		flushSync(() => {
			getLatestContextProps().onRangeChanged((previous) => ({
				start: previous.start + 119_900,
				end: previous.end + 100,
			}));
		});

		expect(view.onRangeChange).toHaveBeenCalledTimes(1);

		const commitRange = view.onRangeChange.mock.calls[0][0] as (previous: Range) => Range;
		expect(commitRange({ start: 0, end: 120_000 })).toEqual({
			start: 119_700,
			end: 120_000,
		});
	});
});
