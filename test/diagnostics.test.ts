import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDiagnostics, GitDiagnostics } from '../src/features/diagnostics';

test('diagnostics formatter includes safe repository details', () => {
  const data: GitDiagnostics = {
    gitPath: 'git',
    gitVersion: 'git version 2.45.0',
    workspaceFolders: ['C:/workspace'],
    repositories: [{ root: 'C:/workspace/repo', gitDir: 'C:/workspace/repo/.git', commonDir: 'C:/workspace/repo/.git', branch: 'main', operation: 'none', ahead: 1, behind: 2, shallow: false }],
    activeOperations: [],
    credentialHelpers: ['manager-core'],
    rebase: { active: false },
    lfs: { installed: false, files: [], locks: [] },
    recentOperations: [],
  };
  const output = formatDiagnostics(data);
  assert.match(output, /Git version: git version 2\.45\.0/);
  assert.match(output, /branch=main/);
  assert.match(output, /ahead=1 behind=2 shallow=false/);
  assert.doesNotMatch(output, /token|password|secret/i);
});

test('diagnostics data accepts rebase and LFS sections', () => {
  const data: GitDiagnostics = { gitPath: 'git', gitVersion: 'git version 2', workspaceFolders: [], repositories: [], activeOperations: [], credentialHelpers: [], rebase: { active: true, remaining: 2 }, lfs: { installed: true, files: [] }, recentOperations: [] };
  assert.match(formatDiagnostics(data), /Git path: git/);
});


test('diagnostics groups commands by operation session', () => {
  const data: GitDiagnostics = {
    gitPath: 'git', gitVersion: 'git version 2', workspaceFolders: [], repositories: [], activeOperations: [], credentialHelpers: [], rebase: { active: false }, lfs: { installed: false, files: [], locks: [] },
    recentOperations: [
      { sessionId: 'session-1234', root: '/repo', operation: 'rebase', args: ['rebase'], exitCode: 0, stdout: '', stderr: '', startedAt: 1, durationMs: 10, outcome: 'success' },
      { sessionId: 'session-1234', root: '/repo', operation: 'rebase', args: ['checkout'], exitCode: 0, stdout: '', stderr: '', startedAt: 2, durationMs: 20, outcome: 'success' },
    ],
  };
  const output = formatDiagnostics(data);
  assert.match(output, /rebase: success \(30 ms, 2 commands, session session-/);
});
