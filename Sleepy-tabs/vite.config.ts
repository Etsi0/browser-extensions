import { defineConfig, type ResolvedConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Firefox-only; keep prod ID in repo manifest — AMO / signed builds use that. */
const GECKO_ID_DEV = 'sleepytabs-dev@phadonia.com';

// Plugin to copy and update manifest.json
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
				manifest.name = 'Sleepy Tabs (Dev)';
				if (!manifest.browser_specific_settings) {
					manifest.browser_specific_settings = { gecko: {} };
				}
				if (!manifest.browser_specific_settings.gecko) {
					manifest.browser_specific_settings.gecko = {};
				}
				manifest.browser_specific_settings.gecko.id = GECKO_ID_DEV;
			}

			writeFileSync(distManifestPath, JSON.stringify(manifest, null, '\t'));
		}
	};
}

export default defineConfig({
	base: './',
	plugins: [tailwindcss(), copyManifestPlugin()],
	build: {
		outDir: 'dist',
		rollupOptions: {
			input: {
				popup: resolve(__dirname, 'src/popup/index.html'),
				site: resolve(__dirname, 'src/popup/site.html'),
				background: resolve(__dirname, 'src/background.ts')
			},
			output: {
				entryFileNames: (chunkInfo) => {
					return chunkInfo.name === 'background' ? 'src/background.js' : 'assets/[name]-[hash].js';
				}
			}
		}
	}
});
