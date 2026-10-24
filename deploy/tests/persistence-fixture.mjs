// Copy next to backend package.json in the owned public-source snapshot.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import request from "supertest";

assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.env.TEST_DATABASE_URL);
const expected = JSON.parse(await readFile(process.env.TF06_IDENTITY));
const { prisma } = await import("./src/database/prismaClient.js");
const [actual] = await prisma.$queryRawUnsafe(
  "SELECT @@server_uuid AS uuid,@@datadir AS datadir,@@port AS port,DATABASE() AS db",
);
assert.equal(actual.uuid, expected.serverUuid);
assert.equal(actual.datadir.replace(/\/$/, ""), expected.datadir);
assert.equal(Number(actual.port), expected.port);
assert.equal(actual.db, expected.schema);
assert.match(actual.db, /^tf_oci_[a-f0-9]{12}_test$/);
const { default: app } = await import("./src/app.js");
const server = createServer(app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const agent = request.agent(server);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = Buffer.from('{"synthetic":true}');
const tail = Buffer.alloc(17, "a");
let state;
try {
  if (process.argv[2] === "seed") {
    assert.equal(
      await prisma.user.count(),
      0,
      "fixture requires a fresh empty database",
    );
    const identifier = "tf06" + randomBytes(6).toString("hex"),
      password = randomBytes(24).toString("base64url") + "1aA!";
    const registered = await agent.post("/api/auth/register").send({
      name: "Synthetic recovery executor",
      username: identifier,
      email: identifier + "@example.invalid",
      password,
    });
    assert.equal(registered.status, 201);
    assert.equal(
      (
        await agent
          .post("/api/auth/email-verification/verify")
          .send({ token: registered.body.emailVerification.testToken })
      ).status,
      200,
    );
    const user = registered.body.user;
    const csrf = registered.body.csrfToken;
    const project = await prisma.project.create({
      data: {
        name: "Synthetic OCI06 recovery",
        responsibleTeam: "Isolated laboratory",
        accessCode: randomBytes(20).toString("hex"),
      },
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: "OWNER" },
    });
    const requirement = await prisma.requirement.create({
      data: {
        projectId: project.id,
        title: "Recovery integrity",
        type: "FUNCIONAL",
        status: "CADASTRADO",
      },
    });
    const sprint = await prisma.sprint.create({
      data: {
        projectId: project.id,
        name: "Synthetic sprint",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Recover coordinated evidence",
        priority: "MEDIA",
        status: "A_FAZER",
        requirementId: requirement.id,
        sprintId: sprint.id,
      },
    });
    const pr = await prisma.pullRequest.create({
      data: {
        projectId: project.id,
        githubId: randomBytes(8).toString("hex"),
        number: 6,
        title: "Synthetic PR",
      },
    });
    await prisma.gitHubSyncRun.create({
      data: {
        projectId: project.id,
        status: "SUCCEEDED",
        step: "COMPLETED",
        finishedAt: new Date(),
        requestedByUserId: user.id,
      },
    });
    const c = await agent
      .post(`/api/projects/${project.id}/test-cases`)
      .set("X-CSRF-Token", csrf)
      .send({
        requirementId: requirement.id,
        title: "Recovery case",
        preconditions: "Synthetic state",
        expectedResult: "Recovered",
        responsibleUserId: user.id,
        steps: [{ action: "Read file", expectedResult: "Same bytes" }],
      });
    assert.equal(c.status, 201);
    const testCase = c.body.testCase;
    const payload = {
      testCaseVersion: 1,
      environment: "HOMOLOGACAO",
      testedReference: { type: "PULL_REQUEST", id: pr.id },
      steps: [{ position: 1, result: "PASS" }],
    };
    const base = `/api/test-cases/${testCase.id}/execution-uploads`;
    const upload = async (data, name, complete) => {
      const r = await agent
        .post(base)
        .set("X-CSRF-Token", csrf)
        .send({
          idempotencyKey: randomUUID(),
          testCaseVersion: 1,
          files: [
            {
              name,
              field: "evidence",
              sizeBytes: data.length,
              sha256: hash(data),
            },
          ],
        });
      assert.equal(r.status, 201);
      const part = data.subarray(0, 8388608);
      const sent = await agent
        .put(`${base}/${r.body.uploadId}/files/${r.body.files[0].id}/parts/0`)
        .set("X-CSRF-Token", csrf)
        .set("Content-Type", "application/octet-stream")
        .set("X-Chunk-Offset", "0")
        .set("X-Chunk-SHA256", hash(part))
        .send(part);
      assert.equal(sent.status, 200);
      if (complete) {
        const done = await agent
          .post(`${base}/${r.body.uploadId}/complete`)
          .set("X-CSRF-Token", csrf)
          .send(payload);
        assert.equal(done.status, 200);
      }
      return r.body;
    };
    const completed = await upload(bytes, "synthetic.json", true);
    const pending = await upload(
      Buffer.alloc(8388608 + 17, "a"),
      "synthetic.txt",
      false,
    );
    state = {
      identifier,
      password,
      userId: user.id,
      projectId: project.id,
      testCaseId: testCase.id,
      payload,
      base,
      completed,
      pending,
    };
    await writeFile(process.env.TF06_FIXTURE, JSON.stringify(state), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        status: "SYNTHETIC_FIXTURE_CREATED",
        projects: 1,
        requirements: 1,
        tasks: 1,
        sprints: 1,
        completed: 1,
        pending: 1,
      }),
    );
  } else {
    state = JSON.parse(await readFile(process.env.TF06_FIXTURE));
    const login = await agent
      .post("/api/auth/login")
      .send({ identifier: state.identifier, password: state.password });
    assert.equal(login.status, 200);
    const csrf = login.body.csrfToken;
    const evidence = await prisma.testEvidence.findFirst();
    const result = await agent.get(`/api/test-evidence/${evidence.id}/content`);
    assert.equal(result.status, 200);
    assert.equal(result.text, bytes.toString());
    const pending = await agent.get(`${state.base}/${state.pending.uploadId}`);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.confirmedBytes, 8388608);
    const forbidden = await request(server).get(
      `${state.base}/${state.pending.uploadId}`,
    );
    assert.equal(forbidden.status, 401);
    const sent = await agent
      .put(
        `${state.base}/${state.pending.uploadId}/files/${state.pending.files[0].id}/parts/1`,
      )
      .set("X-CSRF-Token", csrf)
      .set("Content-Type", "application/octet-stream")
      .set("X-Chunk-Offset", "8388608")
      .set("X-Chunk-SHA256", hash(tail))
      .send(tail);
    assert.equal(sent.status, 200);
    for (let i = 0; i < 2; i++) {
      const done = await agent
        .post(`${state.base}/${state.pending.uploadId}/complete`)
        .set("X-CSRF-Token", csrf)
        .send(state.payload);
      assert.equal(done.status, 200);
    }
    assert.equal(await prisma.testEvidence.count(), 2);
    assert.equal(await prisma.testExecution.count(), 2);
    assert.equal(await prisma.project.count(), 1);
    assert.equal(await prisma.requirement.count(), 1);
    assert.equal(await prisma.task.count(), 1);
    assert.equal(await prisma.sprint.count(), 1);
    assert.equal(await prisma.gitHubSyncRun.count(), 1);
    assert.ok((await prisma.auditEvent.count()) > 0);
    assert.ok((await prisma.testCaseHistoryEntry.count()) > 0);
    console.log(
      JSON.stringify({
        status: "RESTORED_APPLICATION_SMOKE_PASS",
        login: true,
        downloadChecksum: true,
        pendingUploadResumed: true,
        idempotence: true,
        unauthorizedRejected: true,
        relations: true,
      }),
    );
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
