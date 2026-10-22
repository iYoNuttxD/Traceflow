import { open, lstat, realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { requireCondition as check } from './oci-compatibility-safety.js';

const MAX_BYTES = 16384;
const MAX_AGE_MS = 600000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const PACKAGE = /^traceflow-prisma-diagnostic-[a-f0-9]{16}$/;
const BASE = '/etc/traceflow/diagnostic-evidence';
const INVALID = 'ROLE_ATTESTATION_INVALID';

function exact(value, keys, code = INVALID) {
  check(value && typeof value === 'object' && !Array.isArray(value), code);
  const names = Reflect.ownKeys(value);
  check(names.length === keys.length && names.every((key) => keys.includes(key)), code);
  check(
    keys.every((key) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')),
    code
  );
}
function matches(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}
function uuid(value) {
  return matches(UUID, value);
}
function hash(value) {
  return matches(HASH, value);
}
function utc(value) {
  check(
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
    INVALID
  );
  const time = Date.parse(value);
  check(Number.isFinite(time) && new Date(time).toISOString() === value, INVALID);
  return time;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// JSON.parse alone silently accepts duplicate members. Reject them before interpreting
// a security document; no revivers, object coercions or prototype setters are invoked.
export function parseRoleAttestationJson(text) {
  check(typeof text === 'string' && Buffer.byteLength(text) <= MAX_BYTES, INVALID);
  let pos = 0;
  const ws = () => {
    while (/[ \t\r\n]/.test(text[pos] || '\0')) pos++;
  };
  const string = () => {
    const match = /^"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(text.slice(pos));
    check(match && ![...match[0]].some((char) => char.charCodeAt(0) < 32), INVALID);
    pos += match[0].length;
    return JSON.parse(match[0]);
  };
  const value = (depth) => {
    check(depth <= 12, INVALID);
    ws();
    if (text[pos] === '"') return string();
    if (text[pos] === '{' || text[pos] === '[') {
      const object = text[pos++] === '{';
      const end = object ? '}' : ']';
      const result = object ? Object.create(null) : [];
      const seen = new Set();
      ws();
      if (text[pos] === end) {
        pos++;
        return result;
      }
      for (;;) {
        ws();
        let key;
        if (object) {
          key = string();
          check(!seen.has(key), INVALID);
          seen.add(key);
          ws();
          check(text[pos++] === ':', INVALID);
        }
        const entry = value(depth + 1);
        if (object) result[key] = entry;
        else result.push(entry);
        ws();
        const next = text[pos++];
        if (next === end) return result;
        check(next === ',', INVALID);
      }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(pos)
    );
    check(match, INVALID);
    pos += match[0].length;
    return JSON.parse(match[0]);
  };
  const result = value(0);
  ws();
  check(pos === text.length, INVALID);
  return result;
}

export function roleAttestationReference(authorization) {
  const ref = authorization?.roleAttestation;
  exact(
    ref,
    ['formatVersion', 'evidenceId', 'sha256', 'executionId', 'packageId', 'manifestSha256'],
    'ROLE_ATTESTATION_REQUIRED'
  );
  check(
    ref.formatVersion === 1 &&
      uuid(ref.evidenceId) &&
      uuid(ref.executionId) &&
      ref.evidenceId !== ref.executionId &&
      hash(ref.sha256) &&
      hash(ref.manifestSha256) &&
      matches(PACKAGE, ref.packageId),
    INVALID
  );
  return ref;
}

export function validateRoleAttestationTime(evidence, authorization, now = Date.now()) {
  const collected = utc(evidence.collectedAt);
  const expires = utc(evidence.expiresAt);
  const authorizedUntil = utc(authorization.expiresAt);
  check(
    Number.isFinite(now) &&
      collected <= now &&
      now < expires &&
      expires > collected &&
      expires - collected <= MAX_AGE_MS &&
      expires <= authorizedUntil,
    'ROLE_ATTESTATION_EXPIRED'
  );
}

export function validateRoleAttestation(evidence, authorization, binding, now = Date.now()) {
  const ref = roleAttestationReference(authorization);
  exact(evidence, [
    'formatVersion',
    'kind',
    'evidenceId',
    'collectedAt',
    'expiresAt',
    'executionId',
    'operatorId',
    'mode',
    'source',
    'target',
    'role',
    'observations',
    'grantsAudit',
    'package'
  ]);
  check(
    evidence.formatVersion === 1 &&
      evidence.kind === 'mysql-role-existence-attestation' &&
      evidence.evidenceId === ref.evidenceId &&
      evidence.executionId === ref.executionId &&
      matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, evidence.operatorId),
    INVALID
  );
  check(
    ['oci-read-only', 'local-isolated'].includes(evidence.mode) &&
      evidence.mode === authorization.mode &&
      evidence.source ===
        (evidence.mode === 'oci-read-only' ? 'administrative-read-only' : 'synthetic-lab'),
    'ROLE_ATTESTATION_SOURCE'
  );
  exact(evidence.package, ['packageId', 'manifestSha256']);
  exact(binding, ['packageId', 'manifestSha256']);
  check(
    evidence.package.packageId === ref.packageId &&
      evidence.package.manifestSha256 === ref.manifestSha256 &&
      binding.packageId === ref.packageId &&
      binding.manifestSha256 === ref.manifestSha256,
    'ROLE_ATTESTATION_PACKAGE_MISMATCH'
  );
  const targetKeys = [
    'serverUuid',
    'version',
    'host',
    'expectedAddress',
    'port',
    'caSha256',
    'schema',
    'account'
  ];
  exact(evidence.target, targetKeys);
  check(
    authorization.target &&
      targetKeys.every(
        (key) =>
          Object.hasOwn(authorization.target, key) &&
          evidence.target[key] === authorization.target[key]
      ),
    'ROLE_ATTESTATION_TARGET_MISMATCH'
  );
  check(
    matches(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, evidence.target.serverUuid) &&
      matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-cloud)?$/, evidence.target.version) &&
      hash(evidence.target.caSha256) &&
      evidence.target.account === authorization.target.user + '@10.20.1.184',
    'ROLE_ATTESTATION_TARGET_MISMATCH'
  );
  if (evidence.mode === 'oci-read-only') {
    check(
      evidence.target.host === 'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com' &&
        evidence.target.expectedAddress === '10.20.2.25' &&
        evidence.target.port === 3306 &&
        evidence.target.schema === 'traceflow' &&
        evidence.target.account === 'traceflow_diag@10.20.1.184' &&
        evidence.target.version === '26.7.0-cloud',
      'ROLE_ATTESTATION_TARGET_MISMATCH'
    );
  }
  exact(evidence.role, ['name', 'host']);
  check(evidence.role.name === 'public' && evidence.role.host === '%', INVALID);
  exact(evidence.observations, ['mandatoryRoles', 'activateAllRolesOnLogin', 'existence']);
  check(
    evidence.observations.mandatoryRoles === 'public' &&
      evidence.observations.activateAllRolesOnLogin === 0,
    INVALID
  );
  exact(evidence.observations.existence, ['queryId', 'status', 'accountCount']);
  const observation = evidence.observations.existence;
  check(
    observation.queryId === 'MYSQL_USER_PUBLIC_COUNT_V1' &&
      observation.status === 'SUCCESS' &&
      Number.isSafeInteger(observation.accountCount) &&
      observation.accountCount >= 0,
    INVALID
  );
  exact(evidence.grantsAudit, [
    'referenceId',
    'sha256',
    'status',
    'account',
    'schema',
    'privileges',
    'explicitRoleCount'
  ]);
  check(
    uuid(evidence.grantsAudit.referenceId) &&
      hash(evidence.grantsAudit.sha256) &&
      evidence.grantsAudit.status === 'PASS' &&
      evidence.grantsAudit.account === evidence.target.account &&
      evidence.grantsAudit.schema === evidence.target.schema &&
      Array.isArray(evidence.grantsAudit.privileges) &&
      evidence.grantsAudit.privileges.length === 1 &&
      evidence.grantsAudit.privileges[0] === 'SELECT' &&
      evidence.grantsAudit.explicitRoleCount === 0,
    INVALID
  );
  validateRoleAttestationTime(evidence, authorization, now);
  return freeze(evidence);
}

