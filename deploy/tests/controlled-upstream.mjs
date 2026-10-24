// Disposable Linux harness ONLY. Real Express, CORS/CSRF/security middleware,
// HMAC verifier and graceful shutdown; synthetic auth/delivery state, no database.
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { productionEnvironment } from "../../backend/test/helpers/production-environment.js";
if (process.env.TF04_DISPOSABLE !== "local-oracle-linux-fixture")
  throw new Error("TEST_ONLY");
Object.assign(
  process.env,
  productionEnvironment({
    FRONTEND_URL: "https://traceflow.dev",
    CORS_ALLOWED_ORIGINS: "https://traceflow.dev",
    GITHUB_APP_WEBHOOK_SECRET: process.env.TF04_WEBHOOK_SECRET,
    TEST_EVIDENCE_STORAGE_DIR: "/var/lib/traceflow/test-evidence",
  }),
);
const { default: express } =
  await import("../../backend/node_modules/express/index.js");
const { createCsrfMiddleware } =
  await import("../../backend/src/middlewares/auth/csrf.middleware.js");
const { createCorsMiddleware } =
  await import("../../backend/src/shared/security/cors.js");
const { createSecurityHeadersMiddleware } =
  await import("../../backend/src/shared/security/headers.js");
const { githubAppService } =
  await import("../../backend/src/modules/github/github-app.service.js");
const { createGracefulShutdown } =
  await import("../../backend/src/shared/runtime/graceful-shutdown.js");
const { env } = await import("../../backend/src/config/env.js");
const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(createSecurityHeadersMiddleware(env));
app.use(createCorsMiddleware(env));
const deliveries = new Set(),
  streams = new Set();
let csrfToken = randomBytes(24).toString("hex");
let token = randomBytes(24).toString("hex");
const authenticate = (req, res, next) => {
  if (req.get("cookie") !== `traceflow_session=${token}`)
    return res.status(401).json({ code: "AUTHENTICATION_REQUIRED" });
  req.auth = { session: { id: "synthetic" } };
  next();
};
app.post("/api/auth/login", express.json(), (req, res) => {
  res.cookie("traceflow_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  res.json({ csrfToken, path: req.path });
});
app.post(
  "/api/mutation",
  authenticate,
  createCsrfMiddleware({
    service: { verifyCsrf: (_session, value) => value === csrfToken },
  }),
  (req, res) => res.json({ ok: true }),
);
app.post(
  "/api/webhooks/github-app",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res) => {
    if (
      !githubAppService.verifyWebhookSignature(
        req.body,
        req.get("X-Hub-Signature-256"),
      )
    )
      return res.status(403).json({ accepted: false });
    if (!req.get("X-GitHub-Delivery") || !req.get("X-GitHub-Event"))
      return res.status(400).json({ accepted: false });
    const duplicate = deliveries.has(req.get("X-GitHub-Delivery"));
    deliveries.add(req.get("X-GitHub-Delivery"));
    res.status(duplicate ? 200 : 202).json({
      duplicate,
      digest: createHash("sha256").update(req.body).digest("hex"),
    });
  },
);
app.get("/api/projects/:id/events", authenticate, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
  });
  res.flushHeaders();
  streams.add(res);
  res.write("retry: 3000\n\n");
  // Real 25s heartbeat. No X-Accel-Buffering hint: tests the Nginx directive itself.
  const timer = setInterval(() => res.write(": heartbeat\n\n"), 25000);
  res.on("close", () => {
    clearInterval(timer);
    streams.delete(res);
  });
});
app.get("/api/fixture-metrics", (_req, res) =>
  res.json({ streams: streams.size }),
);
app.get("/api/test-evidence/:id/content", authenticate, async (_req, res) => {
  res.set({
    "Content-Type": "text/plain",
    "Content-Disposition": 'attachment; filename="synthetic.txt"',
  });
  res.send(await readFile("/var/lib/traceflow/test-evidence/synthetic.txt"));
});
app.post("/api/test-cases/:id/executions", authenticate, (req, res) => {
  let bytes = 0;
  const hash = createHash("sha256");
  req.on("data", (chunk) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  req.on("end", () =>
    res.json({
      bytes,
      digest: hash.digest("hex"),
      type: req.get("content-type"),
    }),
  );
});
app.all(["/api", "/api/projects", "/api/auth/callback"], (req, res) =>
  res.json({
    method: req.method,
    path: req.path,
    ip: req.ip,
    protocol: req.protocol,
    host: req.hostname,
    forwarded: req.get("forwarded") || null,
    cf: req.get("cf-connecting-ip") || null,
    requestId: req.get("x-request-id"),
  }),
);
app.get("/api/failure", (_req, res) =>
  res.status(500).json({ code: "SYNTHETIC_FAILURE" }),
);
app.use((_req, res) => res.status(404).json({ code: "NOT_FOUND" }));
app.use((error, _req, res, _next) =>
  res
    .status(error.statusCode || error.status || 500)
    .json({ code: error.code || "FIXTURE_ERROR" }),
);
const server = app.listen(3001, "127.0.0.1");
const shutdown = createGracefulShutdown({
  server,
  closeStreams: () => {
    for (const stream of streams) stream.end();
  },
  timeoutMs: 30000,
  disconnect: async () => {},
  logger: { info() {}, error() {} },
});
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// Probe real sandbox permissions without modifying runtime source/configuration.
if (process.env.TF04_SANDBOX_REPORT) {
  const results = { uid: process.getuid(), denied: [], allowed: [] };
  for (const path of [
    "/opt/traceflow/current/deny-write",
    "/etc/traceflow/deny-write",
    "/etc/nginx/ssl/traceflow-origin.key",
  ]) {
    try {
      if (path.endsWith(".key")) await readFile(path);
      else await writeFile(path, "test", { flag: "wx" });
      results.allowed.push(path);
    } catch {
      results.denied.push(path);
    }
  }
  await writeFile(
    "/var/lib/traceflow/test-evidence/sandbox.json",
    JSON.stringify(results),
  );
}
