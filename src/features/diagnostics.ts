import * as vscode from 'vscode';
import { getGitPath } from '../git/exec';
import { Ctx } from '../context';
import { operations, GitOperationRecord } from '../operations/session';
import { rebaseStatus, RebaseStatus } from './ops/engine';
import { lfsStatus, LfsStatus } from './ops/lfs';
import { activeRepo } from './ops/common';

export interface GitDiagnostics {
  gitPath: string;
  gitVersion: string;
  workspaceFolders: string[];
  repositories: Array<{
    root: string;
    gitDir: string;
    commonDir: string;
    branch?: string;
    operation: string;
    ahead: number;
    behind: number;
    shallow: boolean;
  }>;
  activeOperations: ReturnType<typeof operations.current>[];
  credentialHelpers: string[];
  rebase: RebaseStatus;
  lfs: LfsStatus;
  recentOperations: ReturnType<typeof operations.recent>;
}

export async function collectDiagnostics(ctx: Ctx): Promise<GitDiagnostics> {
  await ctx.repos.ready();
  const first = ctx.repos.repositories[0];
  let gitVersion = 'unknown';
  if (first) {
    const result = await first.exec(['--version'], { allowFailure: true, quiet: true });
    gitVersion = result.stdout.trim() || result.stderr.trim() || 'unknown';
  }
  const credentialHelpers = first ? await loadCredentialHelpers(first) : [];
  return {
    gitPath: getGitPath(),
    gitVersion,
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath),
    repositories: ctx.repos.repositories.map(repo => ({
      root: repo.root,
      gitDir: repo.gitDir,
      commonDir: repo.commonDir,
      branch: repo.info.branch,
      operation: repo.info.operation,
      ahead: repo.info.ahead,
      behind: repo.info.behind,
      shallow: repo.info.shallow,
    })),
    activeOperations: ctx.repos.repositories.map(repo => operations.current(repo.root)).filter(Boolean),
    credentialHelpers,
    rebase: first ? await rebaseStatus(first) : { active: false },
    lfs: first ? await lfsStatus(first) : { installed: false, files: [], locks: [] },
    recentOperations: operations.recent(),
  };
}

async function loadCredentialHelpers(repo: { execText(args: string[], opts?: any): Promise<string> }): Promise<string[]> {
  const output = await repo.execText(['config', '--get-all', 'credential.helper'], { allowFailure: true, quiet: true });
  return output.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(redactCredentialHelper);
}

function redactCredentialHelper(value: string): string {
  return value.replace(/(https?:\/\/)([^/@]+):([^/@]+)@/gi, '$1<redacted>@');
}

export function formatDiagnostics(data: GitDiagnostics): string {
  const lines = [
    `Git path: ${data.gitPath}`,
    `Git version: ${data.gitVersion}`,
    `Workspace folders: ${data.workspaceFolders.join(', ') || '(none)'}`,
    `Credential helpers: ${data.credentialHelpers.join(', ') || '(none)'}`,
    '',
    'Repositories:',
  ];
  for (const repo of data.repositories) {
    lines.push(`- ${repo.root}`);
    lines.push(`  gitDir=${repo.gitDir}`);
    lines.push(`  commonDir=${repo.commonDir}`);
    lines.push(`  branch=${repo.branch ?? '(detached)'}`);
    lines.push(`  operation=${repo.operation}`);
    lines.push(`  ahead=${repo.ahead} behind=${repo.behind} shallow=${repo.shallow}`);
  }
  if (data.recentOperations.length) {
    lines.push('', 'Recent operations:');
    const grouped = new Map<string, GitOperationRecord[]>();
    for (const record of data.recentOperations.slice(-20)) {
      const list = grouped.get(record.sessionId) ?? [];
      list.push(record);
      grouped.set(record.sessionId, list);
    }
    for (const [sessionId, records] of [...grouped].reverse()) {
      const first = records[0];
      const outcomes = [...new Set(records.map(r => r.outcome))].join(', ');
      const duration = records.reduce((sum, r) => sum + r.durationMs, 0);
      lines.push(`- ${first.operation}: ${outcomes} (${duration} ms, ${records.length} command${records.length === 1 ? '' : 's'}, session ${sessionId.slice(0, 8)})`);
    }
  }
  if (data.activeOperations.length) {
    lines.push('', 'Active operations:');
    for (const operation of data.activeOperations) lines.push(`- ${operation!.root}: ${operation!.operation} (${operation!.phase})`);
  }
  return lines.join('\n');
}

export function register(ctx: Ctx) {
  ctx.command('ideagittool.copyDiagnostics', async () => {
    const diagnostics = await collectDiagnostics(ctx);
    await vscode.env.clipboard.writeText(formatDiagnostics(diagnostics));
    void vscode.window.showInformationMessage('Git diagnostics copied to clipboard');
    return diagnostics;
  });
  ctx.command('ideagittool.diagnostics', async () => {
    const diagnostics = await collectDiagnostics(ctx);
    const document = await vscode.workspace.openTextDocument({ content: formatDiagnostics(diagnostics), language: 'plaintext' });
    await vscode.window.showTextDocument(document, { preview: false });
    return diagnostics;
  });
}

export function diagnosticsRepository(ctx: Ctx) {
  return activeRepo(ctx);
}
