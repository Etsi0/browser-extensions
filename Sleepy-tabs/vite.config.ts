import { defineConfig } from 'vite';
import type { ResolvedConfig } from 'vite';
import preact from '@preact/preset-vite';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Firefox-only; keep prod ID in repo manifest — AMO / signed builds use that. */
const GECKO_ID_DEV = 'sleepy-tabs--dev@phadonia.com';

/** Copy manifest.json into dist, swapping in a dev name/ID for watch builds. */
function copyManifestPlugin() {
	let watchBuild = false;
	return {
		name: 'copy-manifest',
		configResolved(config: ResolvedConfig) {
			watchBuild = !!config.build.watch;
		},
		writeBundle() {
			const manifestPath = resolve(__dirname, 'manifest.json');
			const distManifestPath = resolve(__dirname, 'dist', 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
				name?: string;
				browser_specific_settings?: { gecko?: { id?: string } };
			};

			if (watchBuild) {
				manifest.name += ' (Dev)';
				manifest.browser_specific_settings ??= { gecko: {} };
				manifest.browser_specific_settings.gecko ??= {};
				manifest.browser_specific_settings.gecko.id = GECKO_ID_DEV;
			}

			writeFileSync(distManifestPath, JSON.stringify(manifest, null, '\t'));
		},
	};
}

export default defineConfig({
	base: './',
	plugins: [
		// Plain `*.svg` -> Preact component; `*.svg?url` falls through to Vite's URL handling.
		svgr({ include: '**/*.svg' }),
		preact(),
		tailwindcss(),
		copyManifestPlugin(),
	],
	build: {
		outDir: 'dist',
		rollupOptions: {
			input: {
				popup: resolve(__dirname, 'index.html'),
				background: resolve(__dirname, 'src/background.ts'),
			},
			output: {
				entryFileNames: (chunkInfo) =>
					chunkInfo.name === 'background' ? 'src/background.js' : 'assets/[name]-[hash].js',
			},
		},
	},
});
