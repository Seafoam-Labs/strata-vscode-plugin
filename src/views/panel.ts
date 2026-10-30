import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { StateService } from '../services/state';
import { message, Message } from '../shared/messages';

export class Panels implements vscode.WebviewViewProvider, vscode.Disposable {
  private ready = new Set<string>();
  readyViews(): string[] { return [...this.ready]; }
  private dashboard?: vscode.WebviewPanel;
  private views = new Map<string, vscode.Webview>();
  private cleanups: vscode.Disposable[] = [];
  private update = () => { for (const view of this.views.values()) void view.postMessage({ type: 'state', state: this.service.state }); };
  constructor(private uri: vscode.Uri, private service: StateService, private dispatch: (message: Message) => Promise<void>) { service.events.on('change', this.update); }
  resolveWebviewView(view: vscode.WebviewView): void {
    this.attach(view.webview, 'sidebar');
    const visible = () => this.service.visible('sidebar', view.visible);
    visible();
    this.cleanups.push(view.onDidChangeVisibility(visible), view.onDidDispose(() => { this.ready.delete('sidebar'); this.views.delete('sidebar'); this.service.visible('sidebar', false); }));
  }
  handle(message: Message): Promise<void> { return this.dispatch(message); }
  expand(): void {
    if (this.dashboard) { this.dashboard.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('strata.dashboard', 'Strata', vscode.ViewColumn.Beside, {});
    this.dashboard = panel; this.attach(panel.webview, 'dashboard');
    this.service.visible('dashboard', panel.visible);
    this.cleanups.push(panel.onDidChangeViewState(e => this.service.visible('dashboard', e.webviewPanel.visible)), panel.onDidDispose(() => { this.dashboard = undefined; this.ready.delete('dashboard'); this.views.delete('dashboard'); this.service.visible('dashboard', false); }));
  }
  private attach(view: vscode.Webview, id: string): void {
    this.views.set(id, view);
    view.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.uri, 'media')] };
    const nonce = randomBytes(18).toString('base64');
    const css = view.asWebviewUri(vscode.Uri.joinPath(this.uri, 'media', 'main.css'));
    const js = view.asWebviewUri(vscode.Uri.joinPath(this.uri, 'media', 'main.js'));
    view.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${css}"><title>Strata</title></head><body data-layout="${id}"><main id="app"></main><script nonce="${nonce}" src="${js}"></script></body></html>`;
    this.cleanups.push(view.onDidReceiveMessage(async raw => {
      let requestId = '';
      try {
        const m = message(raw); requestId = m.id;
        if (m.action === 'ready') { this.ready.add(id); this.update(); } else await this.dispatch(m);
        await view.postMessage({ type: 'result', id: requestId, ok: true });
      } catch (e) { await view.postMessage({ type: 'result', id: requestId, ok: false, error: (e as Error).message }); }
    }));
  }
  dispose(): void { this.service.events.off('change', this.update); this.dashboard?.dispose(); this.views.clear(); this.cleanups.forEach(x => x.dispose()); }
}
