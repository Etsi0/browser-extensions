import { useRef, useState } from 'preact/hooks';
import { BottomSheet, NotificationProvider } from 'extension-shared';
import { useSettings } from '../lib/storage';
import { ListView } from './listView';
import { SiteFormView } from './siteFormView';
import type { SiteFormMode } from './siteFormView';

export function App() {
	return (
		<NotificationProvider>
			<AppContent />
		</NotificationProvider>
	);
}

function AppContent() {
	const [mode, setMode] = useState<SiteFormMode | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const formKey = useRef(0);
	const dismissFormRef = useRef<(() => void) | undefined>(undefined);
	const { settings, update } = useSettings();

	if (!settings) {
		return null;
	}

	const openForm = (next: SiteFormMode): void => {
		formKey.current += 1;
		setMode(next);
		setSheetOpen(true);
	};

	const closeForm = (): void => {
		dismissFormRef.current?.();
		setSheetOpen(false);
	};

	const onSheetClosed = (): void => {
		setMode(null);
	};

	return (
		<>
			<ListView
				settings={settings}
				onChange={update}
				onAdd={() => openForm({ name: 'new' })}
				onEdit={(index) => openForm({ name: 'edit', index })}
			/>

			<BottomSheet open={sheetOpen} onClose={closeForm} onClosed={onSheetClosed}>
				{mode && (
					<SiteFormView
						key={formKey.current}
						settings={settings}
						mode={mode}
						onChange={update}
						onBack={closeForm}
						onDismissRef={dismissFormRef}
					/>
				)}
			</BottomSheet>
		</>
	);
}
