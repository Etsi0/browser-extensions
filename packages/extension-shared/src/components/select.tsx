import type { OptionHTMLAttributes, SelectHTMLAttributes } from 'preact';
import { cn } from '../lib/cn';

export type SelectOption = Omit<OptionHTMLAttributes<HTMLOptionElement>, 'key' | 'children'> & {
	label: string;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange'> & {
	options: SelectOption[];
	onChange: NonNullable<SelectHTMLAttributes<HTMLSelectElement>['onChange']>;
};

const defaultClassName = 'bg-white px-2 py-1 rounded-(--radius-controls) dark:bg-body-200';

export function Select({
	value,
	options,
	className,
	onChange,
}: SelectProps) {
	return (
		<select
			className={cn(defaultClassName, className)}
			value={value}
			onChange={onChange}
		>
			{options.map((option) => {
				const { value, label, ...props } = option;
				return (
					<option key={value} value={value} {...props}>
						{label}
					</option>
				)
			})}
		</select>
	);
}