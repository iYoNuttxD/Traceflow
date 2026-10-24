import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_PLAN,
  administrativeSql,
  validateAdministrativeCollection,
  canonical,
  digest,
  exact,
} from "../../backend/scripts/lib/heatwave-admin-audit.js";
import {
  EVIDENCE_BASE,
  validateAuditAuthorization,
  validateAdministrativeEvidence,
  validatePrismaEvidence,
  administrativePayload,
  envelope,
  consolidateEvidence,
  requireValidatedAdministrativeRuntime,
} from "../../backend/scripts/lib/heatwave-audit-evidence.js";
import {
  ManualCustody,
  INPUT_BASE,
  OPERATIONS,
  STAGE_BY_OPERATION,
  validId,
  validateReceipt,
} from "../../backend/scripts/lib/heatwave-manual-custody.js";
import { parseRoleAttestationJson } from "../../backend/scripts/lib/heatwave-role-attestation.js";
import {
  publicCaContract,
  verifyManagedDns,
  diagnosticFailure,
  isDiagnosticPhase,
} from "../../backend/scripts/lib/heatwave-connection.js";
import { requireCondition as check } from "../../backend/scripts/lib/oci-compatibility-safety.js";
import {
  cleanEnvironment,
  mysqlArguments,
  validateAdminOptions,
  runBounded,
} from "./lib/heatwave-manual-process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CA = "/etc/pki/traceflow/mysql-ca.pem";
const control = EVIDENCE_BASE + "/control";
const strictJson = (text) => parseRoleAttestationJson(text);
const docPath = (auth, stage) =>
  EVIDENCE_BASE + "/" + auth.administrativeAudit.evidenceIds[stage] + ".json";
const runPath = (auth) => control + "/" + auth.administrativeAudit.runId;
const inputPath = (id, suffix) => INPUT_BASE + "/" + id + "." + suffix;

export function validateManualArguments(values) {
  exact(values, ["operation", "run-id", "manifest-sha256"]);
  check(
    OPERATIONS.includes(values.operation) &&
      validId(values["run-id"]) &&
      typeof values["manifest-sha256"] === "string" &&
      /^[a-f0-9]{64}$/.exec(values["manifest-sha256"])?.[0] ===
        values["manifest-sha256"],
    "AUDIT_ARGUMENTS_INVALID",
  );
}
export function requireAdministrativeHost(platform, uid) {
  check(
    platform === "linux" && uid === 0,
    "ADMINISTRATIVE_LINUX_ROOT_REQUIRED",
  );
}
export function validatePrismaCapture(result, auth, initial) {
  check(
    result.signal === null && result.stderrBytes === 0,
    "PRISMA_CAPTURE_FAILED",
  );
  const doc = strictJson(result.stdout);
  if (doc.status === "FAIL") {
    const allowed = [
      "status",
      "code",
      "phase",
      "mysqlCode",
      "writes",
      "packageId",
    ];
    check(
      Object.keys(doc).every((k) => allowed.includes(k)) &&
        doc.writes === false &&
        (doc.packageId === undefined ||
          doc.packageId === initial.package.packageId),
      "PRISMA_CAPTURE_INVALID",
    );
    const safe = diagnosticFailure(
      { code: doc.code, meta: { code: doc.mysqlCode } },
      doc.phase,
    );
    // No raw server message, SQL, stderr or untrusted error object is propagated.
    throw Object.assign(new Error(), {
      code: safe.code,
      phase: safe.phase,
      ...(safe.mysqlCode ? { meta: { code: safe.mysqlCode } } : {}),
    });
  }
  check(result.exitCode === 0, "PRISMA_CAPTURE_FAILED");
  validatePrismaEvidence(doc, auth, initial.package, initial);
  return doc;
}
export function verifyPrefix(chain, auth, binding, count, now = Date.now()) {
  check(
    Array.isArray(chain) && chain.length === count,
    "AUDIT_CHAIN_INCOMPLETE",
  );
  let previousReceipt = null;
  for (let i = 0; i < count; i++) {
    const { document, receipt, attempt } = chain[i];
    if (i === 0) {
      validateAdministrativeEvidence(
        document,
        auth,
        "ADMIN_INITIAL",
        binding,
        null,
        now,
      );
      check(
        digest(document) === auth.administrativeAudit.initialSha256,
        "ADMIN_INITIAL_HASH_MISMATCH",
      );
    } else if (i === 1)
      validatePrismaEvidence(document, auth, binding, chain[0].document, now);
    else
      validateAdministrativeEvidence(
        document,
        auth,
        "ADMIN_FINAL",
        binding,
        chain[1].document,
        now,
      );
    validateReceipt(
      receipt,
      attempt,
      document,
      auth,
      OPERATIONS[i],
      previousReceipt,
    );
    previousReceipt = receipt;
  }
}

