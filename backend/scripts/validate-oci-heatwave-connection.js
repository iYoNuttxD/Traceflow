import { parseArgs } from 'node:util';
import {
  connectionContract,
  diagnosticFailure,
  diagnosticPhases as phases,
  protectedFile,
  diagnosticRoles,
  validateEffectiveGrants,
  mysqlTlsProbe,
  publicCaContract,
  verifyServerIdentity,
  verifyManagedDns
} from './lib/heatwave-connection.js';
import { requireCondition as check } from './lib/oci-compatibility-safety.js';

let prisma,
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
  const authorization = JSON.parse(
    await protectedFile(values.authorization, { privateFile: true })
  );
  const contract = connectionContract(process.env, authorization);
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
    phase = phases.SQL_IDENTITY;
    const [identity] = await prisma.$queryRawUnsafe(
      'SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, @@datadir AS datadir, VERSION() AS version, CURRENT_USER() AS currentUser'
    );
    phase = phases.SERVER_IDENTITY;
    verifyServerIdentity(identity, contract.target, contract.local);
    phase = phases.SQL_SESSION_TLS;
    const session = await prisma.$queryRawUnsafe(
      "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')"
    );
    phase = phases.SESSION_TLS;
    const tlsSession = Object.fromEntries(session.map((x) => [x.Variable_name, x.Value]));
    check(
      tlsSession.Ssl_cipher && ['TLSv1.2', 'TLSv1.3'].includes(tlsSession.Ssl_version),
      'PRISMA_TLS_REQUIRED'
    );
    phase = phases.SQL_SERVER_PARAMETERS;
    const [parameters] = await prisma.$queryRawUnsafe(
      'SELECT @@version_comment AS versionComment, @@sql_mode AS sqlMode, @@transaction_isolation AS transactionIsolation, @@time_zone AS timeZone, @@system_time_zone AS systemTimeZone, @@character_set_server AS characterSet, @@collation_server AS collation, @@lower_case_table_names AS lowerCaseTableNames, @@max_connections AS maxConnections, @@wait_timeout AS waitTimeout, @@connect_timeout AS connectTimeout, @@require_secure_transport AS requireSecureTransport, @@default_storage_engine AS engine, @@mandatory_roles AS mandatoryRoles, CURRENT_ROLE() AS activeRoles'
    );
    phase = phases.ROLES;
    const roles = diagnosticRoles(parameters);
    phase = phases.SQL_DIRECT_GRANTS;
    const direct = await prisma.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
    phase = phases.DIRECT_GRANTS;
    validateEffectiveGrants(
      direct,
      contract.target.schema,
      authorization.role || 'diagnostic',
      roles
    );
    phase = phases.SQL_PUBLIC_GRANTS;
    const effective = roles.mandatoryPublic
      ? await prisma.$queryRawUnsafe("SHOW GRANTS FOR CURRENT_USER USING 'public'@'%'")
      : direct;
    phase = phases.EFFECTIVE_GRANTS;
    const grants = validateEffectiveGrants(
      effective,
      contract.target.schema,
      authorization.role || 'diagnostic',
      roles
    );
    phase = phases.SQL_SELECT_ONE;
    await prisma.$queryRawUnsafe('SELECT 1');
    result = {
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
      roleVerification: { ...roles, expanded: roles.mandatoryPublic },
      parameters,
      pool: { connectionLimit: 1, connectTimeout: 5, poolTimeout: 5, socketTimeout: 10 },
      writes: false,
      disconnected: true
    };
  }
} catch (error) {
  failure = diagnosticFailure(error, phase);
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
  clearTimeout(deadline);
}
emit(failure || result);
