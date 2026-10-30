import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { Cli, discoverExecutable } from './strata/cli';
import { assignments, JsonObject, localEndpoint, profileName, rows, RuntimeAction, text } from './strata/contracts';
import { commands, terminalArguments } from './strata/commands';
import { StateService } from './services/state';
import { Operations } from './services/operations';
import { Panels } from './views/panel';
import { StrataTree } from './views/trees';
import { Message } from './shared/messages';

export async function activate(context: vscode.ExtensionContext): Promise<{ state: () => unknown; views: () => string[] }> {
  const output = vscode.window.createOutputChannel('Strata');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.command = 'strata.overview.focus'; status.show();
  const operations = new Operations();
  let cli = new Cli('strata', s => output.appendLine(s));
  let reconnect = false, connecting = false, disposed = false;
  const readSetting = <T>(key: string, fallback: T): T => {
    // Ignore workspace values even if a hand-edited settings.json supplies machine settings.
    const setting = vscode.workspace.getConfiguration('strata').inspect<T>(key);
    return setting?.globalValue ?? setting?.defaultValue ?? fallback;
  };
  const envFor = async (endpoint: string): Promise<NodeJS.ProcessEnv> => ({ STRATA_VSCODE_CREDENTIAL: await context.secrets.get(`endpoint:${endpoint}`) || '' });
  const service = new StateService(cli, context.globalState.get('profile', ''), async () => ({
    endpoint: readSetting('endpoint', ''), interval: Math.max(1, readSetting('refreshInterval', 2)), hiddenInterval: Math.max(10, readSetting('hiddenRefreshInterval', 30))
  }), envFor);
  const terminals = new Map<string, vscode.Terminal>();
  function ensure(): void {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before running Strata.');
    if (!service.state.supported) throw new Error(service.state.error || 'Configure a compatible Strata installation first.');
  }
  function selected(): string { ensure(); if (!service.state.selected) throw new Error('Select or create a serving profile first.'); return profileName(service.state.selected); }
  async function report(data: unknown, title = 'Strata result'): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content: typeof data === 'string' ? data : JSON.stringify(data, null, 2), language: typeof data === 'string' ? 'plaintext' : 'json' });
    await vscode.window.showTextDocument(document, { preview: true });
    output.appendLine(title);
  }
  async function review(title: string, data: unknown, args?: string[]): Promise<boolean> {
    const detail = `${args ? `strata ${args.map(x => JSON.stringify(x)).join(' ')}\n\n` : ''}${JSON.stringify(data, null, 2)}`;
    const result = await vscode.window.showWarningMessage(title, { modal: true, detail: detail.length > 18000 ? detail.slice(0, 18000) + '\n… Open diagnostics for larger results.' : detail }, 'Apply');
    return result === 'Apply';
  }
  async function work(label: string, fn: (signal: AbortSignal) => Promise<void>): Promise<void> {
    ensure();
    await operations.exclusive(async () => {
      service.setBusy(label);
      try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Strata: ${label}`, cancellable: true }, async (_, token) => {
          const abort = new AbortController(); const listener = token.onCancellationRequested(() => abort.abort());
          try { await fn(abort.signal); } finally { listener.dispose(); }
        });
      } finally { service.setBusy(''); await service.refresh(true); }
    }).finally(async () => { if (reconnect) await connect(); });
  }
  async function runtime(action: RuntimeAction): Promise<void> {
    const profile = selected();
    await work(`${action} ${profile}`, async signal => {
      const result = await operations.runtime(cli, action, profile, (plan, args) => review(
        action === 'verify' ? `Verify ${profile}? This may generate a test token.` : `${action[0].toUpperCase() + action.slice(1)} engine for ${profile}?${action !== 'start' ? ' Active requests may be interrupted.' : ' The engine will continue running after the editor closes.'}`, plan, args), signal);
      if (result) void vscode.window.showInformationMessage(`Strata ${action}: ${text(result.state) || 'complete'}.`);
    });
  }
  async function chooseProfile(id?: unknown): Promise<void> {
    ensure();
    let name = typeof id === 'string' ? id : '';
    if (!name) name = (await vscode.window.showQuickPick(service.state.profiles.map(p => ({ label: text(p.id), description: text(p.source_config) })), { title: 'Select Strata profile' }))?.label || '';
    if (!name) return;
    if (!service.state.profiles.some(p => p.id === name)) throw new Error('Profile is no longer available. Refresh Strata.');
    await service.select(name); await context.globalState.update('profile', name);
  }
  async function chooseModel(id?: unknown): Promise<JsonObject | undefined> {
    ensure();
    if (typeof id === 'string') {
      const model = service.state.models.find(m => m.id === id);
      if (!model) throw new Error('Model is no longer available. Refresh Strata.');
      return model;
    }
    const picked = await vscode.window.showQuickPick(service.state.models.map(m => ({ label: text(m.name) || text(m.id), description: text(m.source_config), model: m })), { title: 'Select an installed model configuration' });
    return picked?.model;
  }
  async function createProfile(): Promise<void> {
    const model = await chooseModel(); if (!model) return;
    const name = await vscode.window.showInputBox({ title: 'New Strata profile', prompt: 'Lowercase name, numbers, underscores, or hyphens', validateInput: value => { try { profileName(value); return undefined; } catch (e) { return (e as Error).message; } } });
    if (!name) return;
    await work(`Create ${name}`, async signal => {
      if (!await review(`Create profile ${name}?`, { model: model.name, source_config: model.source_config }) || signal.aborted) return;
      await cli.json(['profile', 'create', name, '--from-config', text(model.source_config), '--json'], { signal });
    });
    if (service.state.profiles.some(p => p.id === name)) await chooseProfile(name);
  }
  async function editProfile(value: unknown): Promise<void> {
    const name = selected(), values = assignments(value);
    await work(`Save settings for ${name}`, async signal => {
      const base = ['profile', 'set', name, ...values];
      const preview = await cli.json([...base, '--plan', '--json'], { signal });
      if (!await review(`Save settings for ${name}? Running settings stay unchanged until restart.`, preview, base) || signal.aborted) return;
      const fresh = await cli.json([...base, '--plan', '--json'], { signal });
      if (JSON.stringify(fresh) !== JSON.stringify(preview)) throw new Error('Profile changed during review. Preview again.');
      await cli.json([...base, '--json'], { signal });
      void vscode.window.showInformationMessage('Profile saved. Restart the engine when you want to apply it.');
    });
  }
  async function useModel(): Promise<void> {
    const name = selected(), model = await chooseModel(); if (!model) return;
    await work(`Change model for ${name}`, async signal => {
      const base = ['profile', 'use-config', name, '--from-config', text(model.source_config)];
      const plan = await cli.json([...base, '--plan', '--json'], { signal });
      if (!/^[0-9a-f]{16}$/.test(text(plan.revision))) throw new Error('Missing profile revision in preview.');
      if (!await review(`Change saved model for ${name}? Stop then start to switch a running model.`, plan, base) || signal.aborted) return;
      await cli.json([...base, '--if-revision', text(plan.revision), '--json'], { signal });
    });
  }
  async function history(): Promise<void> {
    const name = selected();
    await work(`Profile history: ${name}`, async signal => {
      const data = await cli.json(['profile', 'history', name, '--json'], { signal });
      const item = await vscode.window.showQuickPick(rows(data.history).map(r => ({ label: text(r.revision), description: r.current ? 'Current' : r.saved_at ? new Date(Number(r.saved_at) * 1000).toLocaleString() : 'Saved', row: r })), { title: 'Select a profile revision to restore' });
      if (!item || item.row.current || !/^[0-9a-f]{16}$/.test(item.label)) return;
      const before = await cli.json(['profile', 'show', name, '--json'], { signal });
      if (!await review(`Restore ${name} to ${item.label}? Running settings remain unchanged.`, item.row) || signal.aborted) return;
      const fresh = await cli.json(['profile', 'show', name, '--json'], { signal });
      if (before.revision !== fresh.revision) throw new Error('Profile changed during review. Try again.');
      await cli.json(['profile', 'rollback', name, '--to', item.label, '--json'], { signal });
    });
  }
  async function terminal(args: string[], name: string): Promise<void> {
    ensure();
    if (vscode.env.remoteName) throw new Error('Local TUI launch is unavailable in remote workspace windows. Open a local editor window to use it.');
    const key = JSON.stringify(args);
    let term = terminals.get(key);
    if (!term) {
      term = vscode.window.createTerminal({ name: `Strata: ${name}`, shellPath: cli.executable, shellArgs: args, cwd: homedir(), env: service.state.endpoint ? await envFor(service.state.endpoint) : {}, isTransient: true });
      terminals.set(key, term);
    }
    term.show();
  }
  async function monitor(): Promise<void> {
    ensure();
    if (!service.state.endpoint) throw new Error('Select a profile with a known local endpoint, or configure Strata: Endpoint.');
    await terminal(['monitor', '--url', service.state.endpoint, '--credential-env', 'STRATA_VSCODE_CREDENTIAL'], 'Monitor');
  }
  async function browse(id?: unknown): Promise<void> {
    ensure();
    const command = typeof id === 'string' ? commands.find(c => c.name === id) : (await vscode.window.showQuickPick(commands.map(c => ({ label: c.name, description: `${c.group} · ${c.effect}`, detail: c.description, command: c })), { title: 'Strata commands', matchOnDescription: true, matchOnDetail: true }))?.command;
    if (!command) return;
    const help = (await cli.raw([command.name, '--help'])).stdout;
    const choice = await vscode.window.showQuickPick(['Show help', 'Run in terminal'], { title: `${command.name} · ${command.effect}`, placeHolder: command.description });
    if (choice === 'Show help') { await report(help); return; }
    if (choice !== 'Run in terminal') return;
    const raw = await vscode.window.showInputBox({ title: `Arguments for strata ${command.name}`, prompt: 'JSON array of arguments. Example: ["list", "--json"]. Start with --help to inspect subcommands.', value: '["--help"]', validateInput: value => { try { terminalArguments(value, command.name); return undefined; } catch (e) { return (e as Error).message; } } });
    if (raw === undefined) return;
    const args = terminalArguments(raw, command.name);
    if (await review(`Open strata ${command.name} in a terminal? ${command.effect}.`, { arguments: args }, args)) await terminal(args, command.name);
  }
  async function credential(): Promise<void> {
    ensure();
    const endpoint = localEndpoint(service.state.endpoint || readSetting('endpoint', ''));
    const value = await vscode.window.showInputBox({ title: `Credential for ${endpoint}`, password: true, prompt: 'Stored in editor SecretStorage. Leave blank to remove.' });
    if (value === undefined) return;
    if (value) await context.secrets.store(`endpoint:${endpoint}`, value); else await context.secrets.delete(`endpoint:${endpoint}`);
    await service.refresh();
  }
  const panels = new Panels(context.extensionUri, service, async (m: Message) => {
    const handlers: Record<string, () => Promise<unknown>> = {
      refresh: async () => { await connect(); },
      select: () => chooseProfile(m.value), start: () => runtime('start'), stop: () => runtime('stop'), restart: () => runtime('restart'), verify: () => runtime('verify'),
      monitor, launch: async () => { if (await review('Open guided setup? Strata may download models and start serving.', { command: 'strata launch' })) await terminal(['launch'], 'Setup'); },
      dashboard: async () => panels.expand(), settings: async () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:strata-local.strata-control'), credential,
      doctor: async () => { ensure(); await report(await cli.json(['doctor', ...(service.state.selected ? ['--profile', selected()] : []), '--json'], { allowFailure: true, timeout: 30000 }), 'Diagnostics'); },
      createProfile, editProfile: () => editProfile(m.value), useModel,
      validateProfile: async () => report(await cli.json(['profile', 'validate', selected(), '--json'])), history, browse: () => browse(m.value),
      inspectModel: async () => { const model = await chooseModel(m.value); if (model) await report(await cli.json(['models', 'inspect', text(model.id), '--json'])); }
    };
    await handlers[m.action]?.();
  });
  const dispatch = async (action: Message['action'], value?: unknown) => {
    // Same controller for palette, trees, sidebar and dashboard.
    const m: Message = { id: 'command', action, value };
    try { await panels.handle(m); }
    catch (e) { void vscode.window.showErrorMessage(`Strata: ${(e as Error).message}`); }
  };
  for (const [command, action] of Object.entries({ refresh: 'refresh', dashboard: 'dashboard', selectProfile: 'select', createProfile: 'createProfile', start: 'start', stop: 'stop', restart: 'restart', verify: 'verify', monitor: 'monitor', launch: 'launch', browse: 'browse', doctor: 'doctor', credential: 'credential', settings: 'settings', inspectModel: 'inspectModel' })) {
    context.subscriptions.push(vscode.commands.registerCommand(`strata.${command}`, (value: unknown) => dispatch(action as Message['action'], value)));
  }
  context.subscriptions.push(output, status, panels, vscode.window.registerWebviewViewProvider('strata.overview', panels));
  for (const kind of ['profiles', 'models', 'commands'] as const) {
    const tree = new StrataTree(kind, service);
    context.subscriptions.push(tree, vscode.window.registerTreeDataProvider(`strata.${kind}`, tree));
  }
  service.events.on('change', () => {
    const state = service.state;
    const label = !state.supported ? 'Configure' : state.busy || (state.runtime.state === 'ready' ? 'Running' : text(state.runtime.state) || (state.connected ? 'Monitoring' : 'Select profile'));
    status.text = `$(layers) Strata: ${label}`;
    status.tooltip = state.error || `Local engine · ${state.selected || 'No profile selected'}`;
  });
  async function connect(): Promise<void> {
    if (operations.busy || connecting) { reconnect = true; return; }
    connecting = true; reconnect = false;
    try {
      if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace to connect to local Strata.');
      const executable = await discoverExecutable(readSetting('executablePath', ''));
      cli.dispose(); cli = new Cli(executable, s => output.appendLine(s)); service.reset(cli);
      await service.detect(cli);
      if (service.state.supported) await service.select(service.state.selected);
    } catch (e) { service.state.supported = false; service.state.error = (e as Error).message; service.emit(); }
    finally { connecting = false; if (reconnect && !disposed) void connect(); }
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('strata')) void connect(); }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void connect()),
    vscode.window.onDidCloseTerminal(terminal => { for (const [key, value] of terminals) if (value === terminal) terminals.delete(key); }),
    { dispose: () => { disposed = true; service.dispose(); cli.dispose(); } }
  );
  await connect();
  return { state: () => service.state, views: () => panels.readyViews() };
}
