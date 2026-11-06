import * as path from 'node:path';
import * as vscode from 'vscode';
import { Ctx } from '../../context';
import { Repository } from '../../git/repository';
import { translate } from '../../shared/l10n';
import { withProgress } from '../../host/ui';

export interface Submodule {
  path: string;
  name: string;
  head: string;
  expected: string;
  status: 'clean' | 'modified' | 'uninitialized' | 'missing' | 'conflict';
}

export function parseSubmoduleStatus(root: string, output: string): Submodule[] {
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const code = line[0] ?? '-';
    const rest = line.slice(1).trim();
    const match = /^([0-9a-f-]+)\s+([^ ]+)(?:\s+(.+))?$/.exec(rest);
    const head = match?.[1] ?? '';
    const subPath = match?.[2] ?? rest;
    const detail = match?.[3] ?? '';
    const status = code === '-' ? 'uninitialized' : code === '?' ? 'missing' : code === 'U' ? 'conflict' : detail ? 'modified' : 'clean';
    return { path: subPath, name: path.basename(subPath), head, expected: head, status };
  });
}

export async function listSubmodules(repo: Repository): Promise<Submodule[]> {
  const result = await repo.exec(['submodule', 'status', '--recursive'], { allowFailure: true, quiet: true });
  return parseSubmoduleStatus(repo.root, result.stdout);
}

export async function updateSubmodules(repo: Repository, recursive = true): Promise<{ ok: boolean; output: string }> {
  const args = ['submodule', 'update', '--init'];
  if (recursive) args.push('--recursive');
  const result = await repo.exec(args, { allowFailure: true });
  await repo.refresh();
  return { ok: result.exitCode === 0, output: (result.stdout + '\n' + result.stderr).trim() };
}

type Node = { repo: Repository } | { repo: Repository; submodule: Submodule };

export class SubmodulesView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  readonly view: vscode.TreeView<Node>;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly cache = new Map<string, Submodule[]>();

  constructor(private readonly ctx: Ctx) {
    this.view = vscode.window.createTreeView('ideagittool.submodules', { treeDataProvider: this, showCollapseAll: false });
    this.disposables.push(this.view);
    ctx.repos.onDidChangeRepository(e => e.status && this.refresh(), null, this.disposables);
    ctx.repos.onDidChangeRepositories(() => this.refresh(), null, this.disposables);
  }

  refresh() { this.cache.clear(); this.emitter.fire(undefined); }

  async getChildren(node?: Node): Promise<Node[]> {
    await this.ctx.repos.ready();
    if (!node) return this.ctx.repos.repositories.map(repo => ({ repo }));
    if (!('submodule' in node)) {
      const list = this.cache.get(node.repo.root) ?? await listSubmodules(node.repo);
      this.cache.set(node.repo.root, list);
      return list.map(submodule => ({ repo: node.repo, submodule }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (!('submodule' in node)) {
      const item = new vscode.TreeItem(node.repo.name, vscode.TreeItemCollapsibleState.Expanded);
      item.description = node.repo.root;
      item.contextValue = 'submoduleRepository';
      return item;
    }
    const s = node.submodule;
    const item = new vscode.TreeItem(s.path);
    item.description = `${s.status} ${s.head.slice(0, 8)}`;
    item.tooltip = `${s.path}\n${s.status}\n${s.head}`;
    item.contextValue = `submodule ${s.status}`;
    return item;
  }

  dispose() { this.disposables.forEach(d => d.dispose()); }
}

export function register(ctx: Ctx) {
  const view = new SubmodulesView(ctx);
  ctx.extension.subscriptions.push(view);
  ctx.command('ideagittool.submodules.refresh', () => view.refresh());
  ctx.command('ideagittool.submodules.update', async (arg?: { root?: string }) => {
    const repo = arg?.root ? ctx.repos.get(arg.root) : await ctx.repos.pick(translate('Select a Git repository'));
    if (!repo) return;
    const result = await withProgress(translate('Updating submodules…'), () => updateSubmodules(repo));
    view.refresh();
    if (!result.ok) void vscode.window.showErrorMessage(result.output || translate('Submodule update failed'));
    else void vscode.window.showInformationMessage(translate('Submodules updated'));
  });
}
