import { useRef } from 'preact/hooks';
import MoreVert from '../icons/more_vert.svg';
import { cn } from '../lib/cn';
import { formatTimeout } from '../lib/settings';
import { SiteRuleRowProps } from '../types/siteRuleRow';

const menuItemClass = `
	text-left text-nowrap px-[1em] py-[.5em] rounded-(--radius-controls) cursor-pointer
	hover:bg-primary-500 hover:text-primary-50
`;

export function SiteRuleRow({ rule, index, total, onEdit, onMove, onDelete }: SiteRuleRowProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const menuId = `site-rule-menu-${index}`;
	const groupInteract = 'group-hover:text-text-900 group-has-[:popover-open]:text-text-900';

	return (
		<div className="
			group relative grid grid-cols-[minmax(0,1fr)_auto] gap-[calc(4pt+2px)] w-full rounded-(--radius-controls)
			first:rounded-t-(--radius-outer) last:rounded-b-(--radius-outer)
			focus-within:z-1
			bg-body-50            hover:bg-white         has-[:popover-open]:bg-white
			dark:bg-body-100 dark:hover:bg-body-200 dark:has-[:popover-open]:bg-body-200
		">
			<button
				type="button"
				title={rule.pattern}
				onClick={() => onEdit()}
				className="grid gap-y-1 min-w-0 text-left px-(--radius-outer) py-[.75em] rounded-(--radius-controls) cursor-pointer"
			>
				<span className={cn("font-mono truncate text-text-700", groupInteract)}>
					{rule.pattern}
				</span>
				<span className={cn("text-[.75em] text-text-600", groupInteract)}>
					Unload {formatTimeout(rule.timeoutMinutes).toLowerCase()}.
				</span>
			</button>
			<button
				type="button"
				commandFor={menuId}
				command='toggle-popover'
				aria-label="Site rule options"
				className="shrink-0 px-(--radius-outer) py-[.75em] rounded-(--radius-controls) cursor-pointer"
			>
				<MoreVert className={cn("text-text-600 fill-current size-5", groupInteract)} />
			</button>
			<div
				ref={menuRef}
				id={menuId}
				popover
				className="[position-area:bottom_right] gap-1 bg-body-50 p-1! rounded-[calc(var(--radius-controls)+.25rem)] -translate-x-4 shadow-md border border-body-200 dark:bg-body-100 open:grid"
			>
				<button
					type="button"
					command='toggle-popover'
					commandFor={menuId}
					className={menuItemClass}
					onClick={() => onEdit()}
				>
					Edit
				</button>
				{index > 0 && (
					<button
						type="button"
						command='toggle-popover'
						commandFor={menuId}
						className={menuItemClass}
						onClick={() => setTimeout(() => onMove('up'))}
					>
						Move up
					</button>
				)}
				{index < total - 1 && (
					<button
						type="button"
						command='toggle-popover'
						commandFor={menuId}
						className={menuItemClass}
						onClick={() => setTimeout(() => onMove('down'))}
					>
						Move down
					</button>
				)}
				<button
					type="button"
					command='toggle-popover'
					commandFor={menuId}
					className="text-left text-nowrap px-[1em] py-[.5em] rounded-(--radius-controls) cursor-pointer hover:bg-[oklch(.58_.2_30)] hover:text-[oklch(.97_.01_30)]"
					onClick={() => onDelete()}
				>
					Delete
				</button>
			</div>
		</div>
	);
}