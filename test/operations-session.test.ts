import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationCoordinator, OperationSession } from '../src/operations/session';

test('operation session records lifecycle and command', () => {
  const session = new OperationSession('/repo', 'merge');
  session.setCommand(['merge', 'feature']);
  session.setPhase('running');
  assert.equal(session.snapshot().phase, 'running');
  assert.deepEqual(session.snapshot().command, ['merge', 'feature']);
  session.finish('success');
  assert.equal(session.snapshot().phase, 'done');
  assert.equal(session.snapshot().outcome, 'success');
  assert.throws(() => session.setPhase('running'), /already complete/);
});

test('operation coordinator prevents concurrent writes per repository', () => {
  const coordinator = new OperationCoordinator();
  const first = coordinator.start('/repo', 'rebase');
  assert.equal(coordinator.current('/repo')?.operation, 'rebase');
  assert.throws(() => coordinator.start('/repo', 'merge'), /already running/);
  coordinator.finish(first, 'success');
  const second = coordinator.start('/repo', 'merge');
  assert.equal(coordinator.current('/repo')?.operation, 'merge');
  coordinator.finish(second, 'error');
  assert.equal(coordinator.current('/repo'), undefined);
});

test('operation coordinator keeps bounded records', () => {
  const coordinator = new OperationCoordinator();
  for (let i = 0; i < 105; i++) {
    coordinator.record({ sessionId: String(i), root: '/repo', operation: 'fetch', args: [], exitCode: 0, stdout: '', stderr: '', startedAt: i, durationMs: 1, outcome: 'success' });
  }
  assert.equal(coordinator.recent('/repo').length, 100);
  assert.equal(coordinator.recent('/repo')[0].sessionId, '5');
});

test('structured operation records retain cancellation and command output', async () => {
  const { operations } = await import('../src/operations/session');
  operations.record({ sessionId: 'cancelled', root: '/repo', operation: 'fetch', args: ['fetch'], exitCode: 143, stdout: '', stderr: 'cancelled', startedAt: 1, durationMs: 3, outcome: 'cancelled' });
  assert.equal(operations.recent('/repo').at(-1)?.outcome, 'cancelled');
});

test('destructive preview counts local changes and untracked files', async () => {
  const { previewDestructive } = await import('../src/operations/safety');
  const repo = { root: '/repo', info: { branch: 'main' }, status: { changes: [{ status: 'M' }], unversioned: [{ status: '?' }] } } as any;
  const preview = previewDestructive(repo, 'Hard Reset', 'HEAD~1');
  assert.equal(preview.changedFiles, 1);
  assert.equal(preview.untrackedFiles, 1);
  assert.equal(preview.target, 'HEAD~1');
});

test('remote provider returns no provider for unknown hosts', async () => {
  const { providerForRemote } = await import('../src/features/providers');
  assert.equal(providerForRemote('https://example.com/a/b.git'), undefined);
});

test('operation session exposes cancellation requests', async () => {
  const { OperationSession } = await import('../src/operations/session');
  const session = new OperationSession('/repo', 'fetch');
  session.requestCancel();
  assert.equal(session.cancelRequested, true);
  session.finish('cancelled');
  assert.equal(session.snapshot().phase, 'cancelled');
  assert.equal(session.snapshot().outcome, 'cancelled');
});

test('repository write operation assigns one session to nested Git commands', async () => {
  const { Repository } = await import('../src/git/repository');
  const { operations } = await import('../src/operations/session');
  const dir = process.cwd();
  const repo = new Repository(dir, `${dir}/.git`, `${dir}/.git`);
  await repo.withWriteOperation('diagnostic-test', async session => {
    await repo.exec(['rev-parse', '--show-toplevel'], { allowFailure: true, quiet: true });
    assert.equal(operations.recent(dir).at(-1)?.sessionId, session.id);
  });
  repo.dispose();
});
