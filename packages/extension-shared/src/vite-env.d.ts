declare module '*.css' {}

declare module '*.svg' {
	import type { FunctionComponent, JSX } from 'preact';
	const component: FunctionComponent<JSX.SVGAttributes<SVGSVGElement>>;
	export default component;
}

declare module '*.svg?url' {
	const url: string;
	export default url;
}