// Exactly one explicitly selected operation. It never invokes executeManual again,
// schedules a next step, unlocks an account, or runs SQL except through io.collect.
export async function executeManual(
  operation,
  authorization,
  binding,
  io,
  now = () => Date.now(),
) {
  check(OPERATIONS.includes(operation), "AUDIT_OPERATION_INVALID");
  const auth = structuredClone(authorization);
  validateAuditAuthorization(
    auth,
    binding,
    now(),
    operation === "collect-initial",
  );
  if (operation === "collect-initial")
    check(
      auth.administrativeAudit.initialSha256 === null,
      "AUDIT_INITIAL_ALREADY_BOUND",
    );
  await io.requireVerifiedRuntime();
  const index = OPERATIONS.indexOf(operation);
  const chain = index === 0 ? [] : await io.loadChain(auth, index);
  verifyPrefix(chain, auth, binding, index, now());
  const previousReceipt = chain.at(-1)?.receipt ?? null;
  const attempt = {
    formatVersion: 1,
    operation,
    runId: auth.administrativeAudit.runId,
    authorizationId: auth.administrativeAudit.authorizationId,
    package: binding,
    startedAt: new Date(now()).toISOString(),
    previousReceiptSha256:
      previousReceipt === null ? null : digest(previousReceipt),
  };
  await io.claim(auth, attempt);
  try {
    let document;
    if (operation === "collect-initial" || operation === "collect-final") {
      const result = await io.collect(auth);
      const observations = validateAdministrativeCollection(
        result,
        auth.target,
      );
      document = envelope(
        auth,
        STAGE_BY_OPERATION[operation],
        administrativePayload(observations, auth),
        chain.at(-1)?.document ?? null,
        attempt.startedAt,
        new Date(now()).toISOString(),
      );
      if (index === 0)
        auth.administrativeAudit.initialSha256 = digest(document);
      validateAdministrativeEvidence(
        document,
        auth,
        STAGE_BY_OPERATION[operation],
        binding,
        chain.at(-1)?.document ?? null,
        now(),
      );
      if (index === 2)
        check(
          document.payload.stateSha256 ===
            chain[0].document.payload.stateSha256 &&
            document.payload.collectionId !==
              chain[0].document.payload.collectionId,
          "ADMIN_STATE_CHANGED",
        );
    } else if (operation === "capture-prisma") {
      document = validatePrismaCapture(
        await io.capture(auth),
        auth,
        chain[0].document,
      );
      // The child's clock must fall within this unique parent attempt.
      check(
        Date.parse(document.startedAt) >= Date.parse(attempt.startedAt),
        "PRISMA_CAPTURE_TIME_INVALID",
      );
    } else {
      const closure = await io.closure(auth);
      document = consolidateEvidence(
        {
          initial: chain[0].document,
          prisma: chain[1].document,
          final: chain[2].document,
          closure,
        },
        auth,
        binding,
        now(),
      );
    }
    await io.requireVerifiedRuntime();
    validateAuditAuthorization(auth, binding, now());
    // A receipt binds the producer attempt separately from the child timestamps.
    const receipt = {
      formatVersion: 1,
      operation,
      runId: attempt.runId,
      authorizationId: attempt.authorizationId,
      package: binding,
      attemptSha256: digest(attempt),
      documentSha256: digest(document),
      previousReceiptSha256: attempt.previousReceiptSha256,
    };
    await io.persist(auth, attempt, document, receipt);
    return {
      status: operation === "verify-offline" ? "PASS" : "EVIDENCE_RECORDED",
      final: operation === "verify-offline",
      writes: false,
      stage: STAGE_BY_OPERATION[operation],
      runId: attempt.runId,
      evidenceId: document.evidenceId,
      sha256: digest(document),
      ...(operation === "verify-offline"
        ? { limitations: document.payload }
        : {}),
    };
  } catch (error) {
    try {
      await io.recordFailure(
        auth,
        attempt,
        diagnosticFailure(error, error?.phase),
      );
    } catch {
      /* Keep the primary error. Claim remains consumed. */
    }
    throw error;
  }
}

// Close every descriptor even if one close fails; never replace a primary failure.
async function closePinned(primary, ...files) {
  let failed = false;
  for (const file of files.filter(Boolean)) {
    file.bytes.fill(0);
    try {
      await file.close();
    } catch {
      failed = true;
    }
  }
  if (!primary) check(!failed, "AUDIT_FILE_CLOSE_FAILED");
}

