import browser from 'webextension-polyfill';
import { debounce, tryCatch } from 'extension-shared';
import { loadSettings, onSettingsChanged } from './lib/storage';
import { nextSweepDelayMinutes, shouldUnload } from './lib/tabs';
import { ALARM_NAME } from './lib/util';

/*==================================================
	Sweep scheduling
==================================================*/
async function clearSweepAlarm(): Promise<void> {
	const [clearError] = await tryCatch(browser.alarms.clear(ALARM_NAME));
	if (clearError) {
		console.error('Error clearing alarm:', clearError);
	}
}

async function scheduleSweep(existingTabs?: browser.Tabs.Tab[]): Promise<void> {
	await clearSweepAlarm();

	const settings = await loadSettings();
	if (!settings.enabled) {
		return;
	}

	let tabs = existingTabs;
	if (!tabs) {
		const [queryError, queried] = await tryCatch(browser.tabs.query({}));
		if (queryError || !queried) {
			console.error('Error querying tabs for schedule:', queryError);
			return;
		}
		tabs = queried;
	}

	const delayInMinutes = nextSweepDelayMinutes(settings, tabs, Date.now());
	if (delayInMinutes === null) {
		return;
	}

	browser.alarms.create(ALARM_NAME, { delayInMinutes });
}

const requestScheduleSweep = debounce(() => {
	scheduleSweep().catch((error) => console.error('Error scheduling sweep:', error));
}, 300);

/*==================================================
	Sweep
==================================================*/
async function sweep(): Promise<void> {
	const settings = await loadSettings();
	if (!settings.enabled) {
		await clearSweepAlarm();
		return;
	}

	const [queryError, tabs] = await tryCatch(browser.tabs.query({}));
	if (queryError || !tabs) {
		console.error('Error querying tabs:', queryError);
		return;
	}

	const now = Date.now();
	const discardable = tabs.filter((tab) => shouldUnload(tab, settings, now));
	await Promise.all(
		discardable.map(async (tab) => {
			const [error] = await tryCatch(browser.tabs.discard(tab.id!));
			if (error) {
				console.debug(`Skipped unloading tab ${tab.id}:`, error);
			}
			tab.discarded = true; // set to true even if error, we do not want to retry tabs that errors out
		}),
	);

	await scheduleSweep(tabs);
}

/*==================================================
	Main
==================================================*/
main().catch(console.error);
async function main(): Promise<void> {
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === ALARM_NAME) {
			sweep().catch((error) => console.error('Error during sweep:', error));
		}
	});

	browser.tabs.onActivated.addListener(() => requestScheduleSweep());
	browser.tabs.onCreated.addListener(() => requestScheduleSweep());
	browser.tabs.onRemoved.addListener(() => requestScheduleSweep());
	browser.tabs.onUpdated.addListener(() => {
		requestScheduleSweep()
	}, { properties: ['discarded', 'audible', 'pinned', 'url'] });

	onSettingsChanged(() => requestScheduleSweep());
	await scheduleSweep();
}
