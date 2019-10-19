import { insertElementAt, moveElementAt, removeElement, removeElementAt, insertElementsAt } from '../util';

import { Split, Direction, SplitLayout, PaneLayout, LayoutMap, Layout } from './types';
import {
	LayoutAction,
	LayoutActionSelectTab,
	LayoutActionCloseTab,
	LayoutActionMoveTab,
	LayoutActionMoveTabSplit,
	moveTab,
} from './actions';

function dirToSplit(dir: Direction): Split {
	switch (dir) {
		case 'left':
		case 'right':
			return 'vertical';
		case 'top':
		case 'bottom':
			return 'horizontal';
	}
}

function corrupt(): never {
	throw new Error('Data corruption');
}

function selectPaneTab(layout: PaneLayout, tab: string): PaneLayout {
	if (layout.order.indexOf(tab) < 0) {
		return layout;
	}

	return { ...layout, active: tab };
}

function insertPaneTab(layout: PaneLayout, tab: string, pos: number): PaneLayout {
	return {
		...layout,
		order: insertElementAt(layout.order, tab, pos),
		active: tab,
	};
}

function movePaneTab(layout: PaneLayout, tab: string, pos: number): PaneLayout {
	const { order } = layout;
	const index = order.indexOf(tab);
	if (index < 0) {
		return layout;
	}

	return {
		...layout,
		order: moveElementAt(order, index, pos),
	};
}

function removePaneTab(layout: PaneLayout, tab: string): PaneLayout {
	let { active, order } = layout;

	const index = order.indexOf(tab);
	if (index < 0) {
		return layout;
	}

	order = removeElementAt(order, index);

	if (tab === active) {
		active = order[Math.min(index, order.length - 1)];
	}
	if (active === undefined) {
		active = null;
	}

	return {
		...layout,
		active,
		order,
	};
}

function insertLayoutChild(layout: Layout, child: number, pos: number): Layout {
	if (layout.split === 'none') {
		return layout;
	}

	return {
		...layout,
		children: insertElementAt(layout.children, child, pos),
	};
}

function unusedID(layouts: LayoutMap): number {
	for (let i = 1; ; i++) {
		if (!layouts.has(i)) {
			return i;
		}
	}
}

function getSplitLayout(layouts: LayoutMap, id: number): SplitLayout | null {
	const layout = layouts.get(id);
	if (!layout || layout.split === 'none') {
		return null;
	}
	return layout;
}

function getPaneLayout(layouts: LayoutMap, id: number): PaneLayout | null {
	const layout = layouts.get(id);
	if (!layout || layout.split !== 'none') {
		return null;
	}
	return layout;
}

// Similar to Map.prototype.update(), but ignores missing elements and split layouts
function updatePaneLayout(layouts: LayoutMap, id: number, updater: (layout: PaneLayout) => PaneLayout): LayoutMap {
	const layout = layouts.get(id);
	if (layout && layout.split === 'none') {
		layouts = layouts.set(id, updater(layout));
	}
	return layouts;
}

function reparentChildren(layouts: LayoutMap, children: ReadonlyArray<number>, parent: number): LayoutMap {
	for (const child of children) {
		const childLayout = layouts.get(child) || corrupt();
		layouts = layouts.set(child, { ...childLayout, parent });
	}

	return layouts;
}

function moveLayout(layouts: LayoutMap, from: number, to: number, parent: number): LayoutMap {
	const layout = layouts.get(from) || corrupt();

	layouts = layouts.delete(from);
	layouts = layouts.set(to, { ...layout, parent });

	if (layout.split !== 'none') {
		layouts = reparentChildren(layouts, layout.children, to);
	}

	return layouts;
}

function checkMerge(layouts: LayoutMap, id: number): LayoutMap {
	const layout = layouts.get(id) || corrupt();

	const { parent } = layout;
	if (!parent || layout.split === 'none') {
		return layouts;
	}

	const parentLayout = getSplitLayout(layouts, parent) || corrupt();
	if (parentLayout.split !== layout.split) {
		return layouts;
	}

	const index = parentLayout.children.indexOf(id);
	if (index < 0) {
		corrupt();
	}

	const children = insertElementsAt(removeElementAt(parentLayout.children, index), layout.children, index);
	layouts = layouts.set(parent, { ...parentLayout, children });
	layouts = layouts.delete(id);
	layouts = reparentChildren(layouts, layout.children, parent);

	return layouts;
}

