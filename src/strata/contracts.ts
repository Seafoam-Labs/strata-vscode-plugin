export type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
export function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function rows(value: unknown): JsonObject[] { return Array.isArray(value) ? value.map(object) : []; }
export function envelope(raw: string): JsonObject {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('Strata returned malformed JSON. Check the executable and supported version.'); }
  const result = object(data);
  if (result.schema_version !== 1 || typeof result.ok !== 'boolean') {
    throw new Error('Unsupported Strata response schema; expected schema_version 1 and ok.');
  }
  return result;
}
export function errorMessage(data: JsonObject): string {
  return text(object(data.error).message) || text(data.error) || 'Strata command failed.';
}
export function profileName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) throw new Error('Profile names must start with a lowercase letter and use a-z, 0-9, _ or - (64 characters maximum).');
  return value;
}
export function localEndpoint(raw: string): string {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !['', '/', '/v1', '/v1/'].includes(u.pathname)) {
    throw new Error('Use a loopback HTTP(S) endpoint without credentials, queries, or a custom path.');
  }
  return u.origin;
}
export function endpointFor(runtime: JsonObject, profile: JsonObject, override: string): string {
  if (override) return localEndpoint(override);
  if (text(runtime.api_url)) return localEndpoint(text(runtime.api_url));
  // Saved settings may differ from a running instance; never silently query its new port.
  if (runtime.state && runtime.state !== 'stopped') return '';
  const effective = object(object(profile.plan).effective);
  let host = text(effective.host);
  if (host === '0.0.0.0') host = '127.0.0.1';
  if (host === '::' || host === '::1') host = '[::1]';
  if (!host || !Number.isInteger(effective.port) || Number(effective.port) <= 0) return '';
  return localEndpoint(`http://${host}:${effective.port}`);
}
export function requireRows(data: JsonObject, key: string): JsonObject[] {
  if (!Array.isArray(data[key]) || !(data[key] as unknown[]).every(x => typeof object(x).id === 'string')) {
    throw new Error(`Unsupported Strata ${key} response.`);
  }
  return rows(data[key]);
}
export function snapshotOf(data: JsonObject): JsonObject {
  const s = object(data.snapshot);
  if (s.schema_version !== 1 || !Object.keys(object(s.instance)).length || !Object.keys(object(s.model)).length) throw new Error('Unsupported telemetry snapshot.');
  return s;
}
export function runtimeOf(data: JsonObject): JsonObject {
  if (!['ready', 'starting', 'stopped', 'failed', 'stopping', 'draining', 'unknown'].includes(text(data.state))) throw new Error('Unsupported runtime state response.');
  return data;
}
export function supportedVersion(version: string): boolean {
  // Deliberately conservative until another release has contract fixtures.
  return /^strata 0\.2\.8\b/.test(version.trim());
}
export const fields = ['host', 'port', 'parallel', 'batch_groups', 'max_queue', 'queue_timeout', 'offline', 'batch_telemetry'] as const;
export function assignments(value: unknown): string[] {
  const data = object(value);
  const entries = Object.entries(data);
  if (!entries.length || entries.length > fields.length) throw new Error('Enter at least one supported setting.');
  return entries.map(([key, raw]) => {
    if (!fields.includes(key as typeof fields[number])) throw new Error(`Unsupported setting: ${key}`);
    const val = String(raw);
    if (typeof raw !== 'string' || val.length > 255) throw new Error(`Invalid value for ${key}`);
    if (key === 'host' && (!val || /\s/.test(val))) throw new Error('Host must be a nonempty address without spaces.');
    if (['offline', 'batch_telemetry'].includes(key) && !['true', 'false'].includes(val)) throw new Error(`${key} must be true or false.`);
    const bounds: Record<string, [number, number]> = { port: [0, 65535], parallel: [1, 1024], max_queue: [0, 4096], queue_timeout: [0.1, 600], batch_groups: [1, 1024] };
    if (bounds[key] && !(key === 'batch_groups' && val === 'auto')) {
      const n = Number(val), [min, max] = bounds[key];
      if (!val.trim() || !Number.isFinite(n) || n < min || n > max || (key !== 'queue_timeout' && !Number.isInteger(n))) throw new Error(`${key} must be ${min}–${max}${key === 'queue_timeout' ? '' : ' (whole number)'}.`);
    }
    return `${key}=${val}`;
  });
}
export type RuntimeAction = 'start' | 'stop' | 'restart' | 'verify';
export function guardedRuntimeArgs(action: RuntimeAction, profile: string, result: JsonObject): string[] {
  const plan = action === 'restart' ? result : object(result.plan);
  if (plan.profile !== profileName(profile)) throw new Error('Preview target does not match the selected profile.');
  const args = ['runtime', action, '--profile', profile, '--json'];
  const guard = (key: string, flag: string, length: number, optional = false) => {
    const value = text(plan[key]);
    if (!value && optional) return;
    if (!new RegExp(`^[0-9a-f]{${length}}$`).test(value)) throw new Error(`Preview is missing a valid ${key}; refresh and try again.`);
    args.push(flag, value);
  };
  if (action === 'stop' || action === 'verify') {
    guard('owner_id', '--if-owner-id', 32);
    guard('instance_id', '--if-instance-id', 32, action === 'stop');
  }
  if (action === 'restart') {
    guard('current_owner_id', '--if-owner-id', 32);
    guard('current_instance_id', '--if-instance-id', 32);
    guard('candidate_profile_revision', '--if-profile-revision', 16);
    guard('candidate_source_sha256', '--if-source-sha256', 64);
  }
  return args;
}
