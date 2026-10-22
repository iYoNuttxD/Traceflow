import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { requireCondition as check } from './oci-compatibility-safety.js';

// W02-D D01/D02: exact binaries exercised with fd 3, runuser, process groups
// and protected publication. A system update requires a reviewed new profile;
// no authorization field, environment variable or CLI switch widens this set.
export const ADMIN_RUNTIME_PROFILE = 'w02d-oracle98-arm64-20261016';
export const ADMIN_RUNTIME_BINARIES = Object.freeze({
  '/usr/bin/node-22': '70c5311d18f5eb533861e906068a1d1ecf2bf75422e7297bbb5bb1e39f830845',
  '/usr/bin/mysql': 'e75c4c3e186787a8139a11a9a911a5a20c598f4d97aabefecf8df0aa631b0f08',
  '/usr/sbin/runuser': '47a3d80077e877734f3fc9c6949e48c3608083efdae07fc32dcb5e3c8ccb108f'
});
const refused = 'ADMIN_COLLECTION_RUNTIME_UNVERIFIED';
const context = 'unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023';

function supportedHost(host) {
  check(
    host.platform === 'linux' &&
      host.arch === 'arm64' &&
      host.versions.node === '22.23.2' &&
      /^3\./.test(host.versions.openssl) &&
      host.execPath === '/usr/bin/node-22',
    refused
  );
}
export function validateAdministrativeRuntime(facts) {
  check(
    facts &&
      Object.keys(facts).sort().join(',') ===
        'arch,binaries,context,execPath,node,openssl,platform,release,selinux',
    refused
  );
  supportedHost({ ...facts, versions: { node: facts.node, openssl: facts.openssl } });
  check(
    facts.release === 'Oracle Linux Server release 9.8' &&
      facts.selinux === '1' &&
      facts.context === context,
    refused
  );
  check(
    facts.binaries &&
      Object.keys(facts.binaries).sort().join(',') ===
        Object.keys(ADMIN_RUNTIME_BINARIES).sort().join(','),
    refused
  );
  for (const [path, hash] of Object.entries(ADMIN_RUNTIME_BINARIES))
    check(facts.binaries[path] === hash, refused);
  return ADMIN_RUNTIME_PROFILE;
}

// Fixed kernel paths only, bounded read; no external process or connection.
async function readKernel(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(2049);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    check(bytesRead > 0 && bytesRead <= 2048, refused);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
// Dependency injection is internal to tests; the operational entrypoint below
// supplies the real process/filesystem and accepts no caller-provided facts.
export async function inspectAdministrativeRuntime(host, custody, kernel = readKernel) {
  supportedHost(host);
  const facts = {
    platform: host.platform,
    arch: host.arch,
    execPath: host.execPath,
    node: host.versions.node,
    openssl: host.versions.openssl,
    binaries: {}
  };
  for (const path of Object.keys(ADMIN_RUNTIME_BINARIES)) {
    check((await custody.program(path)) === path, refused);
    const file = await custody.openProtected(path, {
      modes: [0o555, 0o755],
      maxBytes: 128 * 1024 * 1024
    });
    try {
      facts.binaries[path] = createHash('sha256').update(file.bytes).digest('hex');
      await file.recheck();
    } finally {
      await file.close();
    }
  }
  const release = await custody.openProtected('/etc/oracle-release', {
    modes: [0o444, 0o644],
    maxBytes: 256
  });
  try {
    facts.release = new TextDecoder('utf-8', { fatal: true }).decode(release.bytes).trim();
    await release.recheck();
  } finally {
    await release.close();
  }
  facts.selinux = (await kernel('/sys/fs/selinux/enforce')).trim();
  facts.context = (await kernel('/proc/self/attr/current')).replace(/\0$/, '').trim();
  return facts;
}

export async function requireValidatedAdministrativeRuntime() {
  try {
    supportedHost(process); // Before opening files on an unsupported host.
    // Deferred to avoid a module initialization cycle with the evidence reader.
    const { ManualCustody } = await import('./heatwave-manual-custody.js');
    return validateAdministrativeRuntime(
      await inspectAdministrativeRuntime(process, new ManualCustody(1))
    );
  } catch {
    // Do not expose paths, process context or raw operating system errors.
    check(false, refused);
  }
}
