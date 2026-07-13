import { MenuSetting } from './menuSetting';

type SwitchProps = {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
};

export function Switch({ label, checked, onChange }: SwitchProps) {
	return (
		<MenuSetting className="switch">
			{label}
			<input
				className="sr-only"
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.currentTarget.checked)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onChange(!checked);
					}
				}}
			/>
			<span></span>
		</MenuSetting>
	);
}