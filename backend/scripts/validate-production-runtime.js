import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { connectOwnedPrisma } from './lib/oci-compatibility-probes.js';
import { productionEnvironment } from '../test/helpers/production-environment.js';

// This smoke is deliberately stricter than the normal test helpers. It only accepts a
// newly owned OCI compatibility runner server, checked against UUID/datadir/nonce first.
const { client, target } = await connectOwnedPrisma();
const storage = await mkdtemp(join(await realpath(tmpdir()), 'oci03-smoke-storage-'));
const children = new Set();
let user, project;
const checks = [];
async function port() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
}
function launch(environment, entry = 'src/server.js') {
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const ended = new Promise((resolve) =>
    child.once('exit', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    })
  );
  return { child, ended, output: () => output };
}
async function deadline(work, ms = 10000) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Controlled runtime deadline exceeded.')), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function started(process) {
  if (process.output().includes('TRACEFLOW backend running.')) return;
  await deadline(
    new Promise((resolve, reject) => {
      const onData = () => {
        if (process.output().includes('TRACEFLOW backend running.')) {
          process.child.stdout.off('data', onData);
          resolve();
        }
      };
      process.child.stdout.on('data', onData);
      process.ended.then(() => reject(new Error('Controlled API startup failed.')));
    })
  );
}
try {
  const password = randomBytes(24).toString('hex');
  user = await client.user.create({
    data: {
      name: 'OCI03 synthetic',
      username: `oci03${randomBytes(6).toString('hex')}`,
      email: `oci03${randomBytes(6).toString('hex')}@example.invalid`,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1
      }),
      emailVerifiedAt: new Date()
    }
  });
  const apiPort = await port();
  const environment = productionEnvironment({
    PATH: process.env.PATH,
    DATABASE_URL: target.url,
    PORT: String(apiPort),
    TEST_EVIDENCE_STORAGE_DIR: storage,
    SHUTDOWN_TIMEOUT_MS: '3000'
  });
  const api = launch(environment);
  await started(api);
  const startedEvent = api
    .output()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((entry) => entry.message === 'TRACEFLOW backend running.');
  assert.equal(startedEvent?.host, '127.0.0.1');
  checks.push('actual-loopback-bind');
  const base = `http://127.0.0.1:${apiPort}`;
  let cookie, csrf;
  const call = async (
    path,
    { method = 'GET', body, withCsrf = true, origin = 'https://traceflow.example' } = {}
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        Host: 'traceflow.example',
        'X-Forwarded-Host': 'traceflow.example',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': '203.0.113.10',
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf && withCsrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  };
  assert.equal((await call('/health/live')).response.status, 200);
  assert.equal((await call('/health/ready')).response.status, 200);
  checks.push('live-ready-schema-storage');
  const { chmod } = await import('node:fs/promises');
  await chmod(storage, 0o755);
  try {
    assert.equal((await call('/health/ready')).response.status, 503);
    assert.equal((await call('/health/live')).response.status, 200);
  } finally {
    await chmod(storage, 0o700);
  }
  checks.push('storage-degradation-readiness-only');

  assert.equal(
    (await call('/health/live', { origin: 'https://evil.example' })).response.status,
    403
  );
  checks.push('cors-unknown-origin-rejected');
  async function login() {
    const result = await call('/api/auth/login', {
      method: 'POST',
      body: { identifier: user.username, password }
    });
    assert.equal(result.response.status, 200);
    const header = result.response.headers.get('set-cookie');
    for (const pattern of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i, /Path=\//i, /Max-Age=/i])
      assert.match(header, pattern);
    assert.doesNotMatch(header, /Domain=/i);
    cookie = header.split(';')[0];
    csrf = result.data.csrfToken;
  }
  await login();
  checks.push('login-secure-host-only-cookie');
  assert.equal((await call('/api/auth/me')).response.status, 200);
  const projectBody = { name: 'OCI03 controlled runtime', responsibleTeam: 'Synthetic' };
  assert.equal(
    (await call('/api/projects', { method: 'POST', body: projectBody, withCsrf: false })).response
      .status,
    403
  );
  const created = await call('/api/projects', { method: 'POST', body: projectBody });
  assert.equal(created.response.status, 201);
  project = created.data.project || created.data;
  assert(Number.isSafeInteger(project.id));
  checks.push('csrf-enforced-authorized-mutation');
  const logout = await call('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal(logout.response.status, 204);
  assert.match(logout.response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await call('/api/auth/me')).response.status, 401);
  checks.push('logout-revokes-session-cookie');
  cookie = undefined;
  csrf = undefined;
  await login();
  const stream = await fetch(`${base}/api/projects/${project.id}/events`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  assert.equal((await reader.read()).done, false);
  api.child.kill('SIGTERM');
  api.child.kill('SIGTERM');
  assert.deepEqual(await deadline(api.ended), { code: 0, signal: null });
  while (!(await deadline(reader.read())).done) {
    /* drain the finite stream */
  }
  assert.equal(api.output().split('Graceful shutdown completed.').length - 1, 1);
  checks.push('sigterm-sse-closed-idempotent-shutdown');
  const idle = launch({ ...environment, PORT: String(await port()) });
  await started(idle);
  idle.child.kill('SIGTERM');
  assert.equal((await deadline(idle.ended)).code, 0);
  checks.push('idle-sigterm');
  const rejectedDatabase = new URL(target.url);
  rejectedDatabase.password = randomBytes(32).toString('hex');
  const degradedPort = await port();
  const degraded = launch({
    ...environment,
    DATABASE_URL: rejectedDatabase.toString(),
    PORT: String(degradedPort)
  });
  await started(degraded);
  const live = await fetch(`http://127.0.0.1:${degradedPort}/health/live`, {
    signal: AbortSignal.timeout(5000)
  });
  const unready = await fetch(`http://127.0.0.1:${degradedPort}/health/ready`, {
    signal: AbortSignal.timeout(5000)
  });
  assert.equal(live.status, 200);
  assert.equal(unready.status, 503);
  assert.deepEqual(await unready.json(), {
    status: 'not_ready',
    message: 'Dependência essencial indisponível.'
  });
  degraded.child.kill('SIGTERM');
  assert.equal((await deadline(degraded.ended)).code, 0);
  checks.push('owned-database-auth-failure-readiness-only');

  for (const overrides of [
    { HTTP_HOST: '0.0.0.0' },
    { FRONTEND_URL: 'http://localhost:5173' },
    { RATE_LIMIT_PROFILE: 'development' }
  ]) {
    const bad = launch({ ...environment, ...overrides });
    assert.notEqual((await deadline(bad.ended)).code, 0);
    assert(!bad.output().includes('backend running.'));
  }
  const worker = launch(environment, 'src/github-worker.js');
  assert.notEqual((await deadline(worker.ended)).code, 0);
  checks.push('unsafe-startup-and-disabled-production-worker-rejected');
  for (const value of [
    password,
    environment.SMTP_PASSWORD,
    environment.GITHUB_APP_CLIENT_SECRET,
    target.url
  ])
    assert(!api.output().includes(value));
  checks.push('no-secret-in-runtime-logs');
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks,
      databaseOwnershipVerified: true,
      externalEmails: 0,
      githubCalls: 0,
      ociAccess: false
    })
  );
} finally {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill('SIGKILL');
        })
    )
  );
  if (project?.id) await client.project.delete({ where: { id: project.id } });
  if (user?.id) await client.user.delete({ where: { id: user.id } });
  await client.$disconnect();
  await rm(storage, { recursive: true, force: true });
}