export function attestedRoleState(evidence) {
  // Only objects returned by the validated, closed contract belong at this boundary.
  if (!evidence || evidence.observations?.existence?.status !== 'SUCCESS') return 'UNKNOWN';
  const count = evidence.observations.existence.accountCount;
  return Number.isSafeInteger(count) && count >= 0
    ? count === 0
      ? 'ABSENT'
      : 'PRESENT'
    : 'UNKNOWN';
}

export function requireAbsentRole(evidence) {
  const state = attestedRoleState(evidence);
  check(state !== 'UNKNOWN', 'ROLE_EXISTENCE_UNKNOWN');
  check(state === 'ABSENT', 'ROLE_PRESENT_UNVERIFIED');
}

function fingerprint(st) {
  return [st.dev, st.ino, st.mode, st.uid, st.gid, st.nlink, st.size, st.mtimeMs, st.ctimeMs].join(
    ':'
  );
}
async function protectedParents(path) {
  const parents = [];
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const st = await lstat(parent);
    check(
      st.isDirectory() && !st.isSymbolicLink() && st.uid === 0 && !(st.mode & 0o022),
      'ROLE_ATTESTATION_UNTRUSTED_FILE'
    );
    parents.push([parent, fingerprint(st)]);
    if (parent === dirname(parent)) return parents;
  }
}

