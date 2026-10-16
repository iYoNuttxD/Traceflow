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
      output:
        '{"status":"FAIL","code":"TLS_REQUIRED","phase":"TLS_PROBE","writes":false}',
    },
  ])
    assert.deepEqual(
      sanitizedResult(result, password),
      JSON.parse(result.output),
    );
});

test("launcher retains the canonical failure phase and optional MySQL code", () => {
  for (const mysqlCode of [undefined, "1", "1227", "1295", "3530", "65535"]) {
    const diagnostic = {
      status: "FAIL",
      code: "P2010",
      phase: "SQL_IDENTITY",
      writes: false,
      ...(mysqlCode === undefined ? {} : { mysqlCode }),
    };
    assert.deepEqual(
      sanitizedResult(
        { code: 1, output: JSON.stringify(diagnostic) },
        "synthetic-test-only",
      ),
      diagnostic,
    );
  }
});

test("launcher refuses missing, malformed or unexpected failure fields", () => {
  const base = {
    status: "FAIL",
    code: "P2010",
    phase: "SQL_IDENTITY",
    writes: false,
  };
  const mutations = [
    { phase: undefined },
    { phase: "SQL_UNREVIEWED" },
    { phase: ["SQL_IDENTITY"] },
    { phase: "SQL_IDENTITY\n" },
    { code: ["P2010"] },
    { code: "A".repeat(65) },
    { writes: undefined },
    { writes: true },
    { writes: "false" },
    ...[
      null,
      1227,
      "0",
      "65536",
      "01227",
      "1e3",
      "1227\n",
      "1227 ",
      "N/A",
      {},
      [],
    ].map((mysqlCode) => ({ mysqlCode })),
    ...[
      "message",
      "stack",
      "meta",
      "sql",
      "DATABASE_URL",
      "password",
      "packageId",
      "unexpected",
    ].map((key) => ({ [key]: "refused" })),
  ];
  for (const mutation of mutations)
    assert.throws(
      () =>
        sanitizedResult(
          { code: 1, output: JSON.stringify({ ...base, ...mutation }) },
          "synthetic-test-only",
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  for (const field of ["phase", "mysqlCode", "unexpected"])
    for (const status of ["PASS", "CONFIG_VALID"])
      assert.throws(
        () =>
          sanitizedResult(
            { code: 0, output: JSON.stringify({ status, [field]: "refused" }) },
            "synthetic-test-only",
          ),
        { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
      );
});

test("launcher rejects multiple JSON records and non-object outputs", () => {
  for (const output of [
    "null",
    "[]",
    '"FAIL"',
    '{"status":"FAIL"}\n{"status":"FAIL"}',
  ])
    assert.throws(() =>
      sanitizedResult({ code: 1, output }, "synthetic-test-only"),
    );
});

test("launcher accepts only the predefined role-audit phases and safe errors", () => {
  for (const phase of [
    "SESSION_START",
    "SESSION_END",
    "SQL_ROLE_GRAPH",
    "ROLE_GRAPH",
    "SQL_PUBLIC_GRANTS",
    "EFFECTIVE_GRANTS",
  ]) {
    const diagnostic = {
      status: "FAIL",
      code: "P2010",
      phase,
      mysqlCode: "3530",
      writes: false,
    };
    assert.deepEqual(
      sanitizedResult(
        { code: 1, output: JSON.stringify(diagnostic) },
        "synthetic-test-only",
      ),
      diagnostic,
    );
  }
  for (const phase of [
    "SQL_ROLE_GRAPH_EXTRA",
    "ROLE_GRAPH\n",
    "SHOW GRANTS",
    { name: "ROLE_GRAPH" },
  ]) {
    assert.throws(
      () =>
        sanitizedResult(
          {
            code: 1,
            output: JSON.stringify({
              status: "FAIL",
              code: "P2010",
              phase,
              writes: false,
            }),
          },
          "synthetic-test-only",
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  }
});
