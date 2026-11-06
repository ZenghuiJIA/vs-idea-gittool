export type RemoteProviderKind = 'github' | 'gitlab' | 'unknown';

export interface RemoteProvider {
  kind: RemoteProviderKind;
  host: string;
  owner?: string;
  repository?: string;
  commitUrl(hash: string): string | undefined;
  branchUrl(branch: string): string | undefined;
  fileUrl(path: string, ref?: string): string | undefined;
}

export function parseRemoteProvider(url: string): RemoteProvider {
  const normalized = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const ssh = /^(?:git@|ssh:\/\/git@)([^:]+)[:/]([^/]+)\/(.+)$/.exec(normalized);
  const http = /^(?:https?|git):\/\/([^/]+)\/(.+)$/.exec(normalized);
  const host = ssh?.[1] ?? http?.[1] ?? '';
  const path = ssh?.[2] && ssh?.[3] ? `${ssh[2]}/${ssh[3]}` : http?.[2] ?? '';
  const [owner, repository] = path.split('/');
  const kind: RemoteProviderKind = /github/i.test(host) ? 'github' : /gitlab/i.test(host) ? 'gitlab' : 'unknown';
  const base = host && owner && repository ? `https://${host}/${owner}/${repository}` : undefined;
  return {
    kind, host, owner, repository,
    commitUrl: hash => base ? `${base}/commit/${encodeURIComponent(hash)}` : undefined,
    branchUrl: branch => base ? `${base}/tree/${encodeURIComponent(branch)}` : undefined,
    fileUrl: (file, ref = 'HEAD') => base ? `${base}/blob/${encodeURIComponent(ref)}/${file.replaceAll(String.fromCharCode(92), '/')}` : undefined,
  };
}

export function providerForRemote(remoteUrl: string): RemoteProvider | undefined {
  const provider = parseRemoteProvider(remoteUrl);
  return provider.kind === 'unknown' ? undefined : provider;
}
