import { parseArgs } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  protectedFile,
  connectionContract,
  isDiagnosticCode,
  isDiagnosticPhase,
  sanitizedMysqlCode,
} from "../../backend/scripts/lib/heatwave-connection.js";
import { validateRuntime } from "./diagnostic-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const forbidden = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "TEST_RUNTIME_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "RUNTIME_DATABASE_URL",
  "HEATWAVE_DIAGNOSTIC_DATABASE_URL",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PRISMA_QUERY_ENGINE_LIBRARY",
  "PRISMA_QUERY_ENGINE_BINARY",
  "PRISMA_SCHEMA_ENGINE_BINARY",
  "PRISMA_CLIENT_ENGINE_TYPE",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
];
function check(ok, code) {
  if (!ok) throw Object.assign(new Error(), { code });
}

async function run(args, environment) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      bytes = 0,
      failure;
    const stop = (code) => {
      failure = code;
      child.kill("SIGKILL");
    };
    const interrupted = () => stop("DIAGNOSTIC_INTERRUPTED");
    process.once("SIGTERM", interrupted);
    process.once("SIGINT", interrupted);
    const deadline = setTimeout(() => stop("LAUNCHER_DEADLINE"), 35000);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) stop("DIAGNOSTIC_OUTPUT_LIMIT");
      else output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) stop("DIAGNOSTIC_OUTPUT_LIMIT");
      // Child stderr is intentionally not forwarded; no raw engine or server errors.
    });
    const clean = () => {
      clearTimeout(deadline);
      process.removeListener("SIGTERM", interrupted);
      process.removeListener("SIGINT", interrupted);
    };
    child.once("error", () => {
      clean();
      reject(Object.assign(new Error(), { code: "DIAGNOSTIC_START_FAILED" }));
    });
    child.once("close", (code, signal) => {
      clean();
      if (failure || signal)
        reject(
          Object.assign(new Error(), { code: failure || "DIAGNOSTIC_SIGNAL" }),
        );
      else accept({ code, output });
    });
  });
}

export function sanitizedResult(result, password) {
  check(
    !result.output.includes(password) &&
      !result.output.includes(encodeURIComponent(password)) &&
      !/mysql:\/\//i.test(result.output),
    "DIAGNOSTIC_OUTPUT_REFUSED",
  );
  const diagnostic = JSON.parse(result.output);
  check(
    diagnostic &&
      !Array.isArray(diagnostic) &&
      ["PASS", "FAIL", "CONFIG_VALID"].includes(diagnostic.status),
    "DIAGNOSTIC_OUTPUT_REFUSED",
  );
  check(
    result.code === 0
      ? ["PASS", "CONFIG_VALID"].includes(diagnostic.status)
      : diagnostic.status === "FAIL",
    "DIAGNOSTIC_EXIT_MISMATCH",
  );
  const allowedFields = {
    FAIL: ["status", "code", "phase", "mysqlCode", "writes"],
    CONFIG_VALID: ["status", "connected", "mode"],
    PASS: [
      "formatVersion",
      "status",
      "mode",
      "checkedAt",
      "version",
      "prisma",
      "ca",
      "serverIdentityVerified",
      "effectiveUserVerified",
      "tls",
      "tlsSession",
      "grants",
      "roleVerification",
      "parameters",
      "pool",
      "writes",
      "disconnected",
    ],
  };
  check(
    Object.keys(diagnostic).every((key) =>
      allowedFields[diagnostic.status].includes(key),
    ),
    "DIAGNOSTIC_OUTPUT_REFUSED",
  );
  if (diagnostic.status === "FAIL") {
    check(
      isDiagnosticCode(diagnostic.code) &&
        isDiagnosticPhase(diagnostic.phase) &&
        diagnostic.writes === false,
      "DIAGNOSTIC_OUTPUT_REFUSED",
    );
    if (Object.hasOwn(diagnostic, "mysqlCode"))
      check(
        typeof diagnostic.mysqlCode === "string" &&
          sanitizedMysqlCode(diagnostic.mysqlCode) === diagnostic.mysqlCode,
        "DIAGNOSTIC_OUTPUT_REFUSED",
      );
  }
  return diagnostic;
}