export function createAdministrativeIO(
  store,
  {
    uid,
    gid,
    packageRoot,
    node,
    mysql = "/usr/bin/mysql",
    runuser = "/usr/sbin/runuser",
    run = runBounded,
    dns = verifyManagedDns,
    validateCa = publicCaContract,
    runtime = requireValidatedAdministrativeRuntime,
  },
) {
  const env = cleanEnvironment(node);
  const baseSpec = { cwd: packageRoot, env, timeoutMs: 30000, maxBytes: 65536 };
  const privateJson = async (auth, suffix) =>
    store.json(
      inputPath(auth.administrativeAudit.runId, suffix),
      [0o400, 0o600],
    );
  return {
    async loadChain(auth, count) {
      const entries = [];
      for (let i = 0; i < count; i++) {
        const op = OPERATIONS[i];
        entries.push({
          document: await store.json(docPath(auth, STAGE_BY_OPERATION[op])),
          attempt: await store.json(
            runPath(auth) + "/" + op + ".attempt.json",
            [0o400],
          ),
          receipt: await store.json(
            runPath(auth) + "/" + op + ".receipt.json",
            [0o400],
          ),
        });
      }
      return entries;
    },
    async claim(auth, attempt) {
      if (attempt.operation === "collect-initial") {
        await store.directory(control);
        await store.publish(
          control +
            "/" +
            auth.administrativeAudit.authorizationId +
            ".reserved.json",
          { runId: attempt.runId, authorizationId: attempt.authorizationId },
          { gid: 0, mode: 0o400 },
        );
        await store.directory(runPath(auth), true);
      }
      const reserved = await store.json(
        control +
          "/" +
          auth.administrativeAudit.authorizationId +
          ".reserved.json",
        [0o400],
      );
      exact(reserved, ["runId", "authorizationId"]);
      check(
        reserved.runId === attempt.runId &&
          reserved.authorizationId === attempt.authorizationId,
        "AUDIT_AUTHORIZATION_REUSED",
      );
      await store.publish(
        runPath(auth) + "/" + attempt.operation + ".attempt.json",
        attempt,
        { gid: 0, mode: 0o400 },
      );
    },
    async collect(auth) {
      validateAuditAuthorization(
        auth,
        auth.administrativeAudit.package,
        Date.now(),
        true,
      );
      await dns(auth.target);
      const ca = await store.openProtected(CA, {
        modes: [0o444, 0o644],
        maxBytes: 65536,
      });
      let credential, primary;
      try {
        validateCa(ca.bytes.toString("utf8"), auth.target.caSha256);
        validateAuditAuthorization(
          auth,
          auth.administrativeAudit.package,
          Date.now(),
          true,
        );
        credential = await store.openProtected(
          inputPath(auth.administrativeAudit.runId, "admin.cnf"),
          { maxBytes: 8192 },
        );
        validateAdminOptions(credential.bytes);
        validateAuditAuthorization(
          auth,
          auth.administrativeAudit.package,
          Date.now(),
          true,
        );
        const result = await run({
          ...baseSpec,
          timeoutMs: Math.min(
            baseSpec.timeoutMs,
            Date.parse(auth.expiresAt) - Date.now(),
          ),
          command: mysql,
          args: mysqlArguments(auth.target),
          input: administrativeSql(),
          credentialFd: credential.file.fd,
        });
        await credential.recheck();
        await ca.recheck();
        return result;
      } catch (error) {
        primary = error;
        throw error;
      } finally {
        await closePinned(primary, credential, ca);
      }
    },
    async capture(auth) {
      validateAuditAuthorization(auth, auth.administrativeAudit.package);
      const id = auth.administrativeAudit.runId;
      const copyPath = inputPath(id, "prisma-authorization.json");
      const copy = await store.openProtected(copyPath, { uid, modes: [0o600] });
      let credential, primary;
      try {
        check(
          canonical(strictJson(copy.bytes.toString("utf8"))) ===
            canonical(auth),
          "AUDIT_AUTHORIZATION_MISMATCH",
        );
        validateAuditAuthorization(auth, auth.administrativeAudit.package);
        credential = await store.openProtected(
          inputPath(id, "prisma-password.json"),
          { uid, modes: [0o600], maxBytes: 8192 },
        );
        // Only the existing non-root launcher interprets the credential. Parent
        // pins/checks this protected file but neither serializes nor logs it.
        validateAuditAuthorization(auth, auth.administrativeAudit.package);
        const result = await run({
          ...baseSpec,
          timeoutMs: Math.min(45000, Date.parse(auth.expiresAt) - Date.now()),
          maxBytes: 16384,
          command: runuser,
          args: [
            "-u",
            "traceflow",
            "--",
            node,
            packageRoot + "/deploy/scripts/diagnostic-launcher.mjs",
            "--authorization",
            copyPath,
            "--credential-file",
            inputPath(id, "prisma-password.json"),
            "--manifest-sha256",
            auth.administrativeAudit.package.manifestSha256,
            "--ca-file",
            CA,
          ],
        });
        await copy.recheck();
        await credential.recheck();
        return result;
      } catch (error) {
        primary = error;
        throw error;
      } finally {
        await closePinned(primary, credential, copy);
      }
    },
    closure: (auth) => privateJson(auth, "closure.json"),
    requireVerifiedRuntime: runtime,
    async persist(auth, attempt, document, receipt) {
      if (attempt.operation === "collect-initial") {
        await store.publish(
          EVIDENCE_BASE + "/" + attempt.runId + ".authorization.json",
          auth,
        );
        await store.publish(
          inputPath(attempt.runId, "prisma-authorization.json"),
          auth,
          { uid, gid, mode: 0o600 },
        );
      }
      await store.publish(docPath(auth, document.stage), document);
      await store.publish(
        runPath(auth) + "/" + attempt.operation + ".receipt.json",
        receipt,
        { gid: 0, mode: 0o400 },
      );
    },
    recordFailure: (auth, attempt, failure) =>
      store.publish(
        runPath(auth) + "/" + attempt.operation + ".failure.json",
        {
          ...failure,
          operation: attempt.operation,
          runId: attempt.runId,
          attemptSha256: digest(attempt),
        },
        { gid: 0, mode: 0o400 },
      ),
  };
}

