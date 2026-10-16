import { requireCondition as check } from './oci-compatibility-safety.js';
import { validateDirectGrants } from './heatwave-connection.js';
import { validateAdministrativeEvidence, PRISMA_CHECKS } from './heatwave-audit-evidence.js';

export const AUDITED_SETTINGS_SQL =
  'SELECT @@GLOBAL.activate_all_roles_on_login AS activateAllRolesOnLogin, @@GLOBAL.partial_revokes AS partialRevokes, CONNECTION_ID() AS connectionId';
export const AUDITED_FINAL_SQL =
  'SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, VERSION() AS version, CURRENT_USER() AS currentUser, CURRENT_ROLE() AS activeRoles, @@GLOBAL.mandatory_roles AS mandatoryRoles, @@GLOBAL.activate_all_roles_on_login AS activateAllRolesOnLogin, @@GLOBAL.partial_revokes AS partialRevokes, CONNECTION_ID() AS connectionId';
function one(rows, keys) {
  check(
    Array.isArray(rows) &&
      rows.length === 1 &&
      rows[0] &&
      Object.keys(rows[0]).length === keys.length &&
      keys.every((key) => Object.hasOwn(rows[0], key)),
    'AUDIT_SESSION_RESULT_INVALID'
  );
  return rows[0];
}
function numeric(value, expected) {
  return value === expected || value === BigInt(expected);
}
function identityMatches(identity, target) {
  check(
    identity.uuid === target.serverUuid &&
      identity.version === target.version &&
      identity.db === target.schema &&
      numeric(identity.port, target.port) &&
      identity.currentUser === target.account,
    'AUDIT_SESSION_IDENTITY_MISMATCH'
  );
}
function selectOnly(direct, target) {
  check(
    direct.recipient === target.account &&
      direct.publicAssigned === false &&
      direct.privileges.length === 1 &&
      direct.privileges[0] === 'SELECT',
    'AUDIT_SESSION_GRANTS_MISMATCH'
  );
}
export async function completeAuditedSession(
  client,
  { authorization, initial, identity, parameters, direct, setPhase }
) {
  const target = authorization.target;
  validateAdministrativeEvidence(initial, authorization, 'ADMIN_INITIAL', initial.package);
  identityMatches(identity, target);
  check(
    parameters.mandatoryRoles === 'public' &&
      parameters.activeRoles === 'NONE' &&
      numeric(parameters.requireSecureTransport, 1),
    'AUDIT_SESSION_ROLES_MISMATCH'
  );
  selectOnly(direct, target);
  setPhase('SQL_ROLE_SETTINGS');
  const before = one(await client.$queryRawUnsafe(AUDITED_SETTINGS_SQL), [
    'activateAllRolesOnLogin',
    'partialRevokes',
    'connectionId'
  ]);
  check(
    numeric(before.activateAllRolesOnLogin, 0) &&
      numeric(before.partialRevokes, 1) &&
      ['number', 'bigint'].includes(typeof before.connectionId) &&
      /^[1-9][0-9]{0,19}$/.test(String(before.connectionId)),
    'AUDIT_SESSION_ROLES_MISMATCH'
  );
  setPhase('SQL_SELECT_ONE');
  const select = await client.$queryRawUnsafe('SELECT 1');
  check(
    Array.isArray(select) &&
      select.length === 1 &&
      Object.keys(select[0]).length === 1 &&
      numeric(Object.values(select[0])[0], 1),
    'AUDIT_SELECT_ONE_INVALID'
  );
  setPhase('SQL_SESSION_CONSISTENCY');
  const after = one(await client.$queryRawUnsafe(AUDITED_FINAL_SQL), [
    'db',
    'uuid',
    'port',
    'version',
    'currentUser',
    'activeRoles',
    'mandatoryRoles',
    'activateAllRolesOnLogin',
    'partialRevokes',
    'connectionId'
  ]);
  identityMatches(after, target);
  check(
    after.activeRoles === 'NONE' &&
      after.mandatoryRoles === 'public' &&
      numeric(after.activateAllRolesOnLogin, 0) &&
      numeric(after.partialRevokes, 1) &&
      String(after.connectionId) === String(before.connectionId),
    'AUDIT_SESSION_CHANGED'
  );
  setPhase('SQL_FINAL_GRANTS');
  const finalGrants = validateDirectGrants(
    await client.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER'),
    target.schema,
    'diagnostic',
    {},
    target.account
  );
  selectOnly(finalGrants, target);
  return {
    prisma: '6.12.0',
    connectionId: String(before.connectionId),
    disconnected: true,
    checks: Object.fromEntries(PRISMA_CHECKS.map((key) => [key, true])),
    stateSha256: initial.payload.stateSha256
  };
}
