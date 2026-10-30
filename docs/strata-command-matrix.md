# Strata CLI contract matrix

Checked against the installed `/opt/strata` Control source and `strata --help`, version 0.2.8/build 0.1.54. Every JSON response must have `schema_version: 1` and boolean `ok`; unsupported envelopes fail closed. The runtime adapter never parses human terminal output for telemetry.

| Command | Integration |
| --- | --- |
| runtime | Visual start/status/stop/restart/verify; preview and identity guards |
| profile | Visual list/show/create/set/use-config/validate/history/rollback |
| models | Native model tree, inspect report, profile creation and source selection |
| status | Shared snapshot polling for both graphical surfaces |
| logs | Graphical bounded activity extracted from the same status snapshot |
| monitor | Optional interactive terminal with explicit local endpoint |
| launch | Reviewed guided-setup terminal |
| doctor | Structured diagnostic report |
| serve | Help and reviewed terminal arguments |
| engine | Help and reviewed terminal arguments (including calibration) |
| presets | Help and reviewed terminal arguments |
| config | Help and reviewed terminal arguments |
| connect | Help and reviewed terminal arguments |
| connection | Help and reviewed terminal arguments |
| install | Help and reviewed terminal arguments |
| update | Help and reviewed terminal arguments |
| components | Help and reviewed terminal arguments |
| drafting | Help and reviewed terminal arguments |
| bench | Help and reviewed terminal arguments |
| tune | Help and reviewed terminal arguments |
| timeskip | Help and reviewed terminal arguments |
| ops | Help and reviewed terminal arguments |
| repair-access | Help and reviewed terminal arguments; Windows-specific upstream command |
| code | Help and reviewed terminal arguments |

Advanced terminal arguments use a JSON string array to preserve argument boundaries. Help text never becomes an executable command automatically.

## Monitor view coverage

The installed TUI names are Overview, Serving, Requests, Engine, Hardware, Logs, and Connect (`strata_cli/nav.py`).

| TUI information | Structured source | Graphical placement |
| --- | --- | --- |
| Overview model and instance | `snapshot.model`, `snapshot.instance`; owned state from `runtime status` | Engine card |
| Throughput | `snapshot.rates.answer_tok_s`, `prefill_tok_s` | Performance |
| Serving capacity | `snapshot.work.active`, `queued`, `slots_effective`, `slots` | Performance and Serving & requests |
| Requests | `snapshot.work.requests`, `snapshot.recent` | Serving & requests detail |
| Engine topology/quality/totals | `snapshot.topology`, `quality`, `totals` | Commands & diagnostics detail |
| Hardware | `snapshot.devices[].mem_used/mem_total/util`, `snapshot.ram` | Performance; memory fields are bytes |
| Logs | `snapshot.activity.events/last_seq/available`, `snapshot.instance.id` | Live activity with sequence gaps and instance changes |
| Connect | Owned `api_url`, endpoint from selected stopped profile, explicit endpoint setting | Endpoint display and credential action; application export through command browser |

The full TUI includes overview history graphs and detailed device/topology renderings that are not replicated graphically in this initial release. The original monitor remains available.

## Runtime contracts

- Start: `runtime start --profile NAME --plan --json` returns `plan.profile`, `plan.launch`, and `plan.source_sha256`. Re-preview before execution. The public CLI does not expose expected revision/source flags for start.
- Stop: preview returns `plan.owner_id` and optionally `plan.instance_id`. Execution requires `--if-owner-id`, plus `--if-instance-id` when present. A starting instance may not have an instance ID yet.
- Restart: preview fields are at the envelope root, not inside `plan`: `current_owner_id`, `current_instance_id`, `candidate_profile_revision`, `candidate_source_sha256`. All four become execution guards. Source migration/switch flags are not enabled automatically.
- Verify: preview returns owner and instance IDs; execution guards both. This is an explicit test-generation action.
- State: `ready` is displayed as Running. Stopped, starting, failed, unknown, and unreachable information remain distinct. Telemetry may be reachable independently of the selected owned runtime.
- Source selection: `profile use-config` accepts `--if-revision` from its preview.
- Settings and rollback: recheck before applying; upstream lacks atomic cross-process preview guards for these public CLI paths.

## Fixtures

`test/fixtures/profiles.json`, `models.json`, `profile.json`, `stopped.json`, and `unreachable.json` preserve locally observed response shapes with model names, identities, and paths replaced by demo values. `telemetry.json` and running lifecycle responses from `fake-strata.cjs` are synthetic, derived from the installed v1 sanitizer and runtime source. They are not claimed to be recordings of a live GPU session.

Implementation refinement: use the activity already present in `status --json`, rather than a separate `logs --follow` child, because the CLI log follower polls that same snapshot internally. The shared buffer is capped at 300 events; the view shows up to 100 matching events. This avoids duplicate telemetry requests while preserving gap and instance-change markers.
