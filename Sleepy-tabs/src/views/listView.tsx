import { formatTimeout, MenuSetting, SiteRuleRow, Switch, useNotifications } from 'extension-shared';
import { deleteSiteRule, moveSiteRule, settingsEqual } from '../lib/settings';
import { DurationSelect } from '../components/durationSelect';
import type { Settings } from '../types/common';

type ListViewProps = {
	settings: Settings;
	onChange: (next: Settings) => void;
	onAdd: () => void;
	onEdit: (index: number) => void;
};

export function ListView({ settings, onChange, onAdd, onEdit }: ListViewProps) {
	const { notify } = useNotifications();
	const globalTimeout = settings.enabled ? settings.timeoutMinutes : null;

	const onSet = (next: Settings, label: string, value: string): void => {
		if (settingsEqual(next, settings)) {
			return;
		}

		onChange(next);
		notify({
			variant: 'success',
			title: <>Saved setting</>,
			description: <>Saved <q>{label}</q> as <q>{value}</q></>,
		});
	}

	const setGlobalTimeout = (value: number | null): void => {
		const next = value === null
			? { ...settings, enabled: false }
			: { ...settings, enabled: true, timeoutMinutes: value };
		onSet(next, 'Unload tabs', formatTimeout(value));
	};

	const setSkipPinned = (checked: boolean): void => {
		const next = { ...settings, skipPinned: !checked };
		onSet(next, 'Unload pinned tabs', checked ? 'On' : 'Off');
	};

	const setSkipAudible = (checked: boolean): void => {
		const next = { ...settings, skipAudible: !checked };
		onSet(next, 'Unload audio tabs', checked ? 'On' : 'Off');
	};

	return (
		<>
			<div className="grid gap-2">
				<h2 className="text-custom-xl ml-[calc(var(--radius-outer)/2-.125em)]">Global Rules</h2>
				<div className="grid gap-0.5">
					<MenuSetting>
						Unload tabs:
						<DurationSelect value={globalTimeout} onChange={setGlobalTimeout} />
					</MenuSetting>
					<Switch
						label="Unload pinned tabs:"
						checked={!settings.skipPinned}
						onChange={setSkipPinned}
					/>
					<Switch
						label="Unload audio tabs:"
						checked={!settings.skipAudible}
						onChange={setSkipAudible}
					/>
				</div>
			</div>

			<div className="grow flex flex-col gap-2">
				<h2 className="text-custom-xl ml-[calc(var(--radius-outer)/2-.125em)]">Site Rules</h2>
				<div className="grow flex flex-col gap-0.5">
					{settings.siteRules.map((rule, index) => (
						<SiteRuleRow
							key={rule.pattern}
							rule={rule}
							index={index}
							total={settings.siteRules.length}
							onEdit={() => onEdit(index)}
							onMove={(direction) => onChange(moveSiteRule(settings, index, direction))}
							onDelete={() => onChange(deleteSiteRule(settings, index))}
						/>
					))}
				</div>
				<button
					type="button"
					onClick={onAdd}
					className="bg-body-50 px-[1.5em] py-[.75em] rounded-(--radius-outer) cursor-pointer hover:bg-primary-500 hover:text-primary-50 not-hover:dark:bg-body-100"
				>
					Add site rule
				</button>
			</div>
		</>
	);
}
