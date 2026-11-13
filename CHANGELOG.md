# Changelog

## 0.1.1 — Preview

- Support Strata 0.2.13.x (contracts checked against 0.2.13.1/build 0.1.59.1) alongside 0.2.8; untested versions still fail closed.
- Handle the new `stale` owner state: keep Start available as Strata's recovery path and surface the owner-lost error without breaking the refresh loop.
- Add the `split-engine` command to the browser (25 top-level commands).
- Extend the runtime execution timeout so a slow default restart (up to 1000 s in 0.2.13) is not aborted before the CLI answers.

## 0.1.0 — Preview

- Add the dedicated Strata sidebar, live telemetry, bounded activity logs, profiles, model selection, settings previews, and guarded local runtime controls.
- Add native command browsing, diagnostics, optional expanded dashboard, and integrated terminal workflows.
- Add VS Code/VSCodium smoke tests, fake-CLI and DOM tests, isolated installed-CLI contract checks, VSIX packaging, and publishing workflows.
- Target Linux desktop and Strata 0.2.8; live GPU lifecycle qualification and registry publication remain pending.
