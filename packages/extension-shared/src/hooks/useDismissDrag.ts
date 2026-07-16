import { useRef, useState } from 'preact/hooks';

type Axis = 'x' | 'y';
type Gesture =
	| { phase: 'idle' }
	| { phase: 'pending'; pointerId: number; startX: number; startY: number }
	| { phase: 'dragging'; pointerId: number; origin: number };

export type DismissDragCommit = {
	drag: number;
	extent: number;
	setDrag: (value: number) => void;
};

export type UseDismissDragOptions = {
	axis: Axis;
	getExtent: () => number;
	enabled?: boolean;
	/** `false` keeps pending; `'abort'` resets the gesture. */
	shouldClaim?: (dx: number, dy: number) => boolean | 'abort';
	getOrigin?: (startX: number, startY: number) => number;
	mapOffset?: (offset: number) => number;
	onSlop?: () => void;
	onCommit: (commit: DismissDragCommit) => void;
};

export type UseDismissDragResult = {
	drag: number;
	setDrag: (value: number) => void;
	pressed: boolean;
	dismissing: boolean;
	resetGesture: () => void;
	onPointerDown: (event: PointerEvent) => void;
	onPointerMove: (event: PointerEvent) => void;
	onPointerUp: (event: PointerEvent) => void;
	onPointerCancel: (event: PointerEvent) => void;
};

export const DISMISS_FRACTION = (Math.PI * 10) / 100;
export const DRAG_SLOP = 6;
const IDLE: Gesture = { phase: 'idle' };

export function useDismissDrag({
	axis,
	getExtent,
	enabled = true,
	shouldClaim,
	getOrigin,
	mapOffset,
	onSlop,
	onCommit,
}: UseDismissDragOptions): UseDismissDragResult {
	const [drag, setDrag] = useState(0);
	const [pressed, setPressed] = useState(false);
	const gesture = useRef<Gesture>(IDLE);

	const map = mapOffset ?? (axis === 'y' ? (offset: number) => Math.max(0, offset) : (offset: number) => offset);
	const extent = getExtent();
	const dismissing = extent > 0 && Math.abs(drag) >= extent * DISMISS_FRACTION;

	const resetGesture = (): void => {
		gesture.current = IDLE;
		setDrag(0);
		setPressed(false);
	};

	const readOffset = (event: PointerEvent, origin: number): number => (
		map((axis === 'x' ? event.clientX : event.clientY) - origin)
	);

	const onPointerDown = (event: PointerEvent): void => {
		const interactive = event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]');
		if (!enabled || dismissing || event.button !== 0 || gesture.current.phase !== 'idle' || interactive) {
			return;
		}

		setPressed(true);
		gesture.current = {
			phase: 'pending',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
		};
	};

	const onPointerMove = (event: PointerEvent): void => {
		const state = gesture.current;
		if (state.phase === 'idle' || event.pointerId !== state.pointerId) {
			return;
		}

		if (state.phase === 'dragging') {
			setDrag(readOffset(event, state.origin));
			return;
		}

		const dx = event.clientX - state.startX;
		const dy = event.clientY - state.startY;
		if (Math.abs(dx) <= DRAG_SLOP && Math.abs(dy) <= DRAG_SLOP) {
			return;
		}

		onSlop?.();

		const claim = shouldClaim?.(dx, dy) ?? (
			axis === 'x'
				? (Math.abs(dx) > DRAG_SLOP && Math.abs(dx) >= Math.abs(dy) ? true : 'abort')
				: dy > DRAG_SLOP
		);

		if (claim === 'abort') {
			resetGesture();
			return;
		}

		if (!claim) {
			return;
		}

		const origin = getOrigin?.(state.startX, state.startY) ?? (axis === 'x' ? state.startX : state.startY);
		gesture.current = { phase: 'dragging', pointerId: event.pointerId, origin };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		window.getSelection()?.removeAllRanges();
		setDrag(readOffset(event, origin));
	};

	const onPointerEnd = (event: PointerEvent): void => {
		const state = gesture.current;
		if (state.phase === 'idle' || event.pointerId !== state.pointerId) {
			return;
		}

		if (state.phase === 'dragging') {
			const extent = getExtent();
			const next = readOffset(event, state.origin);
			if (extent > 0 && Math.abs(next) >= extent * DISMISS_FRACTION) {
				gesture.current = IDLE;
				setPressed(false);
				onCommit({ drag: next, extent, setDrag });
				return;
			}
		}

		resetGesture();
	};

	return {
		drag,
		setDrag,
		pressed,
		dismissing,
		resetGesture,
		onPointerDown,
		onPointerMove,
		onPointerUp: onPointerEnd,
		onPointerCancel: onPointerEnd,
	};
}
