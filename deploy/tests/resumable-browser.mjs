import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = process.env.TRACEFLOW_UPLOAD_LAB_ROOT;
assert.ok(
  root && /^\/(?:private\/)?tmp\/tf041-[a-z0-9]+$/.test(root),
  "owned temporary lab root required",
);
assert.equal(
  (await readFile(root + "/owner", "utf8")).trim(),
  "OCI-DEPLOY-04.1",
);
const info = await stat(root);
assert.equal(info.uid, process.getuid());
assert.equal(info.mode & 0o077, 0);
const { chromium } = await import(
  pathToFileURL(root + "/browser-tools/node_modules/playwright-core/index.mjs")
);
const fixture = JSON.parse(await readFile(root + "/e2e-private.json"));
const origin = "https://traceflow.test:19441";
const cli = process.env.TRACEFLOW_LIMA_BIN;
assert.ok(cli?.startsWith("/"), "explicit Lima binary required");
const vm = (args) =>
  execFileSync(cli, ["shell", "tf041", ...args], {
    env: { ...process.env, LIMA_HOME: root + "/lima-home" },
    stdio: ["ignore", "pipe", "pipe"],
  });
const digest = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(vm(["hostname"]).toString().trim(), "lima-tf041");
const sample = await readFile(
  new URL(
    "../../backend/test/fixtures/test-evidence/sample.mp4",
    import.meta.url,
  ),
);
const large = Buffer.alloc(50 * 1048576);
sample.copy(large);
large.writeUInt32BE(large.length - sample.length, sample.length);
large.write("free", sample.length + 4);
await writeFile(root + "/general.mp4", large);
await writeFile(root + "/step.mp4", large);
await writeFile(root + "/small.json", '{"isolated":true}');
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--host-resolver-rules=MAP traceflow.test 127.0.0.1",
    "--no-proxy-server",
    "--disable-background-networking",
    "--disable-component-update",
  ],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "traceflow.test"
    ? route.continue()
    : route.abort(),
);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const results = {
  environment:
    "Oracle Linux 9.8 ARM64 / Node 22.23.2 / MySQL 26.7.0 / nginx 1.20.1 / SELinux Enforcing",
  scenarios: [],
  requests: [],
  errors: [],
};
page.on("pageerror", (e) => results.errors.push(e.message));
page.on("response", async (res) => {
  if (res.url().includes("/tested-references"))
    results.referenceResponse = {
      status: res.status(),
      body: await res.json().catch(() => null),
    };
});
page.on("request", (req) => {
  if (req.url().includes("/execution-uploads")) {
    const body = req.postDataBuffer();
    results.requests.push({
      method: req.method(),
      kind: req.url().includes("/parts/")
        ? "part"
        : req.url().endsWith("/complete")
          ? "complete"
          : "session",
      bytes: body?.length || 0,
      part: req.url().match(/\/parts\/(\d+)$/)?.[1],
    });
  }
});
async function api(path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const token = await fetch("/api/auth/csrf").then((r) => r.json());
      const response = await fetch("/api" + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token.csrfToken,
          ...options.headers,
        },
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
      return {
        status: response.status,
        data,
        headers: { cache: response.headers.get("cache-control") },
      };
    },
    { path, options },
  );
}
async function open(title, { general, step, resume = false } = {}) {
  await page.goto(origin + `/projects/${fixture.projectId}/test-cases`);
  await page
    .getByRole("article", { name: new RegExp(" · " + title + "$") })
    .getByRole("button", { name: "Executar", exact: true })
    .click();
  const dlg = page.getByRole("dialog");
  if (resume) {
    await dlg
      .getByRole("button", { name: "Consultar envios pendentes" })
      .click();
    await dlg.getByRole("button", { name: /Retomar envio de/ }).click();
  }
  await dlg.getByRole("combobox", { name: /Versão testada/ }).fill("41");
  await dlg.getByRole("option", { name: /PR #41/ }).click();
  await dlg
    .getByLabel("Ambiente *", { exact: true })
    .selectOption("HOMOLOGACAO");
  if (step)
    await dlg
      .getByLabel("Adicionar foto ou vídeo", { exact: true })
      .setInputFiles(root + "/" + step);
  await dlg.getByRole("button", { name: "Aprovado", exact: true }).click();
  await dlg
    .getByRole("button", { name: "Revisar execução", exact: true })
    .click();
  if (general)
    await dlg
      .getByLabel("Adicionar evidência", { exact: true })
      .setInputFiles(root + "/" + general);
  return dlg;
}
async function submit(dlg) {
  await dlg
    .getByRole("button", {
      name: /^(Registrar execução|Retomar envio e confirmar execução)$/,
    })
    .click();
  await page
    .getByText(/Execução registrada: PASS\./)
    .waitFor({ timeout: 90000 });
}
async function verify(title, expected) {
  const id = fixture.cases[title].id;
  const list = await api(`/test-cases/${id}/executions`);
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 1);
  const detail = await api("/test-executions/" + list.data.items[0].id);
  assert.equal(detail.status, 200);
  const execution = detail.data.execution;
  const rows = execution.evidence;
  assert.equal(rows.length, expected.length);
  for (const row of rows) {
    const response = await page.evaluate(async (id) => {
      const r = await fetch(`/api/test-evidence/${id}/content`);
      const b = await r.arrayBuffer();
      const h = await crypto.subtle.digest("SHA-256", b);
      return {
        status: r.status,
        size: b.byteLength,
        sha: Array.from(new Uint8Array(h), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join(""),
        cache: r.headers.get("cache-control"),
      };
    }, row.id);
    assert.equal(response.status, 200);
    assert.ok(
      expected.some((e) => e.size === response.size && e.sha === response.sha),
    );
    assert.match(response.cache, /no-store/);
  }
  return execution.id;
}
try {
  await page.goto(origin + "/login");
  await page
    .getByLabel("Nome de usuário ou e-mail", { exact: false })
    .fill(fixture.identifier);
  await page.locator("#password").fill(fixture.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/projects");
  let dlg = await open("Simples", { general: "small.json" });
  await submit(dlg);
  const small = await readFile(root + "/small.json");
  await verify("Simples", [{ size: small.length, sha: digest(small) }]);
  results.scenarios.push("small_browser_upload_download");
  let lost = false;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Fetch.enable", {
    patterns: [
      {
        urlPattern: "*/execution-uploads/*/complete",
        requestStage: "Response",
      },
    ],
  });
  cdp.on("Fetch.requestPaused", async (event) => {
    if (!lost && event.responseStatusCode === 200) {
      lost = true;
      await cdp.send("Fetch.failRequest", {
        requestId: event.requestId,
        errorReason: "ConnectionReset",
      });
    } else
      await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
  });
  dlg = await open("Limite agregado", {
    general: "general.mp4",
    step: "step.mp4",
  });
  const start = Date.now();
  await submit(dlg);
  await verify("Limite agregado", [
    { size: large.length, sha: digest(large) },
    { size: large.length, sha: digest(large) },
  ]);
  results.largeElapsedMs = Date.now() - start;
  results.scenarios.push(
    "100MiB_two_files_general_and_step",
    "lost_complete_response_exactly_once",
  );
  assert.ok(lost);
  await cdp.send("Fetch.disable");
  await cdp.detach();
  let heldResolve;
  const held = new Promise((r) => (heldResolve = r));
  let hold = true;
  await page.route("**/parts/1", async (route) => {
    if (hold) {
      hold = false;
      heldResolve();
      await new Promise((r) => setTimeout(r, 1500));
      await route.abort("connectionreset").catch(() => {});
    } else await route.continue();
  });
  dlg = await open("Retomada", { general: "general.mp4" });
  await dlg
    .getByRole("button", { name: "Registrar execução", exact: true })
    .click();
  await held;
  await dlg
    .getByRole("button", { name: "Interromper envio", exact: true })
    .click();
  await dlg.getByText("Envio interrompido", { exact: true }).waitFor();
  const prior = await api(
    `/test-cases/${fixture.cases.Retomada.id}/execution-uploads`,
  );
  assert.equal(prior.status, 200);
  assert.equal(prior.data.uploads[0].confirmedBytes, 8388608);
  const priorId = prior.data.uploads[0].uploadId;
  const beforeResume = results.requests.length;
  vm(["sudo", "systemctl", "stop", "traceflow-api"]);
  vm([
    "sudo",
    "ln",
    "-s",
    "/opt/traceflow/releases/tf041-b",
    "/opt/traceflow/current.next",
  ]);
  vm([
    "sudo",
    "mv",
    "-Tf",
    "/opt/traceflow/current.next",
    "/opt/traceflow/current",
  ]);
  vm([
    "sudo",
    "ln",
    "-s",
    "/opt/traceflow/releases/tf041-b/frontend/dist",
    "/var/www/traceflow/current.next",
  ]);
  vm([
    "sudo",
    "mv",
    "-Tf",
    "/var/www/traceflow/current.next",
    "/var/www/traceflow/current",
  ]);
  vm(["sudo", "systemctl", "start", "traceflow-api"]);
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      const out = vm([
        "curl",
        "-s",
        "http://127.0.0.1:3001/health/ready",
      ]).toString();
      if (out.includes("ready")) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, "API readiness after release");
  await page.unroute("**/parts/1");
  dlg = await open("Retomada", { general: "general.mp4", resume: true });
  await submit(dlg);
  await verify("Retomada", [{ size: large.length, sha: digest(large) }]);
  assert.equal(
    results.requests
      .slice(beforeResume)
      .filter((r) => r.kind === "part" && r.part === "0").length,
    0,
  );
  const after = await api(
    `/test-cases/${fixture.cases.Retomada.id}/execution-uploads/${priorId}`,
  );
  assert.equal(after.data.sessionStatus, "COMPLETED");
  results.scenarios.push(
    "pause_reload_reselect_resume",
    "api_restart_and_release_switch_persistent_session",
    "no_resend_confirmed_part",
  );
  await page.route("**/parts/0", (route) =>
    route.abort("internetdisconnected"),
  );
  dlg = await open("Cancelamento", { general: "small.json" });
  await dlg
    .getByRole("button", { name: "Registrar execução", exact: true })
    .click();
  await dlg
    .getByRole("button", { name: "Cancelar envio pendente", exact: true })
    .waitFor();
  const cancelledBefore = await api(
    `/test-cases/${fixture.cases.Cancelamento.id}/execution-uploads`,
  );
  assert.equal(cancelledBefore.data.uploads[0].confirmedBytes, 0);
  await dlg
    .getByRole("button", { name: "Cancelar envio pendente", exact: true })
    .click();
  await dlg
    .getByText("Envio cancelado. Seu rascunho foi preservado.", { exact: true })
    .waitFor();
  const cancelledAfter = await api(
    `/test-cases/${fixture.cases.Cancelamento.id}/execution-uploads/${cancelledBefore.data.uploads[0].uploadId}`,
  );
  assert.equal(cancelledAfter.data.sessionStatus, "CANCELLED");
  const cancelledExecs = await api(
    `/test-cases/${fixture.cases.Cancelamento.id}/executions`,
  );
  assert.equal(cancelledExecs.data.items.length, 0);
  await page.unroute("**/parts/0");
  results.scenarios.push("finite_network_retry_and_cancellation_cleanup");
  let failedDirectory;
  await page.route("**/execution-uploads/*/complete", async (route) => {
    const id = route.request().url().split("/").at(-2);
    assert.match(id, /^[0-9a-f-]{36}$/);
    failedDirectory = "/var/lib/traceflow/test-evidence/.uploads/" + id;
    vm(["sudo", "chmod", "500", failedDirectory]);
    await route.continue();
  });
  dlg = await open("Falha resposta", { general: "small.json" });
  await dlg
    .getByRole("button", { name: "Registrar execução", exact: true })
    .click();
  await dlg
    .getByRole("button", { name: "Cancelar envio pendente", exact: true })
    .waitFor();
  const failedExecs = await api(
    `/test-cases/${fixture.cases["Falha resposta"].id}/executions`,
  );
  assert.equal(failedExecs.data.items.length, 0);
  await page.unroute("**/execution-uploads/*/complete");
  vm(["sudo", "chmod", "700", failedDirectory]);
  await submit(dlg);
  await verify("Falha resposta", [{ size: small.length, sha: digest(small) }]);
  results.scenarios.push(
    "filesystem_failure_before_commit_preserves_parts_and_retries",
  );
  dlg = await open("Cancelamento", { general: "small.json" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await dlg.getByRole("region", { name: "Envio de evidências" }).isVisible(),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  results.scenarios.push("mobile_dom_no_horizontal_overflow");
  const unauth = await browser.newContext({ ignoreHTTPSErrors: true });
  const unauthPage = await unauth.newPage();
  const unauthResponse = await unauthPage.goto(
    origin + `/api/test-cases/${fixture.cases.Simples.id}/execution-uploads`,
  );
  assert.equal(unauthResponse.status(), 401);
  await unauth.close();
  const noCsrf = await page.evaluate(
    async (id) =>
      (
        await fetch(`/api/test-cases/${id}/execution-uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    fixture.cases.Simples.id,
  );
  assert.equal(noCsrf, 403);
  results.scenarios.push("nginx_auth_csrf");
  const functionalRequests = results.requests.slice();
  const oversized = await page.evaluate(
    async (id) =>
      (
        await fetch(
          `/api/test-cases/${id}/execution-uploads/00000000-0000-4000-8000-000000000000/files/00000000-0000-4000-8000-000000000000/parts/0`,
          {
            method: "PUT",
            body: new Uint8Array(8388609),
            headers: { "Content-Type": "application/octet-stream" },
          },
        )
      ).status,
    fixture.cases.Simples.id,
  );
  assert.equal(oversized, 413);
  results.scenarios.push("nginx_part_limit_413");
  const denied = await page.evaluate(
    async () => (await fetch("/.uploads/private")).status,
  );
  assert.equal(denied, 404);
  results.scenarios.push("private_storage_not_public");
  assert.equal(results.errors.length, 0);
  assert.ok(functionalRequests.every((r) => r.bytes <= 8388608));
  results.maxRequestBodyBytes = Math.max(
    ...functionalRequests.map((r) => r.bytes),
  );
  results.status = "PASS";
} catch (error) {
  results.status = "FAIL";
  results.dom = await page.locator("body").innerText();
  results.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 3),
  };
  process.exitCode = 1;
} finally {
  await writeFile(root + "/browser-e2e.json", JSON.stringify(results, null, 2));
  await browser.close();
  console.log(
    "Browser laboratory",
    results.status,
    results.scenarios.length,
    "scenarios",
  );
}