async function main() {
  try {
    requireAdministrativeHost(process.platform, process.getuid());
    const { values } = parseArgs({
      options: {
        operation: { type: "string" },
        "run-id": { type: "string" },
        "manifest-sha256": { type: "string" },
      },
    });
    validateManualArguments(values);
    check(
      process.versions.node.startsWith("22.") &&
        root.startsWith("/opt/traceflow-diagnostics/"),
      "AUDIT_PACKAGE_LOCATION",
    );
    check(
      !Object.keys(process.env).some(
        (k) =>
          /^(NODE_|PRISMA_|MYSQL_|LD_|DYLD_)/.test(k) ||
          /DATABASE_URL$/.test(k),
      ),
      "INHERITED_ENVIRONMENT_REFUSED",
    );
    const env = cleanEnvironment(process.execPath);
    const id = async (flag) => {
      const r = await runBounded({
        command: "/usr/bin/id",
        args: [flag, "traceflow"],
        cwd: root,
        env,
        timeoutMs: 3000,
        maxBytes: 64,
      });
      check(
        r.exitCode === 0 &&
          r.stderrBytes === 0 &&
          /^[1-9][0-9]*\n$/.test(r.stdout),
        "AUDIT_SERVICE_ID_INVALID",
      );
      return Number(r.stdout.trim());
    };
    const uid = await id("-u"),
      gid = await id("-g");
    const store = new ManualCustody(gid);
    await store.directory(EVIDENCE_BASE);
    await store.directory(INPUT_BASE);
    // Protected package/tool paths and independently supplied manifest hash.
    const node = await store.program(process.execPath);
    const python = await store.program("/usr/bin/python3");
    await store.program(root + "/diagnostic-tool.py", false);
    const mysql = values.operation.startsWith("collect-")
      ? await store.program("/usr/bin/mysql")
      : undefined;
    const runuser =
      values.operation === "capture-prisma"
        ? await store.program("/usr/sbin/runuser")
        : undefined;
    const integrity = await runBounded({
      command: python,
      args: [
        "-I",
        root + "/diagnostic-tool.py",
        "verify",
        "--root",
        root,
        "--manifest-sha256",
        values["manifest-sha256"],
      ],
      cwd: root,
      env,
      timeoutMs: 10000,
      maxBytes: 16384,
    });
    check(
      integrity.exitCode === 0 && integrity.stderrBytes === 0,
      "PACKAGE_INTEGRITY_FAILED",
    );
    const verified = strictJson(integrity.stdout);
    check(
      verified.status === "VERIFIED" &&
        root === "/opt/traceflow-diagnostics/" + verified.packageId,
      "PACKAGE_INTEGRITY_FAILED",
    );
    const binding = {
      packageId: verified.packageId,
      manifestSha256: values["manifest-sha256"],
    };
    const auth = await store.json(
      values.operation === "collect-initial"
        ? inputPath(values["run-id"], "authorization.json")
        : EVIDENCE_BASE + "/" + values["run-id"] + ".authorization.json",
    );
    check(
      auth.administrativeAudit?.runId === values["run-id"],
      "AUDIT_RUN_MISMATCH",
    );
    const result = await executeManual(
      values.operation,
      auth,
      binding,
      createAdministrativeIO(store, {
        uid,
        gid,
        packageRoot: root,
        node,
        mysql,
        runuser,
      }),
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(
      JSON.stringify(
        diagnosticFailure(
          error,
          isDiagnosticPhase(error?.phase) ? error.phase : "PREVALIDATION",
        ),
      ),
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();

// Exported inventory supports static contract tests; it does not execute SQL.
export const queryCount = ADMIN_PLAN.length;
