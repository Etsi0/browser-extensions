import { SiteRuleRow, Switch, useNotifications } from 'extension-shared';
import { deleteSiteRule, formatRemovals, moveSiteRule, settingsEqual } from '../lib/settings';
import { REMOVAL_KEYS, REMOVAL_LABELS } from '../lib/util';
import type { RemovalKey } from '../lib/util';
import type { Settings } from '../types/common';
import Close from 'extension-shared/icons/close.svg';

type ListViewProps = {
	settings: Settings;
	onChange: (next: Settings) => void;
	onAdd: () => void;
	onEdit: (index: number) => void;
};

export function ListView({ settings, onChange, onAdd, onEdit }: ListViewProps) {
	const { notify } = useNotifications();

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
	};

	const setGlobalRemoval = (key: RemovalKey, checked: boolean): void => {
		onSet({ ...settings, [key]: checked }, `Remove ${REMOVAL_LABELS[key]}`, checked ? 'On' : 'Off');
	};

	return (
		<>
			<header className='flex items-center justify-between gap-2 px-[calc(var(--radius-outer)/2-.125em)] pb-3 -mb-2 border-b border-body-100'>
				<div className='flex items-center gap-2'>
					<img className='size-8' src="/ForgetMe-64.png" alt="" />
					<h1 className="text-custom-2xl font-sans">ForgetMe</h1>
				</div>
				<button
					type="button"
					className='text-text-700 p-1 rounded-(--radius-controls) hover:text-text-800 hover:bg-body-100 active:text-text-900 active:bg-body-200'
					onClick={() => window.close()}
					aria-label="Close"
				>
					<Close className="fill-current size-6" />
				</button>
			</header>

			<div className="grid gap-2">
				<h2 className="text-custom-xl ml-[calc(var(--radius-outer)/2-.125em)]">Global Rules</h2>
				<div className="grid gap-0.5">
					{REMOVAL_KEYS.map((key) => (
						<Switch
							key={key}
							label={`Remove ${REMOVAL_LABELS[key]}:`}
							checked={settings[key]}
							onChange={(checked) => setGlobalRemoval(key, checked)}
						/>
					))}
				</div>
			</div>

			<div className="grow flex flex-col gap-2">
				<h2 className="text-custom-xl ml-[calc(var(--radius-outer)/2-.125em)]">Site Rules</h2>
				<div className="grow flex flex-col gap-0.5">
					{settings.siteRules.map((rule, index) => (
						<SiteRuleRow
							key={rule.pattern}
							rule={rule}
							description={`${formatRemovals(rule)}.`}
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
