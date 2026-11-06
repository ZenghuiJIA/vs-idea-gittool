import { randomUUID } from 'node:crypto';

export type OperationPhase = 'checking' | 'saving' | 'running' | 'conflict' | 'restoring' | 'refreshing' | 'cancelled' | 'done';

export interface OperationSessionSnapshot {
  readonly id: string;
  readonly root: string;
  readonly operation: string;
  readonly startedAt: number;
  readonly phase: OperationPhase;
  readonly command?: readonly string[];
  readonly cancellable: boolean;
  readonly finishedAt?: number;
  readonly outcome?: string;
  readonly cancelRequested?: boolean;
}

export interface GitOperationRecord {
  readonly sessionId: string;
  readonly root: string;
  readonly operation: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly outcome: string;
}

export class OperationSession {
  readonly id = randomUUID();
  readonly startedAt = Date.now();
  private phaseValue: OperationPhase = 'checking';
  private commandValue: readonly string[] | undefined;
  private finishedAtValue: number | undefined;
  private outcomeValue: string | undefined;
  private cancelRequestedValue = false;

  constructor(
    readonly root: string,
    readonly operation: string,
    readonly cancellable = true,
  ) {}

  get phase(): OperationPhase {
    return this.phaseValue;
  }

  get command(): readonly string[] | undefined {
    return this.commandValue;
  }

  setPhase(phase: OperationPhase) {
    if (this.phaseValue === 'done') throw new Error('An operation session is already complete');
    this.phaseValue = phase;
  }

  setCommand(args: readonly string[]) {
    if (this.phaseValue === 'done') throw new Error('An operation session is already complete');
    this.commandValue = [...args];
  }

  requestCancel() {
    if (this.phaseValue !== 'done') this.cancelRequestedValue = true;
  }

  get cancelRequested() { return this.cancelRequestedValue; }

  finish(outcome: string) {
    if (this.phaseValue === 'done') return;
    this.phaseValue = outcome === 'cancelled' ? 'cancelled' : 'done';
    this.outcomeValue = outcome;
    this.finishedAtValue = Date.now();
  }

  snapshot(): OperationSessionSnapshot {
    return {
      id: this.id,
      root: this.root,
      operation: this.operation,
      startedAt: this.startedAt,
      phase: this.phaseValue,
      command: this.commandValue,
      cancellable: this.cancellable,
      finishedAt: this.finishedAtValue,
      outcome: this.outcomeValue,
      cancelRequested: this.cancelRequestedValue,
    };
  }
}

export class OperationCoordinator {
  private readonly active = new Map<string, OperationSession>();
  private readonly records: GitOperationRecord[] = [];

  start(root: string, operation: string, cancellable = true): OperationSession {
    if (this.active.has(root)) {
      const current = this.active.get(root)!;
      throw new Error(`Git operation already running: ${current.operation}`);
    }
    const session = new OperationSession(root, operation, cancellable);
    this.active.set(root, session);
    return session;
  }

  current(root: string): OperationSessionSnapshot | undefined {
    return this.active.get(root)?.snapshot();
  }

  finish(session: OperationSession, outcome: string) {
    session.finish(outcome);
    if (this.active.get(session.root) === session) this.active.delete(session.root);
  }

  record(record: GitOperationRecord) {
    this.records.push(record);
    if (this.records.length > 100) this.records.shift();
  }

  recent(root?: string): readonly GitOperationRecord[] {
    return this.records.filter(r => !root || r.root === root);
  }

  clear(root?: string) {
    if (!root) this.records.length = 0;
    else for (let i = this.records.length - 1; i >= 0; i--) if (this.records[i].root === root) this.records.splice(i, 1);
  }
}

export const operations = new OperationCoordinator();

export async function withOperation<T>(
  root: string,
  operation: string,
  fn: (session: OperationSession) => Promise<T>,
): Promise<T> {
  const session = operations.start(root, operation);
  try {
    const value = await fn(session);
    operations.finish(session, 'success');
    return value;
  } catch (error) {
    operations.finish(session, 'error');
    throw error;
  }
}
