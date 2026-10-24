import { readFile, writeFile, chmod } from "node:fs/promises";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { productionEnvironment } from "./test/helpers/production-environment.js";
assert.equal(hostname(), "lima-tf041");
const root = "/var/tmp/tf041-lab";
const cfg = JSON.parse(await readFile(root + "/lab-private.json"));
assert.equal(cfg.schema, "traceflow_oci_041_267_test");
const database = new URL("mysql://127.0.0.1");
database.username = "tf041";
database.password = cfg.password;
database.port = String(cfg.port);
database.pathname = cfg.schema;
const url = database.toString();
const origin = "https://traceflow.test:19441";
const env = productionEnvironment({
  DATABASE_URL: url,
  FRONTEND_URL: origin,
  CORS_ALLOWED_ORIGINS: origin,
  GITHUB_SCHEDULER_ENABLED: "false",
  HTTP_HOST: "127.0.0.1",
  PORT: "3001",
  SHUTDOWN_TIMEOUT_MS: "30000",
});
for (const [key, value] of Object.entries(env))
  if (value.startsWith("https://traceflow.example"))
    env[key] = value.replace("https://traceflow.example", origin);
await writeFile(
  "/etc/traceflow/runtime.env",
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
await writeFile("/etc/traceflow/api.env", "", { mode: 0o600 });
// Persistent test guard retained in the harness. Production supervisor forbids TEST_DATABASE_URL in its environment.
Object.assign(process.env, env, { NODE_ENV: "test", TEST_DATABASE_URL: url });
const { prisma } = await import("./src/database/prismaClient.js");
const [identity] =
  await prisma.$queryRaw`SELECT VERSION() AS version, @@datadir AS datadir, @@port AS port, DATABASE() AS db`;
assert.equal(identity.db, cfg.schema);
assert.equal(Number(identity.port), cfg.port);
assert.equal(identity.datadir, root + "/mysql-data/");
assert.equal(identity.version, "26.7.0");
const { hash } = await import("argon2");
const password = randomBytes(20).toString("hex");
const user = await prisma.user.create({
  data: {
    name: "Executor de laboratório",
    username: "tf041" + randomBytes(6).toString("hex"),
    email: randomBytes(8).toString("hex") + "@lab.invalid",
    passwordHash: await hash(password),
    emailVerifiedAt: new Date(),
  },
});
const project = await prisma.project.create({
  data: {
    name: "Laboratório OCI 04.1",
    responsibleTeam: "QA isolado",
    accessCode: randomBytes(20).toString("hex"),
  },
});
await prisma.projectMembership.create({
  data: { projectId: project.id, userId: user.id, role: "OWNER" },
});
const requirement = await prisma.requirement.create({
  data: {
    projectId: project.id,
    title: "Integridade do transporte",
    type: "FUNCIONAL",
    status: "CADASTRADO",
  },
});
const pr = await prisma.pullRequest.create({
  data: {
    projectId: project.id,
    githubId: randomBytes(8).toString("hex"),
    number: 41,
    title: "Validação isolada",
  },
});
const { testCaseService } =
  await import("./src/modules/testCases/services/test-case.service.js");
const cases = {};
for (const title of [
  "Simples",
  "Limite agregado",
  "Retomada",
  "Cancelamento",
  "Falha resposta",
])
  cases[title] = await testCaseService.create(
    project.id,
    {
      title,
      preconditions: "Dados sintéticos",
      expectedResult: "Bytes preservados",
      responsibleUserId: user.id,
      requirementId: requirement.id,
      steps: [{ action: "Executar cenário", expectedResult: "Concluir" }],
    },
    { actorUserId: user.id },
  );
await writeFile(
  root + "/e2e-private.json",
  JSON.stringify({
    identifier: user.username,
    password,
    userId: user.id,
    projectId: project.id,
    prId: pr.id,
    cases,
  }),
  { mode: 0o600 },
);
await chmod(root + "/e2e-private.json", 0o600);
await writeFile(
  root + "/e2e-identity.json",
  JSON.stringify({ ...identity, port: "isolated-loopback" }),
);
await prisma.$disconnect();
console.log("Synthetic fixture and isolated MySQL identity verified");
