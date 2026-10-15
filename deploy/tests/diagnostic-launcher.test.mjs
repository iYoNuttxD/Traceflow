import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sanitizedResult } from "../scripts/diagnostic-launcher.mjs";

test("launcher refuses raw or encoded credentials and complete database URLs", () => {
  const password = randomBytes(24).toString("base64") + ":@/";
  for (const value of [
    password,
    encodeURIComponent(password),
    "mysql:" + "//synthetic@127.0.0.1/schema",
  ]) {
    assert.throws(
      () =>
        sanitizedResult(
          {
            code: 0,
            output: JSON.stringify({ status: "PASS", detail: value }),
          },
          password,
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  }
});
test("launcher refuses inconsistent exit, unstructured errors and invalid JSON", () => {
  const password = randomBytes(32).toString("hex");
  for (const result of [
    { code: 1, output: '{"status":"PASS"}' },
    { code: 0, output: '{"status":"FAIL","code":"REJECTED"}' },
    { code: 1, output: '{"status":"FAIL","code":"raw error detail"}' },
    { code: 0, output: "unexpected" },
    { code: 0, output: '{"status":"UNKNOWN"}' },
  ])
    assert.throws(() => sanitizedResult(result, password));
});
test("launcher retains sanitized canonical results", () => {
  const password = randomBytes(32).toString("hex");
  for (const result of [
    { code: 0, output: '{"status":"CONFIG_VALID","connected":false}' },
    { code: 0, output: '{"status":"PASS","writes":false,"disconnected":true}' },
    {
      code: 1,
      output: '{"status":"FAIL","code":"TLS_REQUIRED","writes":false}',
    },
  ])
    assert.deepEqual(
      sanitizedResult(result, password),
      JSON.parse(result.output),
    );
});
