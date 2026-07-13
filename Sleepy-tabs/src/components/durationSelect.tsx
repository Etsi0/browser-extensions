import { formatTimeout, Select, durationToMinutes, minutesToDuration, SelectOption } from 'extension-shared';
import { DURATION_OPTIONS } from '../lib/util';

const DURATION_SELECT_OPTIONS: SelectOption[] = [
	...DURATION_OPTIONS.map((minutes): SelectOption => {
		return { value: String(minutes), label: formatTimeout(minutes) }
	}),
	{ value: 'never', label: formatTimeout(null) },
];

type DurationSelectProps = {
	value: number | null;
	onChange: (value: number | null) => void;
};

export function DurationSelect({ value, onChange }: DurationSelectProps) {
	return (
		<Select
			value={minutesToDuration(value)}
			options={DURATION_SELECT_OPTIONS}
			onChange={(e) => onChange(durationToMinutes(e.currentTarget.value))}
		/>
	);
}