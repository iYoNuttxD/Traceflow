import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import request from "supertest";
assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.env.TEST_DATABASE_URL);
const expected = JSON.parse(await readFile(process.env.TF06_IDENTITY));
const state = JSON.parse(await readFile(process.env.TF06_FIXTURE));
const { prisma } = await import("./src/database/prismaClient.js");
const [id] = await prisma.$queryRawUnsafe(
  "SELECT @@server_uuid AS uuid,@@datadir AS datadir,DATABASE() AS db",
);
assert.equal(id.uuid, expected.serverUuid);
assert.equal(id.datadir.replace(/\/$/, ""), expected.datadir);
assert.equal(id.db, expected.schema);
const { default: app } = await import("./src/app.js");
const server = createServer(app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { createGithubSyncScheduler } =
  await import("./src/modules/github/services/github-sync-scheduler.service.js");
const { githubSyncRunRepository } =
  await import("./src/modules/github/github-sync-run.repository.js");
const { evidenceUploadService } =
  await import("./src/modules/testCases/services/evidence-upload.service.js");
let now = new Date();
const quiet = { info() {}, warn() {}, error() {} };
const worker = createGithubSyncScheduler({
  enabled: true,
  configured: () => true,
  now: () => now,
  log: quiet,
});
let release, partWork, run;
const tail = Buffer.alloc(17, "a"),
  checksum = createHash("sha256").update(tail).digest("hex");
const actor = { actorUserId: state.userId };
const emit = (phase, data = {}) =>
  console.log(JSON.stringify({ protocol: "OCI06_OUTAGE", phase, ...data }));
try {
  assert.equal((await request(server).get("/health/ready")).status, 200);
  run = await prisma.gitHubSyncRun.create({
    data: {
      projectId: state.projectId,
      activeProjectId: state.projectId,
      status: "RUNNING",
      step: "COMMITS",
      heartbeatAt: now,
      startedAt: now,
    },
  });
  await worker.tick();
  assert.ok((await prisma.gitHubSchedulerWorker.count()) > 0);
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const stream = Readable.from(
    (async function* () {
      yield tail;
      emit("part-written", { leaseWaitMs: 92000 });
      await gate;
    })(),
  );
  partWork = evidenceUploadService
    .part(
      state.testCaseId,
      state.pending.uploadId,
      state.pending.files[0].id,
      1,
      stream,
      { sha256: checksum, offset: 8388608 },
      actor,
    )
    .then(
      () => ({ accepted: true }),
      (error) => ({ accepted: false, code: error.code }),
    );
  for await (const line of createInterface({ input: process.stdin })) {
    const command = JSON.parse(line).command;
    if (command === "down") {
      release();
      const part = await partWork;
      assert.equal(part.accepted, false);
      assert.equal((await request(server).get("/health/live")).status, 200);
      assert.equal((await request(server).get("/health/ready")).status, 503);
      await assert.rejects(worker.tick());
      assert.ok(
        (
          await readdir(
            process.env.TEST_EVIDENCE_STORAGE_DIR +
              "/.uploads/" +
              state.pending.uploadId,
          )
        ).some((name) => name.startsWith("part-")),
      );
      emit("degraded", {
        liveness: 200,
        readiness: 503,
        partCommitted: false,
        workerTickRejected: true,
      });
    } else if (command === "up") {
      assert.equal((await request(server).get("/health/ready")).status, 200);
      assert.equal(
        (await prisma.gitHubSyncRun.findUnique({ where: { id: run.id } }))
          .status,
        "RUNNING",
      );
      now = new Date(Date.now() + 31 * 60000);
      await worker.tick();
      assert.equal(
        (await prisma.gitHubSyncRun.findUnique({ where: { id: run.id } }))
          .errorCode,
        "GITHUB_SYNC_STALE",
      );
      assert.equal(
        await githubSyncRunRepository.updateProgress(run.id, {
          commitsCreated: 999,
        }),
        false,
      );
      assert.ok((await prisma.gitHubSchedulerWorker.count()) > 0);
      assert.equal(await prisma.testEvidence.count(), 1);
      emit("reconnected", {
        readiness: 200,
        workerHeartbeat: true,
        staleWriterRejected: true,
        falseSuccess: false,
      });
    } else if (command === "resume") {
      const status = await evidenceUploadService.status(
        state.testCaseId,
        state.pending.uploadId,
        actor,
      );
      assert.equal(status.confirmedBytes, 8388608);
      await assert.rejects(
        evidenceUploadService.status(state.testCaseId, state.pending.uploadId, {
          actorUserId: state.userId + 999,
        }),
      );
      await evidenceUploadService.part(
        state.testCaseId,
        state.pending.uploadId,
        state.pending.files[0].id,
        1,
        Readable.from([tail]),
        { sha256: checksum, offset: 8388608 },
        actor,
      );
      for (let i = 0; i < 2; i++)
        await evidenceUploadService.complete(
          state.testCaseId,
          state.pending.uploadId,
          state.payload,
          actor,
        );
      assert.equal(await prisma.testEvidence.count(), 2);
      assert.equal(await prisma.testExecution.count(), 2);
      emit("recovered", {
        uploadResumed: true,
        idempotence: true,
        authorizationEnforced: true,
        confirmedFilesPreserved: true,
      });
      break;
    } else throw new Error("UNKNOWN_LAB_COMMAND");
  }
} finally {
  release?.();
  await partWork;
  await worker.stop();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
