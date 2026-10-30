import * as vscode from 'vscode';
import { StateService } from '../services/state';
import { commands } from '../strata/commands';
import { text } from '../strata/contracts';

class Item extends vscode.TreeItem { constructor(label: string, readonly group?: string) { super(label, group ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None); } }
export class StrataTree implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private update = () => this.changed.fire();
  constructor(private kind: 'profiles' | 'models' | 'commands', private service: StateService) { service.events.on('change', this.update); }
  getTreeItem(item: Item): vscode.TreeItem { return item; }
  getChildren(parent?: Item): Item[] {
    if (this.kind === 'commands') {
      if (!parent) return [...new Set(commands.map(c => c.group))].map(group => new Item(group, group));
      return commands.filter(c => c.group === parent.group).map(c => {
        const item = new Item(c.name); item.description = c.effect; item.tooltip = c.description;
        item.command = { command: 'strata.browse', title: 'Command details', arguments: [c.name] }; return item;
      });
    }
    const data = this.service.state[this.kind];
    if (!data.length) return [new Item(this.service.state.supported ? `No ${this.kind} found` : 'Configure Strata to discover items')];
    return data.map(row => {
      const id = text(row.id), item = new Item(text(row.name) || id);
      item.id = `${this.kind}:${id}`;
      item.description = this.kind === 'profiles' ? (id === this.service.state.selected ? 'Selected' : '') : text(row.component_status);
      item.tooltip = text(row.source_config);
      item.iconPath = new vscode.ThemeIcon(this.kind === 'profiles' ? 'settings-gear' : 'database');
      item.command = { command: this.kind === 'profiles' ? 'strata.selectProfile' : 'strata.inspectModel', title: 'Select', arguments: [id] };
      return item;
    });
  }
  dispose(): void { this.service.events.off('change', this.update); this.changed.dispose(); }
}