function checkUnsplit(layouts: LayoutMap, pane: number): LayoutMap {
	const paneLayout = getPaneLayout(layouts, pane);
	if (!paneLayout || paneLayout.order.length > 0 || !paneLayout.parent) {
		return layouts;
	}

	layouts = layouts.delete(pane);

	const parent = paneLayout.parent;
	const parentLayout = getSplitLayout(layouts, parent) || corrupt();
	const remaining = removeElement(parentLayout.children, pane);

	if (remaining.length > 1) {
		return layouts.set(parent, { ...parentLayout, children: remaining });
	}

	layouts = moveLayout(layouts, remaining[0], parent, parentLayout.parent);
	return checkMerge(layouts, parent);
}

type LayoutActionType = LayoutAction['type'];
type LayoutActionOf<K extends LayoutActionType> = Extract<LayoutAction, { type: K }>;
type LayoutActionHandler<K extends LayoutActionType> = (layouts: LayoutMap, action: LayoutActionOf<K>) => LayoutMap;
type LayoutActionHandlerMap = {
	[K in LayoutActionType]: LayoutActionHandler<K>;
};

const HANDLERS: LayoutActionHandlerMap = {
	selectTab(layouts: LayoutMap, { tab, pane }: LayoutActionSelectTab): LayoutMap {
		return updatePaneLayout(layouts, pane, (layout) => selectPaneTab(layout, tab));
	},

	closeTab(layouts: LayoutMap, { tab, pane }: LayoutActionCloseTab): LayoutMap {
		layouts = updatePaneLayout(layouts, pane, (layout) => removePaneTab(layout, tab));
		return checkUnsplit(layouts, pane);
	},

	moveTab(layouts: LayoutMap, { tab, source, dest, pos }: LayoutActionMoveTab): LayoutMap {
		if (source === dest) {
			return updatePaneLayout(layouts, source, (layout) => movePaneTab(layout, tab, pos));
		}

		const sourceLayout = getPaneLayout(layouts, source);
		const destLayout = getPaneLayout(layouts, dest);

		if (!sourceLayout || !destLayout || sourceLayout.order.indexOf(tab) < 0) {
			return layouts;
		}

		layouts = layouts.set(source, removePaneTab(sourceLayout, tab));
		layouts = layouts.set(dest, insertPaneTab(destLayout, tab, pos));

		return checkUnsplit(layouts, source);
	},

	moveTabSplit(layouts: LayoutMap, { tab, source, dest, dir }: LayoutActionMoveTabSplit): LayoutMap {
		const destLayout = getPaneLayout(layouts, dest);
		if (!destLayout) {
			return layouts;
		}
		if (source === dest && destLayout.order.length === 1) {
			return layouts;
		}

		const split = dirToSplit(dir);

		let parent = 0;
		let index = 0;

		if (destLayout.parent) {
			const destParentLayout = getSplitLayout(layouts, destLayout.parent) || corrupt();
			if (destParentLayout.split === split) {
				parent = destLayout.parent;
				index = destParentLayout.children.indexOf(dest);
				if (index < 0) {
					return corrupt();
				}
			}
		}

		if (!parent) {
			parent = dest;

			const moved = unusedID(layouts);
			layouts = moveLayout(layouts, dest, moved, parent);
			layouts = layouts.set(parent, {
				parent: destLayout.parent,
				split,
				children: [moved],
			});

			if (source === dest) {
				source = moved;
			}
		}

		if (dir === 'right' || dir === 'bottom') {
			index++;
		}

		const newID = unusedID(layouts);
		layouts = layouts.set(newID, {
			split: 'none',
			parent,
			order: [],
			active: null,
		});
		layouts = layouts.update(parent, (layout) => insertLayoutChild(layout, newID, index));

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		return layoutReducer(layouts, moveTab(tab, source, newID, 0));
	},
};

export function layoutReducer(layouts: LayoutMap, action: LayoutAction): LayoutMap {
	const handler = HANDLERS[action.type] as LayoutActionHandler<typeof action.type>;
	return handler(layouts, action);
}
