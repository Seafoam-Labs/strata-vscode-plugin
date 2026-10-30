# Validation and release qualification

Implementation date: 2026-10-30. This is a **0.1.0 preview**, with the following automated checks and explicit limits.

## Executed checks

- Strict TypeScript checks for the extension host and browser frontend.
- Eleven automated tests covering CLI argument boundaries, Unicode, partial/malformed/oversized JSON, errors, timeouts, cancellation, secret redaction, runtime identity guards, changed start previews, serialized operations, stale profile responses, bounded activity, connection recovery, and DOM rendering/interactions.
- Real installed Strata 0.2.8/build 0.1.54: profile/model inventory and help/source contract inspection; profile creation, validation, change preview, editing, history, rollback, and runtime start preview in a temporary `STRATA_PROFILE_DIR`. Existing user profiles and engine processes remain unchanged.
- VS Code 1.96.4 (minimum API baseline), VS Code 1.144.0, and VSCodium 1.143.1 (installed build 1.143.17232): isolated editor activation, native command registration, source document alongside sidebar, fake-CLI profile selection, metrics and logs, expanded dashboard, and sidebar/dashboard script handshakes.
- VSIX packaging includes compiled host modules, browser script/styles, icon, manifest, license, README and documentation. Build tools, source tests, and node_modules are excluded.

Packaged-artifact checks install the same VSIX through each editor's CLI into a temporary extensions directory, then load that installed directory in extension test mode. They exercise the shipped assets, not the source directory. Use `npm run test:package`; set `VSCODE_EXECUTABLE_PATH=/usr/share/vscodium/codium` for the local VSCodium installation.

## Not claimed as verified

- Live GPU model startup, generation, restart, drain/stop, or recovery under actual GPU load. Runtime lifecycle tests use the fake CLI; the installed-CLI check uses `--plan` for runtime operations.
- Manual screen-reader behavior, visual inspection across all themes and widths, or interactive TUI keyboard/resize acceptance. DOM tests and real-editor webview handshakes cover rendering and message behavior, not the full manual accessibility checklist.
- Windows, macOS, remote workspace execution, or browser-only editors. The initial supported target is Linux desktop; browser-only editors are out of scope. TUI launch is explicitly blocked in remote windows.
- Open VSX or Visual Studio Marketplace publication. The development publisher `strata-local` must be replaced with an owned publisher; release credentials must be configured.

## Real-engine acceptance procedure

Use a designated test profile referencing an installed model that fits the available hardware. Start from the sidebar, confirm identity and status, generate a request externally, verify metrics and activity, preview a settings change, save and restart, then stop. Confirm that an external owner/instance change invalidates a stale control preview. Confirm editor closure leaves a running background engine alive, while pollers are disposed. Run the same sequence in both editors before marking GPU lifecycle qualification complete.

A start/profile-edit/profile-rollback preview is rechecked immediately before execution, but the upstream public CLI has no atomic expected-preview guard for those paths. This remaining cross-process race is documented in the README. Other guarded runtime operations fail on stale identities.
