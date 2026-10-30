import { EventEmitter } from 'node:events';
import { Cli, Runner } from '../strata/cli';
import { endpointFor, errorMessage, JsonObject, object, profileName, requireRows, rows, runtimeOf, snapshotOf, supportedVersion, text } from '../strata/contracts';

export interface State {
  version: string; supported: boolean; selected: string; profiles: JsonObject[]; models: JsonObject[];
  profile: JsonObject; runtime: JsonObject; snapshot: JsonObject; endpoint: string; updated?: number;
  logs: JsonObject[]; logAvailable: boolean; error: string; busy: string; connected: boolean;
}
export function emptyState(selected = ''): State {
  return { version: '', supported: false, selected, profiles: [], models: [], profile: {}, runtime: {}, snapshot: {}, endpoint: '', logs: [], logAvailable: false, error: '', busy: '', connected: false };
}
export class ActivityBuffer {
  items: JsonObject[] = [];
  private instance = '';
  private cursor = 0;
  clear(): void { this.items = []; this.instance = ''; this.cursor = 0; }
  add(snapshot: JsonObject): void {
    const instance = text(object(snapshot.instance).id), activity = object(snapshot.activity);
    if (!instance || !activity.available || !Number.isInteger(activity.last_seq)) return;
    if (this.instance && instance !== this.instance) { this.items.push({ type: 'instance_change', instance_id: instance }); this.cursor = 0; }
    if (instance === this.instance && Number(activity.last_seq) < this.cursor) { this.items.push({ type: 'error', message: 'Activity sequence moved backwards.' }); return; }
    this.instance = instance;
    for (const event of rows(activity.events)) {
      const seq = Number(event.seq);
      if (!Number.isInteger(seq) || seq <= this.cursor) continue;
      if (seq > this.cursor + 1) this.items.push({ type: 'gap', from_seq: this.cursor + 1, to_seq: seq - 1 });
      this.items.push(event); this.cursor = seq;
    }
    const last = Number(activity.last_seq);
    if (last > this.cursor) { this.items.push({ type: 'gap', from_seq: this.cursor + 1, to_seq: last }); this.cursor = last; }
    this.items = this.items.slice(-300);
  }
}
export class StateService {
  readonly events = new EventEmitter();
  state: State;
  readonly activity = new ActivityBuffer();
  private generation = 0;
  private refreshing?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private closed = false;
  private failures = 0;
  private lastInventory = 0;
  private views = new Set<string>();
  constructor(public cli: Runner, selected: string, private options: () => Promise<{ endpoint: string; interval: number; hiddenInterval: number }>, private envFor: (endpoint: string) => Promise<NodeJS.ProcessEnv> = async () => ({})) { this.state = emptyState(selected); }
  emit(): void { this.events.emit('change', this.state); }
  async detect(cli: Cli): Promise<void> {
    const version = (await cli.raw(['--version'])).stdout.trim();
    this.state.version = version;
    this.state.supported = supportedVersion(version);
    if (!this.state.supported) this.state.error = `Untested Strata version: ${version}. This extension supports 0.2.8. Commands are disabled; configure a compatible executable.`;
    this.emit();
  }
  reset(cli: Runner): void {
    this.generation++; this.cli = cli; this.activity.clear(); this.lastInventory = 0;
    this.state = emptyState(this.state.selected); this.emit();
  }
  async select(selected: string): Promise<void> {
    if (this.state.busy) throw new Error('Wait for the current operation before changing profiles.');
    if (selected) profileName(selected);
    this.generation++; this.activity.clear();
    this.state = { ...emptyState(selected), version: this.state.version, supported: this.state.supported, profiles: this.state.profiles, models: this.state.models };
    this.emit();
    // A previous refresh is allowed to finish, but its generation cannot commit.
    if (this.refreshing) await this.refreshing;
    await this.refresh(true);
  }
  visible(id: string, value: boolean): void { if (value) this.views.add(id); else this.views.delete(id); this.schedule(100); }
  setBusy(busy: string): void { this.state.busy = busy; this.emit(); }
  refresh(force = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.closed || !this.state.supported) return Promise.resolve();
    clearTimeout(this.timer);
    this.refreshing = this.fetch(force).finally(() => { this.refreshing = undefined; this.schedule(); });
    return this.refreshing;
  }
  private async fetch(force: boolean): Promise<void> {
    const generation = this.generation, selected = this.state.selected;
    const next = { ...this.state, error: '' };
    try {
      const config = await this.options();
      if (force || Date.now() - this.lastInventory > 30000) {
        const [profiles, models] = await Promise.all([
          this.cli.json(['profile', 'list', '--json']), this.cli.json(['models', 'list', '--installed', '--json'])
        ]);
        next.profiles = requireRows(profiles, 'profiles'); next.models = requireRows(models, 'models');
        this.lastInventory = Date.now();
      }
      if (selected) {
        const [profile, runtime] = await Promise.all([
          this.cli.json(['profile', 'show', selected, '--effective', '--json']),
          this.cli.json(['runtime', 'status', '--profile', selected, '--json'], { allowFailure: true })
        ]);
        if (object(profile.profile).id !== selected || typeof profile.revision !== 'string') throw new Error('Unsupported profile response.');
        next.profile = profile; next.runtime = runtimeOf(runtime);
        if (!runtime.ok) next.error = errorMessage(runtime);
      }
      next.endpoint = endpointFor(next.runtime, next.profile, config.endpoint);
      next.connected = false; next.logAvailable = false;
      if (next.endpoint) {
        try {
          const data = await this.cli.json(['status', '--url', next.endpoint, '--credential-env', 'STRATA_VSCODE_CREDENTIAL', '--json'], { env: await this.envFor(next.endpoint) });
          next.snapshot = snapshotOf(data); next.connected = true;
          next.logAvailable = object(next.snapshot.activity).available === true;
          // Snapshot activity is exactly the feed used by `strata logs`; no second polling process needed.
          if (generation === this.generation && !this.closed) { this.activity.add(next.snapshot); next.logs = [...this.activity.items]; }
          const instance = text(object(next.snapshot.instance).id);
          if (text(next.runtime.instance_id) && instance && next.runtime.instance_id !== instance) next.error = 'This monitoring endpoint serves a different instance than the selected runtime. Engine controls still target the selected profile.';
        } catch (e) { next.snapshot = {}; next.error = String((e as Error).message); }
      } else next.snapshot = {};
      next.updated = Date.now(); this.failures = next.error ? Math.min(this.failures + 1, 4) : 0;
    } catch (e) {
      next.error = (e as Error).message; next.runtime = {}; next.snapshot = {}; next.connected = false;
      this.failures = Math.min(this.failures + 1, 4);
    }
    if (generation === this.generation && !this.closed) { this.state = { ...next, busy: this.state.busy }; this.emit(); }
  }
  private schedule(delay?: number): void {
    clearTimeout(this.timer);
    if (this.closed) return;
    void this.options().then(c => {
      if (this.closed) return;
      clearTimeout(this.timer);
      const interval = this.views.size ? c.interval : c.hiddenInterval;
      this.timer = setTimeout(() => void this.refresh(), delay ?? Math.min(interval * 1000 * 2 ** this.failures, 120000));
    }).catch(e => { this.state.error = (e as Error).message; this.emit(); });
  }
  dispose(): void { this.closed = true; this.generation++; clearTimeout(this.timer); this.events.removeAllListeners(); }
}
