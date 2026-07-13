import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useRaiseNotificationStack } from '../context/notifications';
import { cn } from '../lib/cn';

export type BottomSheetProps = {
	open: boolean;
	onClose: () => void;
	onClosed?: () => void;
	children: ComponentChildren;
};

const CLOSE_FRACTION = (Math.PI * 10) / 100;
const DRAG_SLOP = 6;
const CLOSE_MS = 300;

type Gesture =
	| { phase: 'idle' }
	| { phase: 'pending'; pointerId: number; startX: number; startY: number }
	| { phase: 'dragging'; pointerId: number; origin: number };

const IDLE: Gesture = { phase: 'idle' };

export function BottomSheet({ open, onClose, onClosed, children }: BottomSheetProps) {
	const [entered, setEntered] = useState(false);
	const [drag, setDrag] = useState(0);
	const [pressed, setPressed] = useState(false);

	const dialogRef = useRef<HTMLDialogElement>(null);
	const gesture = useRef<Gesture>(IDLE);
	const suppressClick = useRef(false);
	const selfClose = useRef(false);
	const onClosedRef = useRef(onClosed);
	onClosedRef.current = onClosed;

	const raiseNotifications = useRaiseNotificationStack();

	const height = dialogRef.current?.offsetHeight ?? 0;
	const dragFraction = height ? Math.min(drag / height, 1) : 0;
	const backdropOpacity = entered ? 1 - dragFraction : 0;
	const transform = entered ? `translateY(${drag}px)` : 'translateY(100%)';

	const resetGesture = (): void => {
		gesture.current = IDLE;
		setDrag(0);
		setPressed(false);
	};

	const onPointerDown = (event: PointerEvent): void => {
		const interactive =
			event.target instanceof Element &&
			event.target.closest('input, textarea, select, button, a, [contenteditable="true"]');
		if (event.button !== 0 || interactive || gesture.current.phase !== 'idle') {
			return;
		}
		gesture.current = {
			phase: 'pending',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
		};
		suppressClick.current = false;
		setPressed(true);
	};

	const onPointerMove = (event: PointerEvent): void => {
		const state = gesture.current;
		if (state.phase === 'idle' || event.pointerId !== state.pointerId) {
			return;
		}

		if (state.phase === 'dragging') {
			setDrag(Math.max(0, event.clientY - state.origin));
			return;
		}

		const dx = event.clientX - state.startX;
		const dy = event.clientY - state.startY;
		if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) {
			suppressClick.current = true;
		}
		if (dy <= DRAG_SLOP) {
			return;
		}
		if ((dialogRef.current?.scrollTop ?? 0) > 0) {
			return;
		}

		const origin = Math.max(dialogRef.current?.offsetTop ?? 0, state.startY);
		gesture.current = { phase: 'dragging', pointerId: event.pointerId, origin };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		window.getSelection()?.removeAllRanges();
		setDrag(Math.max(0, event.clientY - origin));
	};

	const onPointerEnd = (event: PointerEvent): void => {
		const state = gesture.current;
		if (state.phase === 'idle' || event.pointerId !== state.pointerId) {
			return;
		}
		if (state.phase === 'dragging') {
			const height = dialogRef.current?.offsetHeight ?? 0;
			const dragged = Math.max(0, event.clientY - state.origin);
			if (height > 0 && dragged >= height * CLOSE_FRACTION) {
				gesture.current = IDLE;
				setPressed(false);
				onClose();
				return;
			}
		}
		resetGesture();
	};

	const onClick = (event: MouseEvent): void => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}

		if (event.target === event.currentTarget) {
			onClose();
		}
	};

	const onCancel = (event: Event): void => {
		event.preventDefault();
		onClose();
	};

	const onDialogClose = (): void => {
		resetGesture();
		setEntered(false);
		if (!selfClose.current) {
			onClose();
		}
		selfClose.current = false;
	};

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}

		if (open) {
			resetGesture();
			if (!dialog.open) {
				dialog.showModal();
			}
			raiseNotifications();

			const raf = requestAnimationFrame(() => setEntered(true));
			return () => cancelAnimationFrame(raf);
		}

		if (!dialog.open) {
			return;
		}

		setEntered(false);
		let finished = false;
		const finishClose = (): void => {
			if (finished) {
				return;
			}
			finished = true;
			selfClose.current = true;
			dialog.close();
			onClosedRef.current?.();
		};

		const onEnd = (event: TransitionEvent): void => {
			if (event.target !== dialog || event.propertyName !== 'transform') {
				return;
			}
			finishClose();
		};

		const fallback = setTimeout(finishClose, CLOSE_MS + 50);
		dialog.addEventListener('transitionend', onEnd);
		return () => {
			dialog.removeEventListener('transitionend', onEnd);
			clearTimeout(fallback);
		};
	}, [open, raiseNotifications]);

	return (
		<dialog
			ref={dialogRef}
			closedby="none"
			className={cn(
				'overflow-y-auto fixed w-full max-w-none min-h-[62.5vh] max-h-[80vh] inset-[auto_0_0_0] p-0 m-0 rounded-t-(--radius-outer) shadow-lg duration-300',
				'bg-body-100 dark:bg-body-50',
				'select-none [&_input]:select-text',
				'backdrop:bg-black/40 backdrop:opacity-(--backdrop-opacity) backdrop:duration-0',
				pressed && 'cursor-grabbing **:cursor-grabbing',
				!pressed && 'transition-transform backdrop:transition-opacity backdrop:duration-300',
			)}
			style={{
				transform,
				'--backdrop-opacity': backdropOpacity,
			}}
			onClose={onDialogClose}
			onCancel={onCancel}
			onClick={onClick}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerEnd}
			onPointerCancel={onPointerEnd}
		>
			<div className="cursor-grab grid place-items-center py-2">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					className="pointer-events-none h-1.5 w-10 rounded-full bg-body-300"
				/>
			</div>
			<div className="px-4 pb-4">
				{children}
			</div>
		</dialog>
	);
}
