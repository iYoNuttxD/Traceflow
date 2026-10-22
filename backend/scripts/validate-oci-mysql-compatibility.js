import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { arch, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CompatibilityError,
  assertCommandResult,
  assertServerIdentity,
  classifyFailure,
  createOwnedDirectory,
  removeOwnedDirectory,
  requireCondition,
  sanitizeOutput,
  validateCompatibilityTarget
} from './lib/oci-compatibility-safety.js';

const sourceBackend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = {
  formatVersion: 1,
  startedAt: new Date().toISOString(),
  phases: [],
  classification: 'PARTIAL / BLOCKED'
};
let owner, target, server, serverExit, reportPath, backend, childEnvironment;
const activeCommands = new Set();
const privateValues = [];
const abort = new AbortController();
const stopRequested = () => abort.abort();
process.once('SIGINT', stopRequested);
process.once('SIGTERM', stopRequested);

function safe(value) {
  return sanitizeOutput(value, [target?.url, target?.password, owner?.token, ...privateValues]);
}
function event(value) {
  process.stdout.write(`${safe(JSON.stringify(value))}\n`);
}
async function saveReport() {
  if (reportPath)
    await writeFile(reportPath, `${safe(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
}
async function phase(name, work) {
  const entry = { name, status: 'RUNNING', startedAt: new Date().toISOString() };
  report.phases.push(entry);
  event({ phase: name, status: 'RUNNING' });
  const pulse = setInterval(() => event({ phase: name, status: 'RUNNING' }), 30000);
  try {
    abort.signal.throwIfAborted();
    entry.result = await work();
    entry.status = 'PASS';
    return entry.result;
  } catch (error) {
    entry.status = 'FAIL';
    entry.code = classifyFailure(error);
    entry.details = error.details;
    throw error;
  } finally {
    clearInterval(pulse);
    entry.finishedAt = new Date().toISOString();
    await saveReport();
    event({ phase: name, status: entry.status });
  }
}

function command(
  executable,
  args,
  { cwd = backend, env = childEnvironment, timeout = 300000, input } = {}
) {
  return new Promise((resolveCommand) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    activeCommands.add(child);
    let output = '',
      error,
      timedOut = false;
    const terminate = () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already stopped */
      }
    };
    abort.signal.addEventListener('abort', terminate, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeout);
    const hardTimeout = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already stopped */
      }
    }, timeout + 5000);
    const collect = (data) => {
      output = (output + data.toString()).slice(-2_000_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (failure) => {
      error = failure;
    });
    child.on('close', (status, signal) => {
      clearTimeout(timeoutId);
      clearTimeout(hardTimeout);
      abort.signal.removeEventListener('abort', terminate);
      activeCommands.delete(child);
      resolveCommand({
        status,
        signal,
        error: error ? classifyFailure(error) : timedOut ? 'TIMEOUT' : undefined,
        output: safe(output)
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function checked(executable, args, options = {}) {
  const result = await command(executable, args, options);
  try {
    assertCommandResult(result, options.label || 'COMMAND');
  } catch (error) {
    error.details = result;
    throw error;
  }
  return result;
}
async function freePort(port) {
  await new Promise((accept, reject) => {
    const probe = createServer();
    probe.once('error', (error) =>
      reject(
        new CompatibilityError(
          ['EPERM', 'EACCES'].includes(error.code) ? 'LOCAL_LISTENER_DENIED' : 'PORT_UNAVAILABLE',
          'Não foi possível reservar a porta isolada; nenhum servidor existente será usado.',
          { code: error.code }
        )
      )
    );
    probe.listen(Number(port), '127.0.0.1', () => probe.close(accept));
  });
}
async function stopServer() {
  if (!server) return true;
  if (server.exitCode !== null || server.signalCode !== null) return true;
  server.kill('SIGTERM');
  let timer;
  await Promise.race([
    serverExit,
    new Promise((done) => {
      timer = setTimeout(done, 20000);
    })
  ]);
  clearTimeout(timer);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await serverExit;
  }
  return server.exitCode !== null || server.signalCode !== null;
}

try {
  const { values } = parseArgs({
    options: {
      'mysql-base': { type: 'string' },
      'expected-version': { type: 'string' },
      report: { type: 'string' },
      help: { type: 'boolean' }
    }
  });
  if (values.help) {
    event({
      usage:
        'TEST_DATABASE_URL=<fresh isolated URL> node scripts/validate-oci-mysql-compatibility.js --mysql-base <verified distribution> --expected-version <26.7.0|8.4.8> --report <new JSON file>',
      note: 'See docs/runbooks/OCI_MYSQL_COMPATIBILITY.md. No existing server is accepted.'
    });
  } else {
    target = validateCompatibilityTarget(process.env);
    requireCondition(
      ['26.7.0', '8.4.8'].includes(values['expected-version']),
      'UNAUTHORIZED_VERSION',
      'Use exatamente 26.7.0 ou 8.4.8.'
    );
    requireCondition(
      process.versions.node.split('.')[0] === '22',
      'NODE_VERSION_MISMATCH',
      'Execute com Node.js 22.'
    );
    requireCondition(
      values['mysql-base'] && values.report,
      'MISSING_OPTIONS',
      'Informe mysql-base e report.'
    );
    const requestedReport = resolve(values.report);
    // Refuse overwriting evidence from a prior attempt.
    await writeFile(requestedReport, '', { flag: 'wx', mode: 0o600 });
    reportPath = requestedReport;
    const mysqlBase = await realpath(values['mysql-base']);
    const mysqld = join(mysqlBase, 'bin/mysqld');
    const mysql = join(mysqlBase, 'bin/mysql');
    const expectedVersion = values['expected-version'];
    childEnvironment = {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
      LANG: 'en_US.UTF-8',
      TZ: 'UTC',
      NODE_OPTIONS: '--no-experimental-webstorage'
    };
    report.localRuntime = { node: process.version, platform: platform(), architecture: arch() };
    report.target = {
      host: target.host,
      port: target.port,
      database: target.database,
      expectedVersion
    };
    const inventory = await phase('inventory', async () => {
      const binary = await checked(mysqld, ['--no-defaults', '--version'], {
        cwd: sourceBackend,
        label: 'MYSQL_BINARY'
      });
      requireCondition(
        binary.output.includes(`Ver ${expectedVersion} `),
        'MYSQL_VERSION_MISMATCH',
        'O binário não corresponde à versão exata solicitada.'
      );
      const schema = await readFile(join(sourceBackend, 'prisma/schema.prisma'), 'utf8');
      const names = (await readdir(join(sourceBackend, 'prisma/migrations')))
        .filter((name) => /^\d/.test(name))
        .sort();
      const digest = createHash('sha256');
      for (const name of names)
        digest
          .update(name)
          .update(await readFile(join(sourceBackend, 'prisma/migrations', name, 'migration.sql')));
      return {
        binary: binary.output.trim(),
        binarySha256: createHash('sha256')
          .update(await readFile(mysqld))
          .digest('hex'),
        models: (schema.match(/^model /gm) || []).length,
        enums: (schema.match(/^enum /gm) || []).length,
        migrations: names.length,
        migrationNames: names,
        migrationsSha256: digest.digest('hex')
      };
    });
    await freePort(target.port);
    owner = await createOwnedDirectory(target.runId);
    const datadir = join(owner.root, 'data');
    const socket = join(owner.root, 'mysql.sock');
    const pidFile = join(owner.root, 'mysql.pid');
    const logFile = join(owner.root, 'mysql.log');
    const bootstrap = join(owner.root, 'bootstrap.sql');
    const prefix = `tf\\_oci\\_${target.runId}\\_%`;
    const rootPassword = randomBytes(32).toString('hex');
    privateValues.push(rootPassword);
    await phase('initialize-owned-server', async () => {
      await checked(
        mysqld,
        [
          '--no-defaults',
          `--basedir=${mysqlBase}`,
          `--datadir=${datadir}`,
          '--initialize-insecure',
          '--mysqlx=OFF',
          '--log-error-verbosity=2'
        ],
        { cwd: owner.root, label: 'MYSQL_INITIALIZATION' }
      );
      await writeFile(
        bootstrap,
        [
          `ALTER USER 'root'@'localhost' IDENTIFIED BY '${rootPassword}';`,
          `CREATE USER '${target.username}'@'127.0.0.1' IDENTIFIED BY '${target.password}';`,
          `GRANT ALL PRIVILEGES ON \`${prefix}\`.* TO '${target.username}'@'127.0.0.1';`,
          `CREATE DATABASE \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
          `CREATE DATABASE \`${target.controlSchema}\`;`,
          `CREATE TABLE \`${target.controlSchema}\`.RunOwner (id INT PRIMARY KEY, token CHAR(64) NOT NULL);`,
          `INSERT INTO \`${target.controlSchema}\`.RunOwner VALUES (1, '${owner.token}');`
        ].join('\n') + '\n',
        { mode: 0o600, flag: 'wx' }
      );
      server = spawn(
        mysqld,
        [
          '--no-defaults',
          `--basedir=${mysqlBase}`,
          `--datadir=${datadir}`,
          `--port=${target.port}`,
          '--bind-address=127.0.0.1',
          '--skip-name-resolve',
          '--mysqlx=OFF',
          '--skip-log-bin',
          '--innodb-buffer-pool-size=134217728',
          '--default-time-zone=+00:00',
          `--socket=${socket}`,
          `--pid-file=${pidFile}`,
          `--log-error=${logFile}`,
          `--init-file=${bootstrap}`
        ],
        { cwd: owner.root, env: childEnvironment, stdio: 'ignore' }
      );
      serverExit = new Promise((done) => {
        server.once('exit', done);
        server.once('error', done);
      });
      const mysqlArgs = [
        '--no-defaults',
        '--no-login-paths',
        '--protocol=TCP',
        '--host=127.0.0.1',
        `--port=${target.port}`,
        `--user=${target.username}`,
        '--connect-timeout=2',
        '--batch',
        '--raw',
        '--skip-column-names',
        target.database
      ];
      const sql = `SELECT JSON_OBJECT('version', VERSION(), 'versionComment', @@version_comment, 'compileOs', @@version_compile_os, 'compileMachine', @@version_compile_machine, 'sqlMode', @@sql_mode, 'transactionIsolation', @@transaction_isolation, 'timeZone', @@time_zone, 'systemTimeZone', @@system_time_zone, 'characterSetServer', @@character_set_server, 'collationServer', @@collation_server, 'lowerCaseTableNames', @@lower_case_table_names, 'defaultStorageEngine', @@default_storage_engine, 'serverUuid', @@server_uuid, 'datadir', @@datadir, 'port', @@port, 'database', DATABASE(), 'ownerToken', (SELECT token FROM \`${target.controlSchema}\`.RunOwner WHERE id=1));`;
      let actual;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        abort.signal.throwIfAborted();
        if (server.exitCode !== null || server.signalCode !== null)
          throw new CompatibilityError(
            'MYSQL_START_FAILED',
            'mysqld encerrou antes da prova de propriedade.',
            { log: safe(await readFile(logFile, 'utf8').catch(() => 'unavailable')) }
          );
        const result = await command(mysql, mysqlArgs, {
          cwd: owner.root,
          env: { ...childEnvironment, MYSQL_PWD: target.password },
          timeout: 5000,
          input: sql
        });
        if (result.status === 0) {
          actual = JSON.parse(result.output.trim());
          break;
        }
        if (!/ERROR 200[23]/.test(result.output))
          throw new CompatibilityError(
            /1045/.test(result.output) ? 'AUTHENTICATION_FAILED' : 'MYSQL_IDENTITY_QUERY_FAILED',
            'Não foi possível comprovar identidade do servidor.',
            result
          );
        await new Promise((done) => setTimeout(done, 250));
      }
      requireCondition(
        actual,
        'CONNECTION_UNAVAILABLE',
        'Prazo de conexão do servidor descartável excedido.'
      );
      const serverUuid = /server-uuid=([a-f0-9-]+)/i.exec(
        await readFile(join(datadir, 'auto.cnf'), 'utf8')
      )?.[1];
      requireCondition(
        Number((await readFile(pidFile, 'utf8')).trim()) === server.pid,
        'SERVER_PID_MISMATCH',
        'PID não pertence ao processo iniciado por esta execução.'
      );
      // command() redacts the ownership token before returning output; compare
      // an additional hash from the owned file against an independent SQL read.
      const expected = {
        ...target,
        version: expectedVersion,
        serverUuid,
        datadir: await realpath(datadir)
      };
      assertServerIdentity(actual, expected);
      const ownerCheck = await checked(mysql, mysqlArgs, {
        cwd: owner.root,
        env: { ...childEnvironment, MYSQL_PWD: target.password },
        input: `SELECT SHA2(token, 256) FROM \`${target.controlSchema}\`.RunOwner WHERE id=1;`,
        label: 'OWNERSHIP'
      });
      requireCondition(
        ownerCheck.output.trim() === createHash('sha256').update(owner.token).digest('hex'),
        'OWNER_MISMATCH',
        'Identificador de propriedade divergente.'
      );
      const denied = await command(mysql, mysqlArgs, {
        cwd: owner.root,
        env: { ...childEnvironment, MYSQL_PWD: target.password },
        input: 'SELECT COUNT(*) FROM mysql.user;'
      });
      requireCondition(
        denied.status !== 0 && /1142/.test(denied.output),
        'EXCESSIVE_PRIVILEGES',
        'Credencial de testes não pode ler tabelas administrativas.'
      );
      const badLogin = await command(mysql, mysqlArgs, {
        cwd: owner.root,
        env: { ...childEnvironment, MYSQL_PWD: randomBytes(32).toString('hex') },
        input: 'SELECT 1;'
      });
      requireCondition(
        badLogin.status !== 0 && /1045/.test(badLogin.output),
        'AUTH_NEGATIVE_CONTROL_FAILED',
        'Credencial incorreta deve ser rejeitada.'
      );
      delete actual.ownerToken;
      report.server = {
        ...actual,
        ownershipVerified: true,
        credentialScope: 'owned-prefix-only',
        administrativeRead: 'DENIED',
        invalidPassword: 'REJECTED'
      };
      childEnvironment = {
        ...childEnvironment,
        NODE_ENV: 'test',
        EMAIL_PROVIDER: 'capture',
        TEST_DATABASE_URL: target.url,
        DATABASE_URL: 'mysql://127.0.0.1:1/unused_development_guard',
        TF_OCI_OWNER_TOKEN: owner.token,
        TF_OCI_SERVER_UUID: serverUuid,
        TF_OCI_DATADIR: expected.datadir,
        TF_OCI_MYSQL_VERSION: expectedVersion,
        TMPDIR: owner.root
      };
      await unlink(bootstrap);
      return report.server;
    });
    await phase('prepare-isolated-workspace', async () => {
      backend = join(owner.root, 'workspace/backend');
      await mkdir(backend, { recursive: true, mode: 0o700 });
      // Allowlist only. Never copy .env, .data, credentials, logs or node_modules.
      for (const name of [
        'src',
        'prisma',
        'scripts',
        'test',
        'package.json',
        'package-lock.json',
        'vitest.config.js',
        'eslint.config.js'
      ])
        await cp(join(sourceBackend, name), join(backend, name), {
          recursive: true,
          errorOnExist: true
        });
      const userConfig = join(owner.root, 'npm-user.conf');
      const globalConfig = join(owner.root, 'npm-global.conf');
      await writeFile(userConfig, '', { mode: 0o600 });
      await writeFile(globalConfig, '', { mode: 0o600 });
      childEnvironment = {
        ...childEnvironment,
        npm_config_userconfig: userConfig,
        npm_config_globalconfig: globalConfig,
        npm_config_cache: join(owner.root, 'npm-cache')
      };
      const installed = await checked('npm', ['ci', '--no-audit', '--no-fund'], {
        label: 'NPM_CI'
      });
      return { install: installed.output, copiedNodeModules: false, environmentFilesCopied: false };
    });
    const prisma = join(backend, 'node_modules/prisma/build/index.js');
    await phase('prisma-validate-generate', async () => {
      const result = [];
      for (const action of ['validate', 'generate'])
        result.push(
          await checked(process.execPath, [prisma, action], {
            label: `PRISMA_${action.toUpperCase()}`
          })
        );
      return result;
    });
    await phase('native-before-prune', async () => {
      const result = await checked(
        process.execPath,
        ['scripts/oci-compatibility-probe.js', 'native'],
        { label: 'NATIVE_PROBE' }
      );
      return JSON.parse(result.output.trim());
    });
    await phase('official-migration-chain', async () => {
      const migrationEnvironment = { ...childEnvironment, DATABASE_URL: target.url };
      const deploy = await checked(process.execPath, [prisma, 'migrate', 'deploy'], {
        env: migrationEnvironment,
        label: 'MIGRATE_DEPLOY'
      });
      const status = await checked(process.execPath, [prisma, 'migrate', 'status'], {
        env: migrationEnvironment,
        label: 'MIGRATE_STATUS'
      });
      return { expectedCount: inventory.migrations, deploy: deploy.output, status: status.output };
    });
    await phase('physical-and-semantic-contracts', async () => {
      const result = await checked(
        process.execPath,
        ['scripts/oci-compatibility-probe.js', 'physical'],
        { label: 'PHYSICAL_CONTRACTS' }
      );
      return JSON.parse(result.output.trim());
    });
    await phase('real-deadlock-timeout-and-isolation', async () => {
      const result = await checked(
        process.execPath,
        ['scripts/oci-compatibility-probe.js', 'concurrency'],
        { label: 'REAL_CONCURRENCY' }
      );
      return JSON.parse(result.output.trim());
    });
    await phase('historical-migration-validators', async () => {
      const results = [];
      const validators = [
        ['lr5-schema-audit.js', '--enforce', '--test'],
        ['validate-empty-migrations.js'],
        ['validate-lr5-migration.js'],
        ['validate-lr9-migration.js'],
        ['validate-lr2-legacy-migration.js'],
        ['validate-s2-p1-migration.js'],
        ['validate-s2-p3-migration.js'],
        ['validate-s2-p5-1-migration.js'],
        ['validate-dashboard-preference-migration.js'],
        ['validate-task-responsibility-migration.js'],
        ['validate-github-sync-migration.js'],
        ['validate-github-sync-migration.js', '--liveness'],
        ['validate-github-sync-migration.js', '--actor'],
        ['validate-schema-drift.js']
      ];
      for (const [name, ...args] of validators) {
        event({ validator: name, arguments: args, status: 'RUNNING' });
        const result = await checked(process.execPath, [`scripts/${name}`, ...args], {
          label: 'MIGRATION_VALIDATOR'
        });
        results.push({ name, args, status: result.status, output: result.output });
      }
      return results;
    });
    await phase('functional-and-concurrency-suites', async () => {
      const testReport = join(owner.root, 'vitest.json');
      const args = [
        'node_modules/vitest/vitest.mjs',
        'run',
        'test/api',
        'test/integration',
        '--reporter=json',
        `--outputFile=${testReport}`
      ];
      const result = await command(process.execPath, args, { timeout: 1200000 });
      const actual = JSON.parse(await readFile(testReport, 'utf8').catch(() => '{}'));
      report.tests = {
        total: actual.numTotalTests,
        passed: actual.numPassedTests,
        failed: actual.numFailedTests,
        pending: actual.numPendingTests,
        success: actual.success,
        suites: actual.testResults?.map((suite) => ({
          name: suite.name.replace(`${backend}/`, ''),
          status: suite.status,
          assertions: suite.assertionResults.map((test) => ({
            name: test.fullName,
            status: test.status,
            failures: test.failureMessages
          }))
        }))
      };
      if (result.status !== 0 || actual.success !== true)
        throw new CompatibilityError(
          'FUNCTIONAL_TESTS_FAILED',
          'Há testes funcionais com falha; nenhum retry automático será realizado.',
          { output: result.output }
        );
      return {
        total: report.tests.total,
        passed: report.tests.passed,
        failed: report.tests.failed,
        pending: report.tests.pending
      };
    });
    await phase('production-artifact-runtime', async () => {
      const prune = await checked(
        'npm',
        ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        { label: 'NPM_PRUNE' }
      );
      requireCondition(
        !(await stat(join(backend, 'node_modules/vitest')).catch(() => null)),
        'DEV_DEPENDENCY_RETAINED',
        'Vitest não deve estar no runtime final.'
      );
      const result = await checked(
        process.execPath,
        ['scripts/oci-compatibility-probe.js', 'native'],
        { label: 'PRUNED_RUNTIME' }
      );
      return {
        prune: prune.output,
        runtime: JSON.parse(result.output.trim()),
        devDependenciesRemoved: true
      };
    });
    report.mysqlCompatibility = 'PASS';
    report.linuxArm64 =
      platform() === 'linux' && arch() === 'arm64' ? 'EXECUTED_SEE_OS_EVIDENCE' : 'NOT_EXECUTED';
    report.heatWave = 'NOT_EXECUTED_PROTECTED_PRODUCTION';
    report.classification = 'PARTIAL / BLOCKED';
  }
} catch (error) {
  report.error = {
    code: classifyFailure(error),
    message: safe(error.message),
    details: error.details
  };
  report.classification =
    /PROTECTED|AMBIGUOUS|OWNERSHIP|OWNER_|IDENTITY|CLEANUP|CREDENTIAL|INVALID_TEST|INVALID_OWNED|EXCESSIVE/.test(
      report.error.code
    )
      ? 'SAFETY BLOCKED'
      : 'PARTIAL / BLOCKED';
  process.exitCode = 1;
} finally {
  for (const child of activeCommands) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already stopped */
    }
  }
  const serverStopped = await stopServer();
  if (owner) {
    try {
      await removeOwnedDirectory(owner, { serverStopped });
      report.cleanup = {
        serverStopped,
        ownedDirectoryRemoved: true,
        existingServersAccessed: false
      };
    } catch (error) {
      report.cleanup = {
        serverStopped,
        ownedDirectoryRemoved: false,
        code: classifyFailure(error),
        retainedDirectory: owner.root
      };
      report.classification = 'SAFETY BLOCKED';
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await saveReport();
  event({
    classification: report.classification,
    mysqlCompatibility: report.mysqlCompatibility || 'NOT_PROVEN',
    error: report.error,
    cleanup: report.cleanup
  });
  process.removeListener('SIGINT', stopRequested);
  process.removeListener('SIGTERM', stopRequested);
}
