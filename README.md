# Strata Control

A dedicated **Strata sidebar for VS Code and VSCodium**. Monitor local inference, select models and serving profiles, edit settings, and control the engine while keeping your code open.

Preview release 0.1.0. Linux desktop editor integration is tested; live GPU lifecycle qualification remains pending.

## Install and connect

1. Install the packaged `strata-control.vsix` using **Extensions → Install from VSIX…**. The same file works in both editors.
2. Install Strata separately. This extension initially targets **Strata 0.2.8**, with contracts checked against build **0.1.54**, on Linux.
3. Click the Strata icon in the Activity Bar. If discovery fails, configure **Strata: Executable Path** with an absolute path such as `/usr/bin/strata`.
4. Select an existing profile, or choose **New profile** to create one from an installed model configuration.
5. Use **Start**, **Stop**, **Restart**, or **Verify**. Each operation presents a preview before execution.

An empty editor window works; a trusted workspace is required when a workspace is open. Opening the sidebar does not install models, run tuning, or start the engine.

## What is included

- Live engine and endpoint state, decode/prefill throughput, RAM, GPU memory and utilization, serving slots, requests, and bounded activity logs.
- Profile selection, typed setting previews, model selection, validation, history and rollback. Saved changes are distinguished from running settings.
- Native Profiles, Models and Commands trees. The searchable command browser covers all 24 top-level commands in the supported CLI, with help and explicit terminal workflows for advanced operations.
- An optional expanded dashboard sharing the same state and polling loop.
- **Open TUI** for `strata monitor` and **Guided setup** for `strata launch`, in dedicated integrated terminals.
- Command Palette actions, accessible controls, theme support, and narrow-sidebar layouts.

Settings support `host`, `port`, `parallel`, `batch_groups`, `max_queue`, `queue_timeout`, `offline`, and `batch_telemetry`. Other engine tuning belongs to Strata's guided setup or advanced commands. Blank form fields retain the existing default; use profile history or the CLI to restore prior overrides.

The current release shows numerical performance and hardware readings; expanded historical charts and graphical calibration reports are future features. A missing metric is shown as **Unavailable**, not zero.

## Runtime behavior

Strata owns the engine process. It keeps running after you close the editor. Stop/restart previews carry owner and instance guards; stale ownership causes the operation to fail instead of targeting a replacement engine. The extension never kills arbitrary engine PIDs.

Profile settings do not automatically restart serving. Changing the model's source config requires an explicit stop then start; automatic source migration is disabled. Cancellation stops waiting on the CLI, which may already have initiated a background operation. The extension refreshes status afterward.

The CLI's public `start`, `profile set`, and profile rollback interfaces lack atomic preview-revision guards in the tested version. The extension rechecks before execution and serializes its own changes, but another application can still change the configuration in the small interval between check and execution. Stop/restart and model source changes use the available CLI guards.

## Connections and credentials

The runtime-reported API URL is used for a running profile; saved bind settings provide a fallback only for a stopped profile. If no running endpoint is reported, set **Strata: Endpoint** explicitly. Only loopback HTTP(S) endpoints are supported. A reachable endpoint does not imply ownership by the selected profile.

Use **Strata: Set Local Endpoint Credential** to store a credential in the editor's SecretStorage, separately for each endpoint. Credentials are passed in a child-process environment, never in command arguments. VS Code and VSCodium maintain their own settings and secret stores.

This is a local desktop extension. In remote workspace windows its host remains local, and terminal TUI launch is disabled to avoid accidentally launching on the remote host. Windows, macOS, remote windows, and real GPU lifecycle operations need additional acceptance testing before being advertised as supported combinations.

## Build and test

The repository uses TypeScript and the stable extension API, with no runtime npm dependencies or native addons.

```sh
npm ci
npm run check
npm test
npm run package
```

Before installing system dependencies in this development environment, inspect `shelly --help` and use Shelly. An Arch PKGBUILD elsewhere does not imply the host is Arch.

Run the editor smoke test using an isolated user profile and the fake CLI:

```sh
npm run test:editor
VSCODE_EXECUTABLE_PATH=/usr/share/vscodium/codium npm run test:editor
```

Use `npm run test:package` after packaging to install and test the VSIX in a temporary editor profile; it accepts the same editor selection variables. `npm run check:installed` validates real CLI profile operations in a temporary profile directory without starting the engine.

The first command downloads VS Code through `@vscode/test-electron`; set `VSCODE_VERSION=1.96.4` to test the minimum API baseline. A graphical display (or `xvfb-run` in CI) is required. Unit and DOM tests use an isolated fake CLI and require no GPU. Debug with the **Run Strata Extension** launch configuration.

The source repository includes `docs/strata-command-matrix.md`, `docs/VALIDATION.md`, and `IMPLEMENTATION_PLAN.md`.

## Release

`npm run package` creates `strata-control.vsix`. The development publisher ID is `strata-local`; replace it with a publisher you own before registry publication. A manually triggered release workflow creates the VSIX and can publish to Open VSX and Visual Studio Marketplace using configured secrets. No registry publication happens during a local build.
