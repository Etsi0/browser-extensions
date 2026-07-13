import { ComponentChildren } from "preact";
import { svg } from "./common";

type Variant = 'info' | 'success' | 'warning';
type NotifyTemplate = {
	key: string;
	variant: Variant;
	title: ComponentChildren;
	description: ComponentChildren;
}

export type NotifyOptions = (
	NotifyTemplate & {
		key: string;
		active?: boolean;
		autoDismissMs?: number;
		bump?: boolean;
		dismissDelay?: number;
	}
) | (
	Omit<NotifyTemplate, 'key'> & {
		autoDismissMs?: never;
		bump?: boolean;
	}
);

export type NotificationItem = NotifyTemplate & {
	active?: boolean;
	revision: number;
};

export type DismissOptions = {
	key?: string;
	hasActive?: boolean;
};

export type NotificationContextValue = {
	notify: (options: NotifyOptions) => string;
	dismiss: (options: DismissOptions) => void;
};

export type NotificationStackProps = {
	items: NotificationItem[];
	exitingKeys: Set<string>;
	onDismiss: (key: string) => void;
	raiseRef: { current: () => void };
};

export type NotificationCardProps = {
	item: NotificationItem;
	index: number;
	total: number;
	stacked?: {
		translate: string;
		scale: string;
		opacity: number;
	};
	exiting: boolean;
	onDismiss: () => void;
};

export type StackTransform = {
	translate: string;
	scale: string;
	opacity: number;
};

export type NotificationVariants = Record<Variant, { icon: svg; className: string }>