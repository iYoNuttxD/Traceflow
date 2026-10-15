import { parseArgs } from 'node:util';
import {
  connectionContract,
  protectedFile,
  validateGrants,
  mysqlTlsProbe,
  publicCaContract,
  verifyServerIdentity,
  verifyManagedDns
} from './lib/heatwave-connection.js';
import { requireCondition as check } from './lib/oci-compatibility-safety.js';

let prisma;
const deadline = setTimeout(() => {
  process.stdout.write('{"status":"FAIL","code":"DIAGNOSTIC_DEADLINE"}\n');
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
  const ca = await protectedFile(contract.ca, { rootOwned: !contract.local });
  const caIdentity = publicCaContract(ca, contract.target.caSha256);
  if (values['validate-only']) {
    console.log(
      JSON.stringify({ status: 'CONFIG_VALID', connected: false, mode: authorization.mode })
    );
  } else {
    if (!contract.local) await verifyManagedDns(contract.target);
    const tls = await mysqlTlsProbe({ host: contract.target.host, port: contract.target.port, ca });
    // Reuse the canonical shared Prisma Client without importing application startup or dotenv.
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = contract.value;
    check(
      (await import('@prisma/client')).Prisma.prismaVersion.client === '6.12.0',
      'PRISMA_VERSION'
    );
    ({ prisma } = await import('../src/database/prismaClient.js'));
    const [identity] = await prisma.$queryRawUnsafe(
      'SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, @@datadir AS datadir, VERSION() AS version, CURRENT_USER() AS currentUser'
    );
    verifyServerIdentity(identity, contract.target, contract.local);
    const session = await prisma.$queryRawUnsafe(
      "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')"
    );
    const tlsSession = Object.fromEntries(session.map((x) => [x.Variable_name, x.Value]));
    check(
      tlsSession.Ssl_cipher && ['TLSv1.2', 'TLSv1.3'].includes(tlsSession.Ssl_version),
      'PRISMA_TLS_REQUIRED'
    );
    const grants = validateGrants(
      await prisma.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER'),
      contract.target.schema,
      authorization.role || 'diagnostic'
    );
    const [parameters] = await prisma.$queryRawUnsafe(
      'SELECT @@version_comment AS versionComment, @@sql_mode AS sqlMode, @@transaction_isolation AS transactionIsolation, @@time_zone AS timeZone, @@system_time_zone AS systemTimeZone, @@character_set_server AS characterSet, @@collation_server AS collation, @@lower_case_table_names AS lowerCaseTableNames, @@max_connections AS maxConnections, @@wait_timeout AS waitTimeout, @@connect_timeout AS connectTimeout, @@require_secure_transport AS requireSecureTransport, @@default_storage_engine AS engine'
    );
    await prisma.$queryRawUnsafe('SELECT 1');
    await prisma.$disconnect();
    prisma = undefined;
    console.log(
      JSON.stringify(
        {
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
          parameters,
          pool: { connectionLimit: 1, connectTimeout: 5, poolTimeout: 5, socketTimeout: 10 },
          writes: false,
          disconnected: true
        },
        (_k, v) => (typeof v === 'bigint' ? String(v) : v)
      )
    );
  }
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'DIAGNOSTIC_FAILED';
  console.log(JSON.stringify({ status: 'FAIL', code, writes: false }));
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
  clearTimeout(deadline);
}
