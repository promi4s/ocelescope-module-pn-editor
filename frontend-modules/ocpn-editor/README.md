# @ocelescope/ocpn-editor

A Petri net and object-centric Petri net (OCPN) editor for
[Ocelescope](https://www.ocelescope.org). It's the frontend half of the
[`ocelescope-module-ocpn-editor`](../../backend-modules/ocpn-editor) backend module.

## Install

```sh
pnpm add @ocelescope/ocpn-editor
```

Then register the module in your app's `ocelescope.config.ts`.

## Development

| Script | What it does |
| --- | --- |
| `pnpm run build` | Regenerates the API client and builds into `dist/`. |
| `pnpm run dev` | Rebuilds on changes. |
| `pnpm run typecheck` | Type-checks the module. |
