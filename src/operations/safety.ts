import * as vscode from 'vscode';
import { Repository } from '../git/repository';
import { translate } from '../shared/l10n';

export interface DestructivePreview {
  operation: string;
  root: string;
  branch?: string;
  target?: string;
  changedFiles: number;
  untrackedFiles: number;
  warning: string;
}

export function previewDestructive(repo: Repository, operation: string, target?: string): DestructivePreview {
  const changedFiles = repo.status.changes.filter(c => c.status !== 'U').length;
  const untrackedFiles = repo.status.unversioned.length;
  const warning = operation.toLowerCase().includes('push')
    ? translate('This operation may overwrite commits on the remote.')
    : translate('This operation may remove local commits or file changes.');
  return { operation, root: repo.root, branch: repo.info.branch, target, changedFiles, untrackedFiles, warning };
}

export async function confirmDestructive(preview: DestructivePreview): Promise<boolean> {
  const confirm = translate('Continue');
  const detail = [
    `${preview.warning}`,
    `${translate('Repository')}: ${preview.root}`,
    `${translate('Branch')}: ${preview.branch ?? translate('detached HEAD')}`,
    preview.target ? `${translate('Target')}: ${preview.target}` : '',
    `${translate('Changed files')}: ${preview.changedFiles}`,
    `${translate('Untracked files')}: ${preview.untrackedFiles}`,
  ].filter(Boolean).join('\n');
  return (await vscode.window.showWarningMessage(preview.operation, { modal: true, detail }, confirm)) === confirm;
}
