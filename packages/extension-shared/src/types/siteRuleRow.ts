type SiteRuleRowRule = {
	pattern: string;
	timeoutMinutes: number | null;
};

export type SiteRuleRowProps = {
	rule: SiteRuleRowRule;
	index: number;
	total: number;
	onEdit: () => void;
	onMove: (direction: 'up' | 'down') => void;
	onDelete: () => void;
};