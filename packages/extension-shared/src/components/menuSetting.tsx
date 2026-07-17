import type { HTMLAttributes } from 'preact';
import { cn } from '../lib/cn';

const baseClass = `
	flex justify-between items-center gap-[calc(.5rem+2pt+2px)] w-full px-(--radius-outer) py-[.75em]
	rounded-(--radius-controls) first:rounded-t-(--radius-outer) last:rounded-b-(--radius-outer)
	bg-body-50 dark:bg-body-100
`;

export function MenuSetting({ className, children, ...props }: HTMLAttributes<HTMLLabelElement>) {
	return (
		<label className={cn(baseClass, className)} {...props}>
			{children}
		</label>
	);
}