import * as React from 'react';
import { useDrop } from 'react-dnd';

import { TabDragDesc, TabDragType } from './Tab';

export interface TabDropAreaProps {
	realm: symbol;
	ignore?: string;
	className: string;

	onDrop: (tab: string) => void;
}

export function TabDropArea({ className, realm, ignore, onDrop }: TabDropAreaProps): JSX.Element {
	const [{ active, hover }, drop] = useDrop({
		accept: TabDragType,
		canDrop: (tab: TabDragDesc) => tab.realm === realm && tab.id !== ignore,
		drop: (tab: TabDragDesc) => {
			onDrop(tab.id);
		},
		collect: (monitor) => ({
			active: monitor.canDrop(),
			hover: monitor.isOver() && monitor.canDrop(),
		}),
	});

	return (
		<div
			ref={drop}
			className={'dropArea ' + className + (active ? ' active' : '') + (hover ? ' hover' : '')}
		/>
	);
}
