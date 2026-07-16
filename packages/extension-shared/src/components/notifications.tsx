import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useDismissDrag } from '../hooks/useDismissDrag';
import { cn } from '../lib/cn';
import { clamp } from '../lib/clamp';
import { MAX_VISIBLE } from '../lib/util';
import type { NotificationCardProps, NotificationStackProps, NotificationVariants, StackTransform } from '../types/notifications';
import CheckCircle from '../icons/check_circle.svg';
import Info from '../icons/info.svg';
import Warning from '../icons/warning.svg';

const MIN_ANGLE_DEG = 0 as const;
const MAX_ANGLE_DEG = 90 as const;
const ANGLE_DEG = 45 as const;
const SCALE_STEP = .04 as const;
const VARIANTS: NotificationVariants = {
	info: {
		icon: Info,
		className: 'text-primary-500',
	},
	success: {
		icon: CheckCircle,
		className: 'text-[oklch(.55_.15_145)]',
	},
	warning: {
		icon: Warning,
		className: 'text-[oklch(.58_.2_30)]',
	},
} as const;

export function NotificationStack({ items, exitingKeys, onDismiss, raiseRef }: NotificationStackProps) {
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);
	const sizeRef = useRef<{ w: number; h: number } | null>(null);
	const stackRef = useRef<HTMLDivElement>(null);

	sizeRef.current = size;

	const visibleItems = useMemo(() => items.slice(0, MAX_VISIBLE + 1), [items]);
	const stackTransforms = useMemo(() => {
		if (size) {
			const shrink = size.h * SCALE_STEP;
			const inset = (size.w * SCALE_STEP) / 2;
			const angle = clamp(MIN_ANGLE_DEG, ANGLE_DEG, MAX_ANGLE_DEG);
			const peek = inset * Math.tan(angle * Math.PI / 180);
			const step = shrink + peek;

			return Array.from({ length: MAX_VISIBLE }, (_, index) => ({
				translate: `0 ${index * step}px`,
				scale: `${1 - index * SCALE_STEP}`,
				opacity: 1,
			}));
		}

		return null;
	}, [size]);

	const showStackPopover = (): void => {
		const el = stackRef.current;
		if (!el || items.length === 0) {
			return;
		}

		if (el.matches(':popover-open')) {
			el.hidePopover();
		}

		el.showPopover();
	};

	useLayoutEffect(() => {
		showStackPopover();

		const stack = stackRef.current;
		if (!stack || items.length === 0) {
			return;
		}

		const card = stack.querySelector('[role="alert"]');
		if (!(card instanceof HTMLElement)) {
			return;
		}

		const w = stack.clientWidth;
		const h = card.offsetHeight;
		if (w === 0 || (sizeRef.current?.w === w && sizeRef.current?.h === h)) {
			return;
		}

		sizeRef.current = { w, h };
		setSize({ w, h });
	}, [items]);

	useEffect(() => {
		raiseRef.current = showStackPopover;
		return () => raiseRef.current = () => {};
	}, [items]);

	return (
		<div
			ref={stackRef}
			popover="manual"
			className="fixed overflow-visible inset-x-4 top-4 w-auto pointer-events-none"
			role="status"
			aria-live="polite"
		>
			{visibleItems.map((item, index) => {
				return (
					<NotificationCard
						key={`${item.key}:${item.revision}`}
						item={item}
						index={index}
						total={visibleItems.length}
						width={size?.w ?? 0}
						stacked={stackTransforms?.[index]}
						exiting={exitingKeys.has(item.key)}
						onDismiss={() => onDismiss(item.key)}
					></NotificationCard>
				);
			})}
		</div>
	);
}

function NotificationCard({ item, index, total, width, stacked, exiting, onDismiss }: NotificationCardProps) {
	const [entered, setEntered] = useState(false);

	const {
		drag: dragX,
		pressed,
		dismissing,
		resetGesture,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
	} = useDismissDrag({
		axis: 'x',
		enabled: index === 0 && !exiting,
		getExtent: () => width,
		onCommit: ({ drag, extent, setDrag }) => {
			setDrag(Math.sign(drag) * extent);
			if (Math.abs(drag) >= extent) {
				onDismiss();
			}
		},
	});

	const swipeable = index === 0 && !exiting && (pressed || !dismissing);

	useEffect(() => {
		const raf = requestAnimationFrame(() => setEntered(true));
		return () => cancelAnimationFrame(raf);
	}, []);

	useEffect(() => {
		if (exiting) {
			resetGesture();
		}
	}, [exiting]);

	const onTransitionEnd = (): void => {
		if (exiting || dismissing) {
			onDismiss();
		}
	};

	let translate = '0 0';
	let scale = '1';
	let opacity = 0;
	if (exiting || !entered) {
		translate = '0 calc(-100% + -1rem)';
		scale = '0.875';
	} else if (dragX !== 0) {
		translate = `${dragX}px 0`;
		scale = stacked?.scale ?? '1';
		opacity = 1 - Math.min(Math.abs(dragX) / (width || 1), 1);
	} else if (stacked) {
		translate = stacked.translate;
		scale = stacked.scale;
		opacity = stacked.opacity;
	}

	const Svg = VARIANTS[item.variant].icon;
	return (
		<div
			role="alert"
			onTransitionEnd={onTransitionEnd}
			onPointerDown={swipeable ? onPointerDown : undefined}
			onPointerMove={swipeable ? onPointerMove : undefined}
			onPointerUp={swipeable ? onPointerUp : undefined}
			onPointerCancel={swipeable ? onPointerCancel : undefined}
			className={cn(
				'box-content absolute flex items-center gap-2 text-sm inset-x-0 border border-transparent rounded-(--radius-outer) px-(--radius-outer) py-[.75em] shadow-lg origin-top duration-300 select-none pointer-events-none',
				'[background:linear-gradient(color-mix(in_oklch,transparent,currentColor_12.5%)_0_100%)_padding-box,linear-gradient(var(--color-body-50)_0_100%)_padding-box,linear-gradient(color-mix(in_oklch,transparent,currentColor_25%)_0_100%)_border-box,linear-gradient(var(--color-body-50)_0_100%)_border-box]',
				VARIANTS[item.variant].className,
				swipeable && 'pointer-events-auto',
				pressed && 'cursor-grabbing',
				!pressed && 'transition-[translate,scale,opacity]',
			)}
			style={{
				translate,
				scale,
				opacity,
				zIndex: total - index,
			}}
		>
			<Svg className='shrink-0 fill-current size-[2lh]'/>
			<div className='grid min-w-0'>
				<span className="font-bold truncate">{item.title}</span>
				<span className="truncate">{item.description}</span>
			</div>
		</div>
	);
}
