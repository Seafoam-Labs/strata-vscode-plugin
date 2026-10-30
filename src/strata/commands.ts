export interface CommandInfo { name: string; group: string; description: string; effect: string }
export const commands: CommandInfo[] = [
  ['runtime', 'Engine', 'Start, stop, restart, inspect, and verify owned local instances.', 'Changes engine'],
  ['serve', 'Engine', 'Run the inference server in the foreground.', 'Runs workload'],
  ['engine', 'Engine', 'Measure, review, and apply engine calibration.', 'Changes engine'],
  ['profile', 'Models and profiles', 'Create, validate, edit, and restore serving profiles.', 'Changes settings'],
  ['models', 'Models and profiles', 'List, inspect, import, or move local model files.', 'May move files'],
  ['presets', 'Models and profiles', 'Manage retained tuning presets.', 'Changes settings'],
  ['status', 'Monitoring', 'Read a structured telemetry snapshot.', 'Read only'],
  ['monitor', 'Monitoring', 'Open the interactive seven-view terminal monitor.', 'Read only'],
  ['logs', 'Monitoring', 'Read bounded, redacted request activity.', 'Read only'],
  ['doctor', 'Monitoring', 'Diagnose installed engine components.', 'Read only'],
  ['config', 'Monitoring', 'Inspect effective connection configuration.', 'Read only'],
  ['connect', 'Connections', 'Print or write setup for an app using Strata.', 'May write configuration'],
  ['connection', 'Connections', 'Manage saved monitor endpoints.', 'Changes settings'],
  ['launch', 'Setup and advanced', 'Open guided model setup, serving, and monitoring.', 'May download and start engine'],
  ['install', 'Setup and advanced', 'Explicitly install engines, models, and Python packages.', 'Downloads and installs'],
  ['update', 'Setup and advanced', 'Download and verify engine and Control updates.', 'Downloads and installs'],
  ['components', 'Setup and advanced', 'Inspect, update, install, or roll back engine components.', 'May install components'],
  ['drafting', 'Setup and advanced', 'Preview or fetch the DFlash2 drafter.', 'May download'],
  ['bench', 'Setup and advanced', 'Run serving benchmarks and retain evidence.', 'Runs workload'],
  ['tune', 'Setup and advanced', 'Search bounded engine configurations.', 'Runs workload'],
  ['timeskip', 'Setup and advanced', 'Try and evaluate a bounded improvement.', 'Runs workload'],
  ['ops', 'Setup and advanced', 'Edit and run typed local operator recipes.', 'May change engine'],
  ['repair-access', 'Setup and advanced', 'Repair administrator-owned Strata files on Windows.', 'Changes file access'],
  ['code', 'Setup and advanced', 'Open the coding client for the shared Desktop harness.', 'Interactive client']
].map(([name, group, description, effect]) => ({ name, group, description, effect }));
// A JSON array preserves argument boundaries and never invokes shell parsing.
export function terminalArguments(raw: string, command: string): string[] {
  let args: unknown;
  try { args = JSON.parse(raw); } catch { throw new Error('Enter arguments as a JSON array of strings, for example ["--help"].'); }
  if (!Array.isArray(args) || args.length > 64 || args.some(x => typeof x !== 'string' || x.length > 4096 || /[\0\r\n]/.test(x))) throw new Error('Arguments must be at most 64 single-line strings.');
  if (!commands.some(x => x.name === command)) throw new Error('Unknown command.');
  return [command, ...args];
}
