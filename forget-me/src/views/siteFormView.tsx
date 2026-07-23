import { useEffect, useRef, useState } from 'preact/hooks';
import { cn, debounce, getRulePatternFeedback, MenuSetting, normalizeRule, Switch, useNotifications } from 'extension-shared';
import { deleteSiteRule, findConflictingSiteRule, settingsEqual, upsertSiteRule } from '../lib/settings';
import { DEFAULT_SITE_RULE, REMOVAL_KEYS, REMOVAL_LABELS } from '../lib/util';
import type { RemovalKey } from '../lib/util';
import type { Settings, SiteRule } from '../types/common';

export type SiteFormMode = { name: 'edit'; index: number } | { name: 'new' };

type SiteFormViewProps = {
	settings: Settings;
	mode: SiteFormMode;
	onChange: (next: Settings) => void;
	onBack: () => void;
	onDismissRef: { current: (() => void) | undefined };
};

export function SiteFormView({
	settings,
	mode,
	onDismissRef,
	onChange,
	onBack,
}: SiteFormViewProps) {
	const initialRule = mode.name === 'edit'
		? (settings.siteRules[mode.index] ?? DEFAULT_SITE_RULE)
		: DEFAULT_SITE_RULE;
	const [draft, setDraft] = useState<SiteRule>(initialRule);
	const [target, setTarget] = useState<number | 'new'>(mode.name === 'edit' ? mode.index : 'new');
	const settingsRef = useRef<Settings>(settings);
	const cancelSaveRef = useRef<ReturnType<typeof debounce>>();
	const { notify, dismiss } = useNotifications();

	settingsRef.current = settings;

	const hasIndex = typeof target === 'number';
	const settingsRule = hasIndex ? settings.siteRules[target] : undefined;
	const heading = (normalizeRule(draft.pattern) || settingsRule?.pattern) ?? 'New site rule';

	useEffect(() => {
		const flushSave = (): void => {
			cancelSaveRef.current?.flush();
		};

		addEventListener('pagehide', flushSave);
		return () => {
			removeEventListener('pagehide', flushSave);
			flushSave();
			dismiss({ hasActive: true });
		};
	}, [dismiss]);

	useEffect(() => {
		onDismissRef.current = (): void => {
			if (!hasIndex || draft.pattern.trim() !== '') {
				return;
			}

			const updated = deleteSiteRule(settingsRef.current, target);
			if (settingsEqual(updated, settingsRef.current)) {
				return;
			}

			notify({
				variant: 'warning',
				title: (<>Deleted filter</>),
				description: (<>Site input was empty</>),
			});
			onChange(updated);
		};

		return () => {
			onDismissRef.current = undefined;
		};
	}, [onDismissRef, draft, target, notify, onChange]);

	const persist = (
		next: SiteRule,
		saved: { label: string; value: string },
		delay?: number,
	): void => {
		setDraft(next);
		cancelSaveRef.current?.cancel();

		const feedback = getRulePatternFeedback(next.pattern);
		const isValid = feedback.normalized !== '' && !feedback.incompleteRegex && !feedback.invalidRegex && !feedback.invalidUrl;
		const conflict = isValid
			? findConflictingSiteRule(settings.siteRules, target, next.pattern)
			: undefined;
		const willDelete = hasIndex && next.pattern.trim() === '';
		notify({
			key: 'incompleteRegex',
			active: !!feedback.incompleteRegex,
			variant: 'warning',
			title: (<>Invalid regex</>),
			description: (<>Must start and end with a slash</>),
			bump: false,
		});
		notify({
			key: 'invalidRegex',
			active: !!feedback.invalidRegex,
			variant: 'warning',
			title: (<>Invalid regex.</>),
			description: (<>Couldn't run this regex.</>),
			bump: false,
		});
		notify({
			key: 'invalidUrl',
			active: !!feedback.invalidUrl,
			variant: 'warning',
			title: (<>Invalid Url</>),
			description: (<>Couldn't parse this url</>),
			bump: false,
		});
		notify({
			key: 'strippedParts',
			active: !!feedback.strippedParts,
			variant: 'info',
			title: (<>Removing protocol, query, and fragment.</>),
			description: (<>Will be saved as {feedback.normalized}.</>),
			bump: false,
		});
		notify({
			key: 'patternConflict',
			active: !!conflict,
			variant: 'warning',
			title: (<>Can't override existing rule</>),
			description: <><q>{next.pattern}</q> already exists.</>,
			bump: false,
		});
		notify({
			key: 'willBeDeleted',
			active: willDelete,
			variant: 'info',
			title: (<>Filter will get deleted</>),
			description: (<>Site input is empty</>),
			bump: false,
		});
		if (willDelete || !isValid || conflict) {
			return;
		}

		const updated = upsertSiteRule(settings, target, next);
		if (settingsEqual(updated, settings)) {
			return;
		}

		cancelSaveRef.current = debounce(() => {
			notify({
				variant: 'success',
				title: <>Saved filter</>,
				description: <>Saved <q>{saved.label}</q> as <q>{saved.value}</q></>,
			});

			onChange(updated);

			if (target === 'new') {
				const index = updated.siteRules.findIndex((r) => r.pattern === normalizeRule(next.pattern));
				if (index >= 0) {
					setTarget(index);
				}
			}
		}, delay);
		cancelSaveRef.current();
	};

	const handleDelete = (): void => {
		cancelSaveRef.current?.cancel();
		if (hasIndex) {
			onChange(deleteSiteRule(settings, target));
		}
		onBack();
	};

	const setRemoval = (key: RemovalKey, checked: boolean): void => {
		persist(
			{ ...draft, [key]: checked },
			{ label: `Remove ${REMOVAL_LABELS[key]}`, value: checked ? 'On' : 'Off' },
			0,
		);
	};

	return (
		<div className="grid gap-2">
			<h2 className="flex items-center min-w-0 text-custom-xl leading-none h-lh ml-[calc(var(--radius-outer)/2-.125em)]">
				<span className="truncate leading-normal" title={heading}>
					{heading}
				</span>
			</h2>

			<div className="grid gap-2">
				<div className="grid gap-0.5">
					<MenuSetting>
						Site:
						<input
							className='grow font-mono bg-white px-2 py-1 rounded-(--radius-controls) dark:bg-body-200'
							type="text"
							placeholder="example.com"
							spellcheck={false}
							size={0}
							autocapitalize="off"
							autocomplete="off"
							value={draft.pattern}
							onInput={(e) => persist(
								{ ...draft, pattern: e.currentTarget.value },
								{ label: 'Site', value: e.currentTarget.value },
							)}
						/>
					</MenuSetting>
					{REMOVAL_KEYS.map((key) => (
						<Switch
							key={key}
							label={`Remove ${REMOVAL_LABELS[key]}:`}
							checked={draft[key]}
							onChange={(checked) => setRemoval(key, checked)}
						/>
					))}
				</div>

				{(hasIndex || draft.pattern) && (
					<button
						type="button"
						className={cn(
							"bg-body-50 px-[1.5em] py-[.75em] rounded-(--radius-outer) not-hover:dark:bg-body-100",
							hasIndex && 'cursor-pointer hover:bg-[oklch(.58_.2_30)] hover:text-[oklch(.97_.01_30)]',
							!hasIndex && 'cursor-not-allowed hover:bg-body-200 hover:text-text-900',
						)}
						{...(hasIndex && { onClick: handleDelete })}
					>
						Delete
					</button>
				)}
			</div>

			<span className="text-text-500 text-sm">
				Override global removals per site. More specific patterns win, so{' '}
				<code>youtube.com/watch</code> overrides <code>youtube.com</code>. Matches host and path
				(subdomains and ports included); wrap a regex in <code>/slashes/</code>.
			</span>
		</div>
	);
}
