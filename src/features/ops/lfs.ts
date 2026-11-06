import { Repository } from '../../git/repository';

export interface LfsStatus {
  installed: boolean;
  version?: string;
  files: Array<{ path: string; status: string }>;
  locks: Array<{ id: string; path: string; owner: string }>;
}

export async function lfsStatus(repo: Repository): Promise<LfsStatus> {
  const version = await repo.exec(['lfs', 'version'], { allowFailure: true, quiet: true });
  if (version.exitCode !== 0) return { installed: false, files: [], locks: [] };
  const status = await repo.exec(['lfs', 'status'], { allowFailure: true, quiet: true });
  const files = status.stdout.split(/\r?\n/).filter(Boolean).map(line => ({ path: line.replace(/^\s*[A-Z?]+\s+/, '').trim(), status: line.trim().split(/\s+/, 1)[0] }));
  const locksResult = await repo.exec(['lfs', 'locks', '--json'], { allowFailure: true, quiet: true });
  let locks: LfsStatus['locks'] = [];
  try { locks = JSON.parse(locksResult.stdout).locks ?? []; } catch { /* older Git LFS has no JSON output */ }
  return { installed: true, version: version.stdout.trim(), files, locks };
}
