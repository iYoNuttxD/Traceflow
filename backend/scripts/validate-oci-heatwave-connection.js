import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadInitialAudit,
  envelope,
  validatePrismaEvidence
} from './lib/heatwave-audit-evidence.js';
import { completeAuditedSession } from './lib/heatwave-prisma-audit.js';
import {
  loadRoleAttestation,
  requireAbsentRole,
  validateAbsentSession,
  validateAbsentInventory,
  requireVerifiableRoleWarnings
} from './lib/heatwave-role-attestation.js';
import {
  connectionContract,
  diagnosticFailure,
  diagnosticPhases as phases,
  protectedFile,
  diagnosticRoles,
  validateDirectGrants,
  validateEffectiveGrants,
  mysqlTlsProbe,
  publicCaContract,
  verifyServerIdentity,
  verifyManagedDns
} from './lib/heatwave-connection.js';
import { requireCondition as check } from './lib/oci-compatibility-safety.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let authorization,
  initialAudit,
  auditedStartedAt,
  roleEvidence,
  prisma,
  phase = phases.PREVALIDATION,
  failure,
  result,
  emitted = false;
function emit(value) {
  if (emitted) return;
  emitted = true;
  process.stdout.write(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v)) + '\n'
  );
}
const deadline = setTimeout(() => {
  emit(failure || diagnosticFailure({ code: 'DIAGNOSTIC_DEADLINE' }, phase));
  process.exit(1);
}, 30000);
try {
  const { values } = parseArgs({
    options: { authorization: { type: 'string' }, 'validate-only': { type: 'boolean' } }
  });
  authorization = JSON.parse(await protectedFile(values.authorization, { privateFile: true }));
  const contract = connectionContract(process.env, authorization);
  if (authorization.administrativeAudit) {
    phase = phases.ADMIN_AUDIT_INITIAL;
    auditedStartedAt = new Date().toISOString();
    initialAudit = await loadInitialAudit(authorization, packageRoot);
  } else if (!contract.local || authorization.roleAttestation) {
    phase = phases.ADMIN_ROLE_ATTESTATION;
    roleEvidence = await loadRoleAttestation(authorization, packageRoot);
    requireAbsentRole(roleEvidence);
  }
  phase = phases.TLS_CA;
  const ca = await protectedFile(contract.ca, { rootOwned: !contract.local });
  const caIdentity = publicCaContract(ca, contract.target.caSha256);
  if (values['validate-only']) {
    result = { status: 'CONFIG_VALID', connected: false, mode: authorization.mode };
  } else {
    phase = phases.DNS_IDENTITY;
    if (!contract.local) await verifyManagedDns(contract.target);
    phase = phases.TLS_PROBE;
    const tls = await mysqlTlsProbe({ host: contract.target.host, port: contract.target.port, ca });
    // Reuse the canonical shared Prisma Client without importing application startup or dotenv.
    phase = phases.PRISMA_INIT;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = contract.value;
    check(
      (await import('@prisma/client')).Prisma.prismaVersion.client === '6.12.0',
      'PRISMA_VERSION'
    );
    ({ prisma } = await import('../src/database/prismaClient.js'));
    // CURRENT_ROLE and grant expansion must refer to the same physical session.
    // This transaction contains metadata reads only; it never activates roles.
    phase = phases.SESSION_START;
    result = await prisma.$transaction(
      async (sessionClient) => {
        try {
          phase = phases.SQL_IDENTITY;
          const [identity] = await sessionClient.$queryRawUnsafe(
            'SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, @@datadir AS datadir, VERSION() AS version, CURRENT_USER() AS currentUser'
          );
          phase = phases.SERVER_IDENTITY;
          verifyServerIdentity(identity, contract.target, contract.local);
          phase = phases.SQL_SESSION_TLS;
          const session = await sessionClient.$queryRawUnsafe(
            "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')"
          );
          phase = phases.SESSION_TLS;
          const tlsSession = Object.fromEntries(session.map((x) => [x.Variable_name, x.Value]));
          check(
            tlsSession.Ssl_cipher && ['TLSv1.2', 'TLSv1.3'].includes(tlsSession.Ssl_version),
            'PRISMA_TLS_REQUIRED'
          );
          phase = phases.SQL_SERVER_PARAMETERS;
          const [parameters] = await sessionClient.$queryRawUnsafe(
            'SELECT @@version_comment AS versionComment, @@sql_mode AS sqlMode, @@transaction_isolation AS transactionIsolation, @@time_zone AS timeZone, @@system_time_zone AS systemTimeZone, @@character_set_server AS characterSet, @@collation_server AS collation, @@lower_case_table_names AS lowerCaseTableNames, @@max_connections AS maxConnections, @@wait_timeout AS waitTimeout, @@connect_timeout AS connectTimeout, @@require_secure_transport AS requireSecureTransport, @@default_storage_engine AS engine, @@mandatory_roles AS mandatoryRoles, CURRENT_ROLE() AS activeRoles'
          );
          phase = phases.ROLES;
          const roles = diagnosticRoles(parameters);
          if (roleEvidence)
            validateAbsentSession(roleEvidence, authorization, identity, parameters);
          else if (!initialAudit) check(!roles.mandatoryPublic, 'ROLE_ATTESTATION_REQUIRED');
          phase = phases.SQL_DIRECT_GRANTS;
          const directRows = await sessionClient.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
          phase = phases.DIRECT_GRANTS;
          const direct = validateDirectGrants(
            directRows,
            contract.target.schema,
            authorization.role || 'diagnostic',
            roles,
            identity.currentUser
          );
          if (initialAudit) {
            const verified = await completeAuditedSession(sessionClient, {
              authorization,
              initial: initialAudit,
              identity,
              parameters,
              direct,
              setPhase: (next) => {
                phase = phases[next];
              }
            });
            phase = phases.SESSION_END;
            return verified;
          }
          if (roleEvidence) {
            check(
              direct.privileges.length === 1 && direct.privileges[0] === 'SELECT',
              'ROLE_ATTESTATION_GRANTS_MISMATCH'
            );
            phase = phases.SQL_ROLE_SETTINGS;
            const settings = await sessionClient.$queryRawUnsafe(
              'SELECT @@GLOBAL.activate_all_roles_on_login AS activateAllRolesOnLogin'
            );
            phase = phases.ROLES;
            check(
              Array.isArray(settings) &&
                settings.length === 1 &&
                settings[0] &&
                Object.keys(settings[0]).length === 1 &&
                [0, 0n].includes(settings[0].activateAllRolesOnLogin),
              'ROLE_ATTESTATION_SESSION_MISMATCH'
            );
            phase = phases.SQL_ROLE_GRAPH;
            const graph = await sessionClient.$queryRawUnsafe(
              'SELECT USER, HOST, GRANTEE, GRANTEE_HOST, ROLE_NAME, ROLE_HOST, IS_GRANTABLE, IS_MANDATORY FROM information_schema.APPLICABLE_ROLES'
            );
            phase = phases.ROLE_GRAPH;
            validateAbsentInventory(graph);
            phase = phases.ROLE_WARNINGS;
            // No SQL workaround, retry, user flag or mock evidence can waive this blocker.
            requireVerifiableRoleWarnings();
          }
          phase = phases.EFFECTIVE_GRANTS;
          const grants = validateEffectiveGrants(
            directRows,
            contract.target.schema,
            authorization.role || 'diagnostic',
            roles,
            { direct, currentUser: identity.currentUser, graphVerified: false }
          );
          phase = phases.SQL_SELECT_ONE;
          await sessionClient.$queryRawUnsafe('SELECT 1');
          phase = phases.SESSION_END;
          return {
            formatVersion: 1,
            status: 'PASS',
            mode: authorization.mode,
            checkedAt: new Date().toISOString(),
            version: identity.version,
            prisma: '6.12.0',
            ca: caIdentity,
            serverIdentityVerified: true,
            effectiveUserVerified: true,
            tls,
            tlsSession,
            grants,
            roleVerification: {
              ...roles,
              expanded: false,
              graphVerified: false,
              strategy: 'direct-only'
            },
            parameters,
            pool: { connectionLimit: 1, connectTimeout: 5, poolTimeout: 5, socketTimeout: 10 },
            writes: false,
            disconnected: true
          };
        } catch (error) {
          // Preserve the first failure even if transaction rollback stalls or fails.
          failure ??= diagnosticFailure(error, phase);
          throw error;
        }
      },
      { maxWait: 5000, timeout: 30000 }
    );
  }
} catch (error) {
  failure ??= diagnosticFailure(error, phase);
  process.exitCode = 1;
} finally {
  if (prisma) {
    phase = phases.DISCONNECT;
    try {
      await prisma.$disconnect();
    } catch (error) {
      failure ??= diagnosticFailure(error, phase);
      process.exitCode = 1;
    }
  }
  if (roleEvidence) {
    phase = phases.ROLE_ATTESTATION_FINAL;
    try {
      await loadRoleAttestation(authorization, packageRoot);
    } catch (error) {
      failure ??= diagnosticFailure(error, phase);
      process.exitCode = 1;
    }
  }
  if (initialAudit) {
    phase = phases.ADMIN_AUDIT_RECHECK;
    try {
      await loadInitialAudit(authorization, packageRoot);
      if (!failure && result && result.status !== 'CONFIG_VALID') {
        result = envelope(authorization, 'PRISMA', result, initialAudit, auditedStartedAt);
        validatePrismaEvidence(result, authorization, initialAudit.package, initialAudit);
      }
    } catch (error) {
      failure ??= diagnosticFailure(error, phase);
      process.exitCode = 1;
    }
  }
  clearTimeout(deadline);
}
emit(failure || result);
