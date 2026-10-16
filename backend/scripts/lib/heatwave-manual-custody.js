import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonical, digest, exact } from './heatwave-admin-audit.js';
import { EVIDENCE_BASE, time } from './heatwave-audit-evidence.js';
import { parseRoleAttestationJson } from './heatwave-role-attestation.js';
import { requireCondition as check } from './oci-compatibility-safety.js';

export const INPUT_BASE = '/etc/traceflow/diagnostic-inputs';
export const OPERATIONS = Object.freeze([
  'collect-initial',
  'capture-prisma',
  'collect-final',
  'verify-offline'
]);
export const STAGE_BY_OPERATION = Object.freeze({
  'collect-initial': 'ADMIN_INITIAL',
  'capture-prisma': 'PRISMA',
  'collect-final': 'ADMIN_FINAL',
  'verify-offline': 'CONSOLIDATED'
});
export const validId = (s) =>
  typeof s === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(s)?.[0] === s;
const fingerprint = (s) =>
  [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs].join(':');

// Administrative reader only. The non-root readCustodied contract is unchanged.
// No public flag changes ownership rules, paths, limits, or the OS trust boundary.
export class ManualCustody {
  constructor(groupId, io = fs) {
    check(Number.isSafeInteger(groupId) && groupId > 0, 'AUDIT_SERVICE_GROUP_INVALID');
    this.gid = groupId;
    this.io = io;
  }
  async parents(path) {
    check(
      typeof path === 'string' && path === resolve(path) && path.startsWith('/'),
      'AUDIT_PATH_INVALID'
    );
    check((await this.io.realpath(path)) === path, 'AUDIT_PATH_UNSAFE');
    const snapshots = [];
    for (let parent = dirname(path); ; parent = dirname(parent)) {
      const st = await this.io.lstat(parent);
      check(
        st.isDirectory() && !st.isSymbolicLink() && st.uid === 0 && !(st.mode & 0o022),
        'AUDIT_PARENT_UNSAFE'
      );
      check((await this.io.realpath(parent)) === parent, 'AUDIT_PARENT_UNSAFE');
      snapshots.push([parent, st.dev, st.ino, st.mode, st.uid, st.gid]);
      if (parent === '/') break;
    }
    return snapshots;
  }
  async recheckParents(snapshots) {
    for (const [path, dev, ino, mode, uid, gid] of snapshots) {
      const st = await this.io.lstat(path);
      check(
        st.isDirectory() &&
          !st.isSymbolicLink() &&
          st.dev === dev &&
          st.ino === ino &&
          st.mode === mode &&
          st.uid === uid &&
          st.gid === gid &&
          (await this.io.realpath(path)) === path,
        'AUDIT_PARENT_CHANGED'
      );
    }
  }
  async openProtected(path, { uid = 0, modes = [0o400, 0o600], maxBytes = 16384 } = {}) {
    const parents = await this.parents(path);
    const before = await this.io.lstat(path);
    check(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.uid === uid &&
        before.nlink === 1 &&
        modes.includes(before.mode & 0o7777) &&
        before.size > 0 &&
        before.size <= maxBytes,
      'AUDIT_FILE_UNSAFE'
    );
    const file = await this.io.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      check(fingerprint(before) === fingerprint(await file.stat()), 'AUDIT_FILE_CHANGED');
      const bytes = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      check(bytesRead === before.size && bytesRead <= maxBytes, 'AUDIT_FILE_CHANGED');
      const recheck = async () => {
        check(
          fingerprint(before) === fingerprint(await file.stat()) &&
            fingerprint(before) === fingerprint(await this.io.lstat(path)) &&
            (await this.io.realpath(path)) === path,
          'AUDIT_FILE_CHANGED'
        );
        await this.recheckParents(parents);
      };
      await recheck();
      return { bytes: bytes.subarray(0, bytesRead), file, recheck, close: () => file.close() };
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  async json(path, modes = [0o400, 0o440, 0o600, 0o640]) {
    const opened = await this.openProtected(path, { modes });
    try {
      return parseRoleAttestationJson(
        new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes)
      );
    } finally {
      await opened.close();
    }
  }
  async program(path, executable = true) {
    // System-managed symlinks (e.g. python3 -> python3.9) are permitted only
    // here, never for evidence/credentials. Both path parents and target are trusted.
    check(path === resolve(path) && path.startsWith('/'), 'AUDIT_PROGRAM_UNSAFE');
    await this.parents(dirname(path));
    const parent = await this.io.lstat(dirname(path));
    const source = await this.io.lstat(path);
    check(
      parent.isDirectory() && parent.uid === 0 && !(parent.mode & 0o022) && source.uid === 0,
      'AUDIT_PROGRAM_UNSAFE'
    );
    const target = await this.io.realpath(path);
    const parents = await this.parents(target);
    const st = await this.io.lstat(target);
    check(
      st.isFile() &&
        !st.isSymbolicLink() &&
        st.uid === 0 &&
        st.nlink === 1 &&
        !(st.mode & 0o022) &&
        (!executable || st.mode & 0o111),
      'AUDIT_PROGRAM_UNSAFE'
    );
    const handle = await this.io.open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      check(
        fingerprint(st) === fingerprint(await handle.stat()) &&
          fingerprint(st) === fingerprint(await this.io.lstat(target)) &&
          fingerprint(source) === fingerprint(await this.io.lstat(path)) &&
          (await this.io.realpath(path)) === target,
        'AUDIT_PROGRAM_CHANGED'
      );
      await this.recheckParents(parents);
    } finally {
      await handle.close();
    }
    return target;
  }
  async directory(path, exclusive = false) {
    if (exclusive) await this.io.mkdir(path, { mode: 0o700 });
    const parents = await this.parents(path);
    const st = await this.io.lstat(path);
    check(
      st.isDirectory() &&
        !st.isSymbolicLink() &&
        st.uid === 0 &&
        [0o700, 0o750].includes(st.mode & 0o7777),
      'AUDIT_DIRECTORY_UNSAFE'
    );
    await this.recheckParents(parents);
  }
  async publish(path, value, { uid = 0, gid = this.gid, mode = 0o440 } = {}) {
    const bytes = Buffer.from(canonical(value) + '\n');
    check(bytes.length <= 16384, 'AUDIT_DOCUMENT_LIMIT');
    check(
      [EVIDENCE_BASE + '/', INPUT_BASE + '/'].some((p) => path.startsWith(p)) &&
        resolve(path) === path,
      'AUDIT_PATH_INVALID'
    );
    // Parent directories must already be administratively provisioned/protected.
    await this.directory(dirname(path));
    const parents = await this.parents(dirname(path));
    const parentBefore = await this.io.lstat(dirname(path));
    parents.unshift([
      dirname(path),
      parentBefore.dev,
      parentBefore.ino,
      parentBefore.mode,
      parentBefore.uid,
      parentBefore.gid
    ]);
    const file = await this.io.open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    );
    try {
      const first = await file.stat();
      check(first.isFile() && first.uid === 0 && first.nlink === 1, 'AUDIT_FILE_UNSAFE');
      await file.writeFile(bytes);
      await file.chown(uid, gid);
      await file.chmod(mode);
      await file.sync();
      check(
        fingerprint(await file.stat()) === fingerprint(await this.io.lstat(path)),
        'AUDIT_FILE_CHANGED'
      );
      await this.recheckParents(parents);
    } finally {
      await file.close();
    }
    const parent = await this.io.open(
      dirname(path),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    // No replacement/cleanup on error. A partial publication poisons the attempt.
  }
}

