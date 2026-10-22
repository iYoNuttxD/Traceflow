import { parseGithubJson, githubId } from "./github-json.mjs";
import { provePayload } from "./hmac-proof.mjs";
import { createSign } from "node:crypto";
const [mode, id, after] = process.argv.slice(2);
const check = (ok, code) => {
  if (!ok) throw Object.assign(new Error(), { code });
};
try {
  check(["list", "verify", "cycle"].includes(mode), "MODE");
  const now = Math.floor(Date.now() / 1000),
    b = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned =
    b({ alg: "RS256", typ: "JWT" }) +
    "." +
    b({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token =
    unsigned +
    "." +
    signer
      .sign(Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_BASE64, "base64"))
      .toString("base64url");
  async function api(path, method = "GET", rawIntegers = false) {
    const r = await fetch("https://api.github.com" + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(mode === "cycle" ? 5000 : 15000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TraceFlow-controlled-activation",
      },
    });
    check(
      r.status === (method === "GET" ? 200 : method === "POST" ? 202 : 204),
      "GITHUB_HTTP_" + r.status,
    );
    const t = await r.text();
    check(t.length < 2e6, "OUTPUT_LIMIT");
    return t ? parseGithubJson(t, { rawIntegers }) : null;
  }
  const app = await api("/app");
  check(
    String(app.id) === process.env.GITHUB_APP_ID &&
      app.slug === process.env.GITHUB_APP_SLUG,
    "APP_IDENTITY",
  );
  const hook = await api("/app/hook/config");
  check(String(hook.insecure_ssl) === "0", "GITHUB_TLS");
  if (mode === "list") {
    const ds = await api("/app/hook/deliveries?per_page=20");
    const installs = await api("/app/installations?per_page=100");
    console.log(
      JSON.stringify({
        status: "GITHUB_DELIVERIES_READ",
        productionUrl:
          hook.url === "https://traceflow.dev/api/webhooks/github-app",
        installations: installs.map((x) => ({
          id: githubId(x.id),
          account: x.account?.login,
          suspended: !!x.suspended_at,
        })),
        deliveries: ds.map((d) => ({
          id: githubId(d.id),
          guid: d.guid,
          event: d.event,
          status: d.status_code,
          at: d.delivered_at,
          redelivery: d.redelivery,
        })),
      }),
    );
  } else if (mode === "cycle") {
    check(
      hook.url === "https://traceflow.dev/api/webhooks/github-app",
      "PRODUCTION_WEBHOOK_REQUIRED",
    );
    const endpoint = "/app/installations/150643350";
    const before = await api(endpoint);
    check(
      before.id === 150643350 &&
        before.account?.login === "iYoNuttxD" &&
        !before.suspended_at,
      "INSTALLATION_STATE",
    );
    let attempted = false,
      suspended = false,
      reactivated = false;
    try {
      attempted = true;
      await api(endpoint + "/suspended", "PUT");
      suspended = true;
    } finally {
      if (attempted) {
        try {
          await api(endpoint + "/suspended", "DELETE");
          reactivated = true;
        } catch {
          check(false, "GITHUB_REACTIVATION_UNCONFIRMED");
        }
      }
    }
    let end;
    try {
      end = await api(endpoint);
    } catch {
      check(false, "GITHUB_REACTIVATION_UNCONFIRMED");
    }
    check(
      end.id === 150643350 &&
        end.account?.login === "iYoNuttxD" &&
        !end.suspended_at,
      "GITHUB_REACTIVATION_UNCONFIRMED",
    );
    console.log(
      JSON.stringify({
        status: "GITHUB_INSTALLATION_CYCLE_COMPLETE",
        installationId: 150643350,
        account: "iYoNuttxD",
        suspended,
        reactivated,
        otherInstallationsModified: false,
        at: new Date().toISOString(),
      }),
    );
  } else {
    check(/^[1-9]\d{0,39}$/.test(id), "DELIVERY_ID");
    check(
      hook.url === "https://traceflow.dev/api/webhooks/github-app",
      "PRODUCTION_WEBHOOK_REQUIRED",
    );
    {
      const d = await api("/app/hook/deliveries/" + id, "GET", true);
      check(githubId(d.id) === id, "DELIVERY_ID_MISMATCH");
      check(
        Date.parse(d.delivered_at) >= Date.parse(after) &&
          [200, 202, 204].includes(d.status_code) &&
          d.url === hook.url,
        "DELIVERY_NOT_SUCCESSFUL_IN_WINDOW",
      );
      const h = Object.fromEntries(
        Object.entries(d.request.headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      check(
        h["x-github-delivery"] === d.guid &&
          /^sha256=[a-f0-9]{64}$/.test(h["x-hub-signature-256"]),
        "DELIVERY_HEADERS",
      );
      const proof = provePayload(
        d.request.payload,
        h["x-hub-signature-256"],
        process.env.GITHUB_APP_WEBHOOK_SECRET,
      );
      console.log(
        JSON.stringify({
          status: "GITHUB_REAL_DELIVERY_VERIFIED",
          deliveryId: d.guid,
          payloadSha256: proof.payloadSha256,
          signatureAccepted: true,
          httpStatus: d.status_code,
          at: d.delivered_at,
          event: d.event,
          webhookUrl: hook.url,
        }),
      );
    }
  }
} catch (e) {
  console.log(
    JSON.stringify({
      status: "FAIL",
      code: /^[A-Z][A-Z0-9_]{2,80}$/.test(e.code || "")
        ? e.code
        : "GITHUB_PROBE_FAILED",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
}