// No arbitrary path comes from authorization. Root custody is an OS trust boundary,
// not a claim authenticated by the checksum. No writes, chmod, chown or secret reads.
export async function readCustodied(path, maxBytes) {
  check(process.getuid() !== 0 && process.platform === 'linux', 'ROLE_ATTESTATION_EXECUTOR');
  check(
    path === resolve(path) && (await realpath(path)) === path,
    'ROLE_ATTESTATION_UNTRUSTED_FILE'
  );
  const parents = await protectedParents(path);
  const before = await lstat(path);
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.uid === 0 &&
      before.nlink === 1 &&
      [0o400, 0o440, 0o600, 0o640].includes(before.mode & 0o7777) &&
      before.size > 0 &&
      before.size <= maxBytes,
    'ROLE_ATTESTATION_UNTRUSTED_FILE'
  );
  let writable = false;
  try {
    await access(path, constants.W_OK);
    writable = true;
  } catch (error) {
    check(['EACCES', 'EPERM', 'EROFS'].includes(error.code), 'ROLE_ATTESTATION_UNTRUSTED_FILE');
  }
  check(!writable, 'ROLE_ATTESTATION_UNTRUSTED_FILE');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    check(fingerprint(before) === fingerprint(await file.stat()), 'ROLE_ATTESTATION_FILE_CHANGED');
    const bytes = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    check(
      bytesRead === before.size &&
        bytesRead <= maxBytes &&
        fingerprint(before) === fingerprint(await file.stat()) &&
        fingerprint(before) === fingerprint(await lstat(path)),
      'ROLE_ATTESTATION_FILE_CHANGED'
    );
    for (const [parent, previous] of parents)
      check(fingerprint(await lstat(parent)) === previous, 'ROLE_ATTESTATION_FILE_CHANGED');
    check((await realpath(path)) === path, 'ROLE_ATTESTATION_FILE_CHANGED');
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function loadRoleAttestation(authorization, packageRoot) {
  const ref = roleAttestationReference(authorization);
  // Fixed operational locations; an executor-owned directory cannot replace an ancestor.
  check(
    packageRoot === '/opt/traceflow-diagnostics/' + ref.packageId,
    'ROLE_ATTESTATION_PACKAGE_MISMATCH'
  );
  const evidenceBytes = await readCustodied(BASE + '/' + ref.evidenceId + '.json', MAX_BYTES);
  check(
    createHash('sha256').update(evidenceBytes).digest('hex') === ref.sha256,
    'ROLE_ATTESTATION_HASH_MISMATCH'
  );
  // Manifest files in an installed diagnostic are public 0644, unlike an attestation.
  // protectedFile's root check is insufficient for the stricter evidence ancestors.
  const manifestPath = packageRoot + '/manifest.json';
  check((await realpath(manifestPath)) === manifestPath, 'ROLE_ATTESTATION_PACKAGE_MISMATCH');
  const parents = await protectedParents(manifestPath);
  const file = await open(
    manifestPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  let manifestBytes;
  try {
    const st = await file.stat();
    check(
      st.isFile() &&
        st.uid === 0 &&
        st.nlink === 1 &&
        !(st.mode & 0o022) &&
        st.size > 0 &&
        st.size <= 1024 * 1024,
      'ROLE_ATTESTATION_PACKAGE_MISMATCH'
    );
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    check(
      bytesRead === st.size &&
        fingerprint(st) === fingerprint(await file.stat()) &&
        fingerprint(st) === fingerprint(await lstat(manifestPath)),
      'ROLE_ATTESTATION_FILE_CHANGED'
    );
    for (const [parent, previous] of parents)
      check(fingerprint(await lstat(parent)) === previous, 'ROLE_ATTESTATION_FILE_CHANGED');
    manifestBytes = buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  check(manifestSha256 === ref.manifestSha256, 'ROLE_ATTESTATION_PACKAGE_MISMATCH');
  let manifest, evidence;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    evidence = parseRoleAttestationJson(
      new TextDecoder('utf-8', { fatal: true }).decode(evidenceBytes)
    );
  } catch {
    check(false, INVALID);
  }
  return validateRoleAttestation(evidence, authorization, {
    packageId: manifest.packageId,
    manifestSha256
  });
}

export function validateAbsentSession(evidence, authorization, identity, parameters) {
  requireAbsentRole(evidence);
  validateRoleAttestationTime(evidence, authorization);
  check(
    identity.currentUser === evidence.target.account &&
      identity.uuid === evidence.target.serverUuid &&
      identity.version === evidence.target.version &&
      identity.db === evidence.target.schema &&
      Number(identity.port) === evidence.target.port,
    'ROLE_ATTESTATION_SESSION_MISMATCH'
  );
  check(
    parameters.mandatoryRoles === evidence.observations.mandatoryRoles &&
      parameters.activeRoles === 'NONE',
    'ROLE_ATTESTATION_SESSION_MISMATCH'
  );
}

export function validateAbsentInventory(rows) {
  check(Array.isArray(rows), 'MALFORMED_ROLE_GRAPH');
  check(rows.length === 0, 'ROLE_ATTESTATION_SESSION_MISMATCH');
  // This confirms only the shape, never the completeness of the MySQL result.
}

export function requireVerifiableRoleWarnings() {
  // Deliberate release blocker: no caller flag/evidence field/mock result can enable
  // PASS. SHOW COUNT(*) WARNINGS and @@warning_count are not preparable. SHOW WARNINGS
  // alone cannot prove count/completeness or association across Prisma's preparation.
  check(false, 'ROLE_WARNINGS_UNVERIFIED');
}
