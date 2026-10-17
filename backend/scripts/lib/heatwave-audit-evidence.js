import { randomUUID } from 'node:crypto';
import { requireValidatedAdministrativeRuntime } from './heatwave-administrative-runtime.js';
export { requireValidatedAdministrativeRuntime } from './heatwave-administrative-runtime.js';
import {
  exact,
  canonical,
  digest,
  byteHash,
  validateAdministrativeObservations,
  PLAN_SHA256,
  encodeAdministrativeObservations,
  decodeAdministrativeObservations
} from './heatwave-admin-audit.js';
import { parseRoleAttestationJson, readCustodied } from './heatwave-role-attestation.js';
import { protectedFile } from './heatwave-connection.js';
import { requireCondition as check } from './oci-compatibility-safety.js';

export const EVIDENCE_BASE = '/etc/traceflow/diagnostic-evidence';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const PACKAGE = /^traceflow-prisma-diagnostic-[a-f0-9]{16}$/;
export const stages = Object.freeze(['ADMIN_INITIAL', 'PRISMA', 'ADMIN_FINAL', 'CONSOLIDATED']);
const matches = (re, v) => typeof v === 'string' && re.exec(v)?.[0] === v;
export function time(value) {
  check(
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
    'AUDIT_TIME_INVALID'
  );
  const number = Date.parse(value);
  check(Number.isFinite(number) && new Date(number).toISOString() === value, 'AUDIT_TIME_INVALID');
  return number;
}
export function validateAuditAuthorization(auth, binding, now = Date.now(), preparing = false) {
  exact(auth, [
    'formatVersion',
    'operation',
    'mode',
    'approved',
    'role',
    'expiresAt',
    'target',
    'administrativeAudit'
  ]);
  check(
    auth.formatVersion === 1 &&
      auth.operation === 'diagnose-read-only' &&
      auth.mode === 'oci-read-only' &&
      auth.approved === true &&
      auth.role === 'diagnostic',
    'AUDIT_AUTHORIZATION_INVALID'
  );
  exact(auth.target, [
    'serverUuid',
    'version',
    'host',
    'expectedAddress',
    'port',
    'caSha256',
    'schema',
    'account',
    'user'
  ]);
  const t = auth.target;
  check(
    t.serverUuid === '6e94bb7f-c601-11f1-9b91-02001704771f' &&
      t.version === '26.7.0-cloud' &&
      t.host === 'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com' &&
      t.expectedAddress === '10.20.2.25' &&
      t.port === 3306 &&
      t.schema === 'traceflow' &&
      t.user === 'traceflow_diag' &&
      t.account === 'traceflow_diag@10.20.1.184' &&
      matches(HASH, t.caSha256),
    'AUDIT_TARGET_MISMATCH'
  );
  const a = auth.administrativeAudit;
  exact(a, [
    'formatVersion',
    'authorizationId',
    'runId',
    'package',
    'evidenceIds',
    'initialSha256',
    'window'
  ]);
  exact(a.package, ['packageId', 'manifestSha256']);
  exact(binding, ['packageId', 'manifestSha256']);
  check(
    a.formatVersion === 2 &&
      matches(UUID, a.authorizationId) &&
      matches(UUID, a.runId) &&
      matches(PACKAGE, a.package.packageId) &&
      matches(HASH, a.package.manifestSha256) &&
      canonical(a.package) === canonical(binding),
    'AUDIT_BINDING_INVALID'
  );
  exact(a.evidenceIds, stages);
  const ids = [a.authorizationId, a.runId, ...Object.values(a.evidenceIds)];
  check(
    ids.every((id) => matches(UUID, id)) && new Set(ids).size === ids.length,
    'AUDIT_IDS_INVALID'
  );
  check(
    matches(HASH, a.initialSha256) || (preparing && a.initialSha256 === null),
    'ADMIN_INITIAL_REFERENCE_REQUIRED'
  );
  exact(a.window, [
    'operatorId',
    'openedAt',
    'expiresAt',
    'policy',
    'riskAcceptanceId',
    'acceptedAt',
    'noPrivilegeChangesAuthorized',
    'noKnownAutomation',
    'accountLifecycle'
  ]);
  const w = a.window;
  check(
    matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, w.operatorId) &&
      matches(UUID, w.riskAcceptanceId) &&
      !ids.includes(w.riskAcceptanceId) &&
      w.policy === 'operator-controlled-v1' &&
      w.noPrivilegeChangesAuthorized === true &&
      w.noKnownAutomation === true &&
      w.accountLifecycle === 'diagnostic-unlock-lock-only',
    'OPERATIONAL_POLICY_NOT_APPROVED'
  );
  const opened = time(w.openedAt),
    expiry = time(w.expiresAt);
  check(
    time(w.acceptedAt) <= opened &&
      opened <= now &&
      now < expiry &&
      expiry > opened &&
      expiry - opened <= 600000 &&
      auth.expiresAt === w.expiresAt,
    'AUDIT_WINDOW_EXPIRED'
  );
  return a;
}
function common(doc, auth, stage, binding, now) {
  const a = validateAuditAuthorization(auth, binding, now);
  exact(doc, [
    'formatVersion',
    'evidenceId',
    'runId',
    'authorizationId',
    'stage',
    'startedAt',
    'completedAt',
    'expiresAt',
    'target',
    'package',
    'previous',
    'producer',
    'status',
    'final',
    'writes',
    'payload'
  ]);
  check(
    doc.formatVersion === 2 &&
      doc.stage === stage &&
      doc.evidenceId === a.evidenceIds[stage] &&
      doc.runId === a.runId &&
      doc.authorizationId === a.authorizationId &&
      canonical(doc.target) === canonical(auth.target) &&
      canonical(doc.package) === canonical(binding) &&
      doc.expiresAt === auth.expiresAt &&
      doc.writes === false &&
      doc.final === (stage === 'CONSOLIDATED'),
    'AUDIT_BINDING_INVALID'
  );
  check(
    time(doc.startedAt) >= time(a.window.openedAt) &&
      time(doc.completedAt) >= time(doc.startedAt) &&
      time(doc.completedAt) <= now &&
      time(doc.completedAt) < time(doc.expiresAt),
    'AUDIT_TIME_INVALID'
  );
  check(time(doc.completedAt) - time(doc.startedAt) <= 35000, 'AUDIT_STAGE_TIMEOUT');
  return a;
}
export function reference(doc) {
  return { evidenceId: doc.evidenceId, sha256: digest(doc) };
}
function link(doc, previous) {
  if (previous === null) check(doc.previous === null, 'AUDIT_CHAIN_INVALID');
  else {
    exact(doc.previous, ['evidenceId', 'sha256']);
    check(canonical(doc.previous) === canonical(reference(previous)), 'AUDIT_CHAIN_INVALID');
    check(
      time(previous.completedAt) <= time(doc.startedAt) &&
        time(doc.startedAt) - time(previous.completedAt) <= 60000,
      'AUDIT_STAGE_GAP'
    );
  }
}
export function envelope(
  auth,
  stage,
  payload,
  previous,
  startedAt,
  completedAt = new Date().toISOString()
) {
  const a = auth.administrativeAudit;
  return {
    formatVersion: 2,
    evidenceId: a.evidenceIds[stage],
    runId: a.runId,
    authorizationId: a.authorizationId,
    stage,
    startedAt,
    completedAt,
    expiresAt: auth.expiresAt,
    target: { ...auth.target },
    package: { ...a.package },
    previous: previous === null ? null : reference(previous),
    producer:
      stage === 'PRISMA'
        ? 'traceflow-prisma-6.12-v2'
        : stage === 'CONSOLIDATED'
          ? 'traceflow-audit-finalizer-v2'
          : 'traceflow-mysql-text-v2',
    status:
      stage === 'PRISMA' ? 'PRISMA_VERIFIED' : stage === 'CONSOLIDATED' ? 'PASS' : 'ADMIN_VERIFIED',
    final: stage === 'CONSOLIDATED',
    writes: false,
    payload
  };
}
export function validateAdministrativeEvidence(
  doc,
  auth,
  stage,
  binding,
  previous = null,
  now = Date.now()
) {
  check(['ADMIN_INITIAL', 'ADMIN_FINAL'].includes(stage), 'AUDIT_STAGE_INVALID');
  common(doc, auth, stage, binding, now);
  link(doc, previous);
  check(
    doc.producer === 'traceflow-mysql-text-v2' && doc.status === 'ADMIN_VERIFIED',
    'AUDIT_PRODUCER_INVALID'
  );
  exact(doc.payload, ['planSha256', 'collectionId', 'observations', 'stateSha256', 'window']);
  check(
    doc.payload.planSha256 === PLAN_SHA256 &&
      matches(UUID, doc.payload.collectionId) &&
      canonical(doc.payload.window) === canonical(auth.administrativeAudit.window),
    'ADMIN_COLLECTION_INVALID'
  );
  const verified = validateAdministrativeObservations(
    decodeAdministrativeObservations(doc.payload.observations),
    auth.target
  );
  check(doc.payload.stateSha256 === verified.stateSha256, 'ADMIN_STATE_MISMATCH');
  return verified;
}
export function validateClosure(closure, auth, completedAt, now = Date.now()) {
  exact(closure, [
    'formatVersion',
    'runId',
    'authorizationId',
    'operatorId',
    'confirmedAt',
    'noChangesReported',
    'noUnexpectedAutomationReported',
    'residualRiskAccepted'
  ]);
  const a = auth.administrativeAudit;
  check(
    closure.formatVersion === 2 &&
      closure.runId === a.runId &&
      closure.authorizationId === a.authorizationId &&
      closure.operatorId === a.window.operatorId &&
      closure.noChangesReported === true &&
      closure.noUnexpectedAutomationReported === true &&
      closure.residualRiskAccepted === true,
    'OPERATIONAL_CLOSURE_REQUIRED'
  );
  check(
    time(closure.confirmedAt) >= time(completedAt) &&
      time(closure.confirmedAt) <= now &&
      time(closure.confirmedAt) < time(auth.expiresAt),
    'AUDIT_CLOSURE_INVALID'
  );
}
export const PRISMA_CHECKS = Object.freeze([
  'tls',
  'ca',
  'hostname',
  'dns',
  'serverIdentity',
  'fullAccount',
  'schema',
  'roles',
  'directGrants',
  'selectOne',
  'finalConsistency'
]);
export function validatePrismaEvidence(doc, auth, binding, initial, now = Date.now()) {
  common(doc, auth, 'PRISMA', binding, now);
  link(doc, initial);
  check(
    doc.producer === 'traceflow-prisma-6.12-v2' && doc.status === 'PRISMA_VERIFIED',
    'PRISMA_EVIDENCE_INVALID'
  );
  exact(doc.payload, ['prisma', 'connectionId', 'disconnected', 'checks', 'stateSha256']);
  check(
    doc.payload.prisma === '6.12.0' &&
      doc.payload.disconnected === true &&
      typeof doc.payload.connectionId === 'string' &&
      /^[1-9][0-9]{0,19}$/.test(doc.payload.connectionId) &&
      doc.payload.stateSha256 === initial.payload.stateSha256,
    'PRISMA_EVIDENCE_INVALID'
  );
  exact(doc.payload.checks, PRISMA_CHECKS);
  check(
    PRISMA_CHECKS.every((key) => doc.payload.checks[key] === true),
    'PRISMA_CHECKS_INCOMPLETE'
  );
}
export function consolidateEvidence(
  { initial, prisma, final, closure },
  auth,
  binding,
  now = Date.now()
) {
  validateAdministrativeEvidence(initial, auth, 'ADMIN_INITIAL', binding, null, now);
  check(digest(initial) === auth.administrativeAudit.initialSha256, 'ADMIN_INITIAL_HASH_MISMATCH');
  validatePrismaEvidence(prisma, auth, binding, initial, now);
  validateAdministrativeEvidence(final, auth, 'ADMIN_FINAL', binding, prisma, now);
  check(
    final.payload.collectionId !== initial.payload.collectionId &&
      final.payload.stateSha256 === initial.payload.stateSha256,
    'ADMIN_STATE_CHANGED'
  );
  validateClosure(closure, auth, final.completedAt, now);
  const stamp = new Date(now).toISOString();
  const consolidated = envelope(
    auth,
    'CONSOLIDATED',
    {
      technicalEvidenceVerified: true,
      privilegeProfile: 'ABSENT_SELECT_ONLY',
      operationalPolicy: 'operator-controlled-v1',
      operationalRiskAcceptanceId: auth.administrativeAudit.window.riskAcceptanceId,
      operationalClosure: closure,
      atomicSnapshot: false,
      continuousAudit: false,
      residualLimitation: 'TRANSIENT_ACL_CHANGES_NOT_AUTOMATICALLY_DETECTED',
      evidenceHashes: { initial: digest(initial), prisma: digest(prisma), final: digest(final) }
    },
    final,
    stamp,
    stamp
  );
  common(consolidated, auth, 'CONSOLIDATED', binding, now);
  link(consolidated, final);
  return consolidated;
}
export async function loadInitialAudit(auth, root) {
  // Recheck the exact W02-D runtime before credentials/connections and again
  // on final evidence validation. A claimed producer cannot bypass this gate.
  await requireValidatedAdministrativeRuntime();
  const a = auth.administrativeAudit;
  // Auth and evidence are independently root-custodied. The private authorization
  // copy passed to the existing launcher cannot change the approved window.
  validateAuditAuthorization(auth, a?.package);
  check(root === '/opt/traceflow-diagnostics/' + a.package.packageId, 'AUDIT_PACKAGE_MISMATCH');
  const approved = parseRoleAttestationJson(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await readCustodied(EVIDENCE_BASE + '/' + a.runId + '.authorization.json', 16384)
    )
  );
  check(canonical(approved) === canonical(auth), 'AUDIT_AUTHORIZATION_MISMATCH');
  const manifest = await protectedFile(root + '/manifest.json', { rootOwned: true });
  check(
    byteHash(manifest) === a.package.manifestSha256 &&
      JSON.parse(manifest).packageId === a.package.packageId,
    'AUDIT_PACKAGE_MISMATCH'
  );
  const initial = parseRoleAttestationJson(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await readCustodied(EVIDENCE_BASE + '/' + a.evidenceIds.ADMIN_INITIAL + '.json', 16384)
    )
  );
  check(digest(initial) === a.initialSha256, 'ADMIN_INITIAL_HASH_MISMATCH');
  validateAdministrativeEvidence(initial, auth, 'ADMIN_INITIAL', a.package);
  return initial;
}
export function administrativePayload(observations, auth) {
  const checked = validateAdministrativeObservations(observations, auth.target);
  return {
    planSha256: PLAN_SHA256,
    collectionId: randomUUID(),
    observations: encodeAdministrativeObservations(observations, auth.target),
    stateSha256: checked.stateSha256,
    window: { ...auth.administrativeAudit.window }
  };
}
