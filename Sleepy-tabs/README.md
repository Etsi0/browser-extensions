# Sleepy Tabs

A Firefox extension that automatically **unloads inactive tabs** after a configurable amount of time. This is the same action as Firefox's built-in "unload tab" (`about:unloads` / the right-click *Unload Tab* menu): the tab stays in your tab bar but its memory is freed, and it reloads when you click it.

## How it works

- A background script runs a periodic sweep (via the `alarms` API).
- On each sweep it looks at every tab's `lastAccessed` time. Any tab that has been inactive longer than your configured timeout is unloaded with [`tabs.discard()`](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs/discard).
- The currently active tab in each window, already-unloaded tabs, and (optionally) pinned or audio-playing tabs are left alone.

## Settings

Open the toolbar popup to configure:

| Setting | Default | Description |
| --- | --- | --- |
| Unload tabs | After 30min | Global idle timeout before a tab is unloaded. Choose *Never* to disable auto-unload entirely. |
| Unload pinned tabs | Off | When enabled, pinned tabs can be unloaded too. |
| Unload tabs with audio playing | Off | When enabled, tabs that are currently making sound can be unloaded. |
| Domain filters | (none) | Per-site overrides for the global timeout. |

Settings are stored with `storage.local` and applied immediately — the sweep alarm re-arms whenever you change them.

### Domain filters

Click **Add site rule** to create a row with a site pattern and an *Unload after* timeout. Tabs that match a rule use that timeout instead of the global one. Set *Never* on a rule to keep matching tabs loaded indefinitely.

More specific patterns win, so `youtube.com/watch?v=` overrides `youtube.com`.

Matching is host- and path-aware:

- `real.test` matches `real.test` and any subdomain (`app.real.test`).
- `localhost/maxpa` matches that path and anything beneath it, with or without a port (`localhost:5173/maxpa/...`).
- Query strings are included, so `youtube.com/watch?v=` matches YouTube watch pages.
- `*` is a wildcard, e.g. `*.example.com` or `localhost/api/*`.

For example, to keep local dev environments loaded while everything else follows the global timeout, add:

```
localhost/maxpa → Never
real.test → Never
```

## Development

```bash
npm install
npm run dev      # build + watch into ./dist
```

Then load `dist/` in Firefox via `about:debugging` → *This Firefox* → *Load Temporary Add-on* and pick `dist/manifest.json`.

### Production build

```bash
npm run build
```

The output is written to `dist/`. The `dev`/watch build renames the add-on to "Sleepy Tabs (Dev)" and uses a separate Gecko ID so it can be installed alongside the released version.

## Permissions

- `tabs` — read tab state (`lastAccessed`, `active`, `pinned`, `audible`) and call `tabs.discard()`.
- `storage` — persist your settings.
- `alarms` — schedule the periodic idle-tab sweep.

No data ever leaves your browser.

## Tech stack

TypeScript + Vite + Tailwind CSS v4 + `webextension-polyfill`, Manifest V3.