export function validateReceipt(
  receipt,
  attempt,
  document,
  authorization,
  operation,
  previous = null
) {
  exact(attempt, [
    'formatVersion',
    'operation',
    'runId',
    'authorizationId',
    'package',
    'startedAt',
    'previousReceiptSha256'
  ]);
  exact(receipt, [
    'formatVersion',
    'operation',
    'runId',
    'authorizationId',
    'package',
    'attemptSha256',
    'documentSha256',
    'previousReceiptSha256'
  ]);
  const a = authorization.administrativeAudit;
  const expectedPrevious = previous === null ? null : digest(previous);
  check(
    attempt.formatVersion === 1 &&
      receipt.formatVersion === 1 &&
      attempt.operation === operation &&
      receipt.operation === operation &&
      attempt.runId === a.runId &&
      receipt.runId === a.runId &&
      attempt.authorizationId === a.authorizationId &&
      receipt.authorizationId === a.authorizationId &&
      canonical(attempt.package) === canonical(a.package) &&
      canonical(receipt.package) === canonical(a.package) &&
      time(attempt.startedAt) >= time(a.window.openedAt) &&
      time(attempt.startedAt) <= time(document.startedAt) &&
      time(document.completedAt) - time(attempt.startedAt) <= 45000 &&
      attempt.previousReceiptSha256 === expectedPrevious &&
      receipt.previousReceiptSha256 === expectedPrevious &&
      receipt.attemptSha256 === digest(attempt) &&
      receipt.documentSha256 === digest(document),
    'AUDIT_RECEIPT_INVALID'
  );
}