async function main() {
  try {
    check(process.getuid() !== 0, "UNPRIVILEGED_USER_REQUIRED");
    check(
      !forbidden.some((name) => Object.hasOwn(process.env, name)),
      "INHERITED_ENVIRONMENT_REFUSED",
    );
    const { values } = parseArgs({
      options: {
        authorization: { type: "string" },
        "credential-file": { type: "string" },
        "manifest-sha256": { type: "string" },
        "validate-only": { type: "boolean" },
        "ca-file": { type: "string" },
      },
    });
    check(
      /^[a-f0-9]{64}$/.test(values["manifest-sha256"] || ""),
      "EXPECTED_MANIFEST_REQUIRED",
    );
    const cleanEnvironment = {
      PATH: dirname(process.execPath) + ":/usr/bin:/bin",
      HOME: "/nonexistent",
      LANG: "C.UTF-8",
      TZ: "UTC",
      NODE_ENV: "production",
    };
    const verification = spawnSync(
      "/usr/bin/python3",
      [
        "-I",
        resolve(root, "diagnostic-tool.py"),
        "verify",
        "--root",
        root,
        "--manifest-sha256",
        values["manifest-sha256"],
      ],
      {
        env: cleanEnvironment,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
    );
    check(verification.status === 0, "PACKAGE_INTEGRITY_FAILED");
    const receipt = JSON.parse(verification.stdout);
    check(receipt.status === "VERIFIED", "PACKAGE_INTEGRITY_FAILED");
    validateRuntime();

    const authorization = JSON.parse(
      await protectedFile(values.authorization, { privateFile: true }),
    );
    check(authorization.role === "diagnostic", "DIAGNOSTIC_ROLE_REQUIRED");
    const managed = authorization.mode === "oci-read-only";
    check(managed || authorization.mode === "local-isolated", "MODE_REQUIRED");
    if (managed)
      check(
        authorization.target?.user === "traceflow_diag" &&
          authorization.target?.schema === "traceflow",
        "DIAGNOSTIC_ACCOUNT_REQUIRED",
      );
    // Verify approval/target without opening the credential file first.
    const target = authorization.target;
    check(target && typeof target.host === "string", "TARGET_REQUIRED");
    const url = new URL("mysql://" + target.host);
    url.port = String(target.port);
    url.pathname = "/" + target.schema;
    url.username = encodeURIComponent(target.user);
    // Non-secret sentinel only for contract validation; never used to connect.
    url.password = "CONTRACT_VALIDATION_ONLY";
    for (const [name, value] of Object.entries({
      sslaccept: "strict",
      sslcert: values["ca-file"] || "/etc/pki/traceflow/mysql-ca.pem",
      connection_limit: "1",
      connect_timeout: "5",
      pool_timeout: "5",
      socket_timeout: "10",
    }))
      url.searchParams.set(name, value);
    const variable = managed
      ? "HEATWAVE_DIAGNOSTIC_DATABASE_URL"
      : "TEST_DATABASE_URL";
    connectionContract({ [variable]: url.toString() }, authorization);

    const secret = JSON.parse(
      await protectedFile(values["credential-file"], { privateFile: true }),
    );
    check(
      Object.keys(secret).length === 1 &&
        typeof secret.password === "string" &&
        secret.password.length > 0 &&
        secret.password.length <= 4096 &&
        !/[\u0000-\u001f\u007f]/.test(secret.password),
      "CREDENTIAL_FORMAT",
    );
    url.password = encodeURIComponent(secret.password);
    const environment = { ...cleanEnvironment, [variable]: url.toString() };
    connectionContract(environment, authorization);
    const args = [
      resolve(root, "backend/scripts/validate-oci-heatwave-connection.js"),
      "--authorization",
      values.authorization,
    ];
    if (values["validate-only"]) args.push("--validate-only");
    const result = await run(args, environment);
    const diagnostic = sanitizedResult(result, secret.password);
    console.log(
      JSON.stringify({ ...diagnostic, packageId: receipt.packageId }),
    );
    process.exitCode = result.code === 0 ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        status: "FAIL",
        code: /^[A-Z0-9_]+$/.test(error.code || "")
          ? error.code
          : "LAUNCHER_FAILED",
        writes: false,
      }),
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
