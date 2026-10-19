# ocelescope-module-ocpn-editor

The backend for the [Ocelescope](https://www.ocelescope.org) Petri net / OCPN
editor: PNML import/export and conversion between the editor and Ocelescope
resources. It's served under `/modules/ocpnEditor/v1` and pairs with the
[`@ocelescope/ocpn-editor`](../../frontend-modules/ocpn-editor) frontend module.

## Install

```sh
uv add ocelescope-module-ocpn-editor
```

`ocelescope-backend` picks it up automatically through its
`ocelescope_backend.modules` entry point.
