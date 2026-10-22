import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { requireCondition as check } from "../../../backend/scripts/lib/oci-compatibility-safety.js";

export const cleanEnvironment = (node) => ({
  PATH: dirname(node) + ":/usr/bin:/bin",
  HOME: "/nonexistent",
  LANG: "C.UTF-8",
  TZ: "UTC",
  NODE_ENV: "production",
  MYSQL_HISTFILE: "/dev/null",
});
export function mysqlArguments(target) {
  return [
    "--defaults-file=/proc/self/fd/3",
    "--no-login-paths",
    "--protocol=TCP",
    "--host=" + target.host,
    "--port=" + target.port,
    "--ssl-mode=VERIFY_IDENTITY",
    "--ssl-ca=/etc/pki/traceflow/mysql-ca.pem",
    "--tls-version=TLSv1.2,TLSv1.3",
    "--skip-reconnect",
    "--batch",
    "--raw",
    "--skip-column-names",
    "--skip-auto-rehash",
    "--binary-mode",
    "--local-infile=0",
    "--connect-timeout=5",
    "--default-character-set=utf8mb4",
  ];
}
export function validateAdminOptions(bytes) {
  check(
    Buffer.isBuffer(bytes) && bytes.length <= 8192,
    "ADMIN_CREDENTIAL_FORMAT",
  );
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  // Only a pre-existing private option file. No writing/transformation of secrets.
  // Deliberately restrict MySQL escapes to quoted backslash and double quote.
  const match =
    /^\[client\]\nuser=traceflow_admin\npassword="((?:[^"\\\r\n]|\\["\\])+)"\n$/.exec(
      value,
    );
  check(
    match?.[0] === value &&
      ![...match[1]].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      ),
    "ADMIN_CREDENTIAL_FORMAT",
  );
}

// No shell; bounded pipes; kill the child's process group on interruption.
// W02-D validated runuser descendants in this process group on the pinned runtime.
// Deliberate daemonization/setsid escape is outside that measured scope.
// The dependency arguments are for unit tests, never CLI/environment switches.
export async function runBounded(
  spec,
  {
    spawnProcess = spawn,
    signals = process,
    killGroup = (pid) => process.kill(-pid, "SIGKILL"),
  } = {},
) {
  check(
    Number.isSafeInteger(spec.timeoutMs) &&
      spec.timeoutMs > 0 &&
      spec.timeoutMs <= 45000,
    "AUDIT_PROCESS_WINDOW_EXPIRED",
  );
  // Commands such as id and the verifier never consume stdin. Opening a pipe
  // and ending even an empty chunk can fail with EPIPE after an early exit.
  const hasInput = spec.input !== undefined && spec.input !== null;
  return new Promise((resolve, reject) => {
    let child,
      timer,
      failure,
      total = 0,
      stderrBytes = 0;
    const chunks = [];
    const stop = (code) => {
      failure ??= code;
      if (child?.pid) {
        try {
          killGroup(child.pid);
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* Exit status still cannot pass. */
          }
        }
      }
    };
    const interrupt = () => stop("AUDIT_PROCESS_INTERRUPTED");
    const cleanup = () => {
      clearTimeout(timer);
      signals.removeListener("SIGINT", interrupt);
      signals.removeListener("SIGTERM", interrupt);
    };
    try {
      child = spawnProcess(spec.command, spec.args, {
        cwd: spec.cwd,
        env: spec.env,
        detached: true,
        shell: false,
        stdio: [
          hasInput ? "pipe" : "ignore",
          "pipe",
          "pipe",
          ...(spec.credentialFd === undefined ? [] : [spec.credentialFd]),
        ],
      });
      signals.once("SIGINT", interrupt);
      signals.once("SIGTERM", interrupt);
      timer = setTimeout(() => stop("AUDIT_PROCESS_TIMEOUT"), spec.timeoutMs);
      child.stdout.on("data", (chunk) => {
        total += chunk.length;
        if (total > spec.maxBytes) stop("AUDIT_PROCESS_OUTPUT_LIMIT");
        else chunks.push(Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.length;
        total += chunk.length;
        if (total > spec.maxBytes) stop("AUDIT_PROCESS_OUTPUT_LIMIT");
      });
      if (hasInput)
        child.stdin.on("error", () => stop("AUDIT_PROCESS_INPUT_FAILED"));
      child.once("error", () => {
        cleanup();
        reject(
          Object.assign(new Error(), { code: "AUDIT_PROCESS_START_FAILED" }),
        );
      });
      child.once("close", (exitCode, signal) => {
        cleanup();
        try {
          check(!failure && !signal, failure || "AUDIT_PROCESS_SIGNAL");
          const stdout = new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          );
          resolve({ exitCode, signal: signal ?? null, stderrBytes, stdout });
        } catch (error) {
          reject(error);
        } finally {
          for (const chunk of chunks) chunk.fill(0);
        }
      });
      if (hasInput) {
        try {
          child.stdin.end(spec.input);
        } catch {
          stop("AUDIT_PROCESS_INPUT_FAILED");
        }
      }
    } catch {
      cleanup();
      stop("AUDIT_PROCESS_START_FAILED");
      reject(
        Object.assign(new Error(), { code: "AUDIT_PROCESS_START_FAILED" }),
      );
    }
  });
}
