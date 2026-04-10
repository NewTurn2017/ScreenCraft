import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("dnd-timeline", () => ({
	useItem: vi.fn(() => ({
		attributes: {},
		itemContentStyle: { width: 2 },
		itemStyle: { left: 0, width: 2 },
		listeners: {},
		setNodeRef: vi.fn(),
	})),
}));

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string) => key,
}));

vi.mock("./ItemGlass.module.css", () => ({
	default: {
		glassAmber: "glassAmber",
		glassGreen: "glassGreen",
		glassPurple: "glassPurple",
		glassRed: "glassRed",
		glassYellow: "glassYellow",
		left: "left",
		selected: "selected",
		right: "right",
		zoomEndCap: "zoomEndCap",
	},
}));

import Item from "./Item";

describe("Item resize affordance guardrails", () => {
	it("keeps the minimum visual width and resize handle hit targets from shrinking", () => {
		const markup = renderToStaticMarkup(
			<Item id="speed-1" rowId="row-speed" span={{ end: 1500, start: 0 }} variant="speed">
				Speed
			</Item>,
		);

		expect(markup).toContain("min-width:8px");
		expect(markup).toContain("min-width:28px");
		expect(markup).toContain('title="resizeLeft"');
		expect(markup).toContain('title="resizeRight"');
		expect(markup.match(/width:10px/g) ?? []).toHaveLength(2);
		expect(markup.match(/cursor:col-resize/g) ?? []).toHaveLength(2);
	});
});
