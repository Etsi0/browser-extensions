import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useRaiseNotificationStack } from '../context/notifications';
import { DRAG_SLOP, useDismissDrag } from '../hooks/useDismissDrag';
import { cn } from '../lib/cn';

export type BottomSheetProps = {
	open: boolean;
	onClose: () => void;
	onClosed?: () => void;
	children: ComponentChildren;
};

const CLOSE_MS = 300;

export function BottomSheet({ open, onClose, onClosed, children }: BottomSheetProps) {
	const [entered, setEntered] = useState(false);

	const dialogRef = useRef<HTMLDialogElement>(null);
	const suppressClick = useRef(false);
	const selfClose = useRef(false);
	const onClosedRef = useRef(onClosed);
	onClosedRef.current = onClosed;

	const raiseNotifications = useRaiseNotificationStack();

	const {
		drag,
		pressed,
		resetGesture,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
	} = useDismissDrag({
		axis: 'y',
		getExtent: () => dialogRef.current?.offsetHeight ?? 0,
		shouldClaim: (_dx, dy) => {
			if (dy <= DRAG_SLOP) {
				return false;
			}

			if ((dialogRef.current?.scrollTop ?? 0) > 0) {
				return false;
			}

			return true;
		},
		getOrigin: (_startX, startY) => Math.max(dialogRef.current?.offsetTop ?? 0, startY),
		onSlop: () => {
			suppressClick.current = true;
		},
		onCommit: () => {
			onClose();
		},
	});

	const height = dialogRef.current?.offsetHeight ?? 0;
	const dragFraction = height ? Math.min(drag / height, 1) : 0;
	const backdropOpacity = entered ? 1 - dragFraction : 0;
	const transform = entered ? `translateY(${drag}px)` : 'translateY(100%)';

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
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
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
