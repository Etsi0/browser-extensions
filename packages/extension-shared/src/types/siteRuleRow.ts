type SiteRuleRowRule = {
	pattern: string;
};

export type SiteRuleRowProps = {
	rule: SiteRuleRowRule;
	description: string;
	index: number;
	total: number;
	onEdit: () => void;
	onMove: (direction: 'up' | 'down') => void;
	onDelete: () => void;
};