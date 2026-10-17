// Release database policy. No connections, environment loading, or SQL execution.
import { createHash } from "node:crypto";
import {
  constants,
  lstatSync,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export const INITIAL_MIGRATION_COUNT = 68;
export const INITIAL_RECOVERY = "stop-and-review-empty-initialization";
const HASH = /^[a-f0-9]{64}$/;
const ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hasControls = (text) =>
  [...text].some(
    (character) =>
      character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
  );
const ref = (s) =>
  typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,199}$/.test(s);
export const check = (ok, code) => {
  if (!ok) throw Object.assign(new Error(code), { code });
};
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const exact = (v, keys, code) =>
  check(
    v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Reflect.ownKeys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k)),
    code,
  );
export const isInitial = (auth) =>
  ["migrate-initial", "inspect-initial-schema"].includes(auth.operation);

export function validateRecovery(plan) {
  exact(
    plan,
    ["strategy", "planReference", "operatorId"],
    "INITIAL_RECOVERY_PLAN_REQUIRED",
  );
  check(
    plan.strategy === INITIAL_RECOVERY &&
      ref(plan.planReference) &&
      typeof plan.operatorId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(plan.operatorId),
    "INITIAL_RECOVERY_PLAN_REQUIRED",
  );
}

export function validateMigrationPolicy(auth, manifest) {
  check(auth.gates?.writersControlled === true, "WRITERS_NOT_CONTROLLED");
  if (isInitial(auth)) {
    check(ID.test(auth.authorizationId || ""), "INITIAL_AUTHORIZATION_ID");
    check(
      manifest.schema.migrations.length === INITIAL_MIGRATION_COUNT,
      "INITIAL_CHAIN_COUNT",
    );
    exact(
      auth.initialization,
      [
        "formatVersion",
        "chainSha256",
        "schemaSha256",
        "inspection",
        "recovery",
      ],
      "INITIAL_CONTRACT",
    );
    check(
      auth.initialization.formatVersion === 1 &&
        auth.initialization.chainSha256 === manifest.schema.chainSha256 &&
        auth.initialization.schemaSha256 === manifest.schema.schemaSha256,
      "INITIAL_CHAIN_MISMATCH",
    );
    validateRecovery(auth.initialization.recovery);
    exact(
      auth.initialization.inspection,
      [
        "path",
        "sha256",
        "inspectorAccount",
        "inspectorRoles",
        "catalogVisibilityReview",
      ],
      "INITIAL_INSPECTION_REQUIRED",
    );
    const e = auth.initialization.inspection;
    inspectorRoles(e);
    check(
      typeof e.path === "string" &&
        e.path === resolve(e.path) &&
        HASH.test(e.sha256) &&
        typeof e.inspectorAccount === "string" &&
        /^[^\s@]+@[^\s@]+$/.test(e.inspectorAccount) &&
        ref(e.catalogVisibilityReview),
      "INITIAL_INSPECTION_REQUIRED",
    );
    check(
      !Object.hasOwn(auth, "backupReference") &&
        !["backupVerified", "restoreRehearsed"].some((k) =>
          Object.hasOwn(auth.gates, k),
        ),
      "INITIAL_BACKUP_CLAIM_FORBIDDEN",
    );
  } else {
    check(auth.operation === "migrate", "MIGRATION_OPERATION");
    check(
      !Object.hasOwn(auth, "initialization"),
      "INITIAL_CONTRACT_ON_UPGRADE",
    );
    check(
      auth.gates?.backupVerified === true &&
        auth.gates?.restoreRehearsed === true &&
        ref(auth.backupReference),
      "MIGRATION_AUTHORIZATION",
    );
  }
}

export function validateUtc(row) {
  check(
    row &&
      ["UTC", "+00:00"].includes(row.globalTimeZone) &&
      ["UTC", "+00:00"].includes(row.sessionTimeZone) &&
      [0, 0n, "0"].includes(row.utcOffsetSeconds),
    "MIGRATION_UTC_REQUIRED",
  );
}

export function assertInitialSnapshot(snapshot) {
  check(
    snapshot &&
      snapshot.historyTablePresent === false &&
      Array.isArray(snapshot.applied) &&
      snapshot.applied.length === 0 &&
      snapshot.tableCount === 0 &&
      snapshot.objectCounts &&
      ["tables", "views", "routines", "triggers", "events"].every(
        (key) => snapshot.objectCounts[key] === 0,
      ),
    "INITIAL_SCHEMA_NOT_EMPTY",
  );
}

export function assertUpgradeSnapshot(snapshot) {
  check(
    snapshot.historyTablePresent === true && snapshot.applied.length > 0,
    "INITIAL_MIGRATION_REQUIRED",
  );
}

function fileIdentity(s) {
  return [
    s.dev,
    s.ino,
    s.uid,
    s.mode,
    s.nlink,
    s.size,
    s.mtimeMs,
    s.ctimeMs,
  ].join(":");
}
export function protectedBytes(path, disposable = false) {
  check(
    typeof path === "string" &&
      path === resolve(path) &&
      realpathSync(path) === path,
    "INITIAL_EVIDENCE_PATH",
  );
  const uid = disposable ? process.getuid() : 0;
  const parents = [];
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    const s = lstatSync(dir);
    check(
      s.isDirectory() &&
        !s.isSymbolicLink() &&
        (!(s.mode & 0o022) || (disposable && s.mode & 0o1000)) &&
        (s.uid === 0 || (disposable && s.uid === uid)),
      "INITIAL_EVIDENCE_PARENT",
    );
    parents.push([dir, fileIdentity(s)]);
    if (dir === "/") break;
  }
  const before = lstatSync(path);
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.uid === uid &&
      [0o400, 0o600].includes(before.mode & 0o7777) &&
      before.size > 0 &&
      before.size <= 16384,
    "INITIAL_EVIDENCE_FILE",
  );
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    check(
      fileIdentity(before) === fileIdentity(fstatSync(fd)),
      "INITIAL_EVIDENCE_CHANGED",
    );
    const bytes = readFileSync(fd);
    check(
      bytes.length === before.size &&
        fileIdentity(before) === fileIdentity(fstatSync(fd)) &&
        fileIdentity(before) === fileIdentity(lstatSync(path)) &&
        realpathSync(path) === path,
      "INITIAL_EVIDENCE_CHANGED",
    );
    for (const [dir, state] of parents)
      check(fileIdentity(lstatSync(dir)) === state, "INITIAL_EVIDENCE_CHANGED");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

// Exact textual transcript: scalar inventory and administrative grants, each
// immediately followed by SHOW COUNT(*) WARNINGS. No approval boolean.
export function validateInitialTranscript(
  bytes,
  auth,
  manifest,
  now = Date.now(),
) {
  const spec = auth.initialization.inspection;
  check(sha256(bytes) === spec.sha256, "INITIAL_EVIDENCE_HASH");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split("\n");
  check(
    lines.length >= 5 &&
      lines.at(-1) === "" &&
      lines[1] === "0" &&
      lines.at(-2) === "0",
    "INITIAL_EVIDENCE_WARNINGS_OR_FRAMING",
  );
  let row;
  try {
    row = JSON.parse(lines[0]);
  } catch {
    check(false, "INITIAL_EVIDENCE_FORMAT");
  }
  check(
    Array.isArray(row) &&
      row.length === 33 &&
      row.every((v) => typeof v === "string" || Number.isSafeInteger(v)),
    "INITIAL_EVIDENCE_FORMAT",
  );
  const t = auth.target;
  validateMetadataVisibility(lines.slice(2, -2), spec, t.schema, row[32]);
  check(
    row[0] === "traceflow-initial-schema-v1" &&
      row[1] === auth.authorizationId &&
      row[2] === auth.releaseId &&
      row[3] === auth.descriptorSha256 &&
      row[4] === manifest.schema.chainSha256,
    "INITIAL_EVIDENCE_BINDING",
  );
  check(
    Number.isSafeInteger(row[5]) &&
      row[5] <= now &&
      now - row[5] < 600000 &&
      now < Date.parse(auth.expiresAt),
    "INITIAL_EVIDENCE_EXPIRED",
  );
  check(
    row[6] === t.serverUuid &&
      row[7] === t.version &&
      row[8] === t.port &&
      row[9] === t.schema &&
      row[10] === spec.inspectorAccount &&
      Number.isSafeInteger(row[11]) &&
      row[11] > 0 &&
      row[12] === "utf8mb4" &&
      row[13] === "utf8mb4_unicode_ci" &&
      row[16] === t.migrationUser &&
      row[29] === t.migrationAccount,
    "INITIAL_EVIDENCE_IDENTITY",
  );
  check(
    ["", "public"].includes(row[14]) &&
      row[15] === 0 &&
      row[17] === 1 &&
      row[18] === 0 &&
      row[19] === 0 &&
      row[30] === 1 &&
      row[31] === 0,
    "INITIAL_EVIDENCE_ROLES",
  );
  check(
    row.slice(20, 25).every((n) => n === 0),
    "INITIAL_SCHEMA_NOT_EMPTY",
  );
  check(
    row[25] === 1 &&
      row[26] === 1 &&
      typeof row[27] === "string" &&
      /^[A-Z0-9_-]{8,128}$/.test(row[27]) &&
      ["TLSv1.2", "TLSv1.3"].includes(row[28]),
    "INITIAL_EVIDENCE_SESSION",
  );
  return {
    collectedAt: row[5],
    mandatoryRoles: row[14],
    partialRevokes: row[30],
    activateAllRolesOnLogin: row[31],
    sha256: spec.sha256,
  };
}

export function loadInitialEvidence(auth, manifest, now = Date.now()) {
  validateMigrationPolicy(auth, manifest);
  return validateInitialTranscript(
    protectedBytes(
      auth.initialization.inspection.path,
      auth.environment === "disposable",
    ),
    auth,
    manifest,
    now,
  );
}

export function validateReleaseGrants(
  rows,
  target,
  mode,
  currentUser,
  disposable,
) {
  const expected =
    mode === "migrate" ? target.migrationAccount : target.runtimeAccount;
  check(
    typeof currentUser === "string" && currentUser === expected,
    "DATABASE_ACCOUNT_MISMATCH",
  );
  check(Array.isArray(rows) && rows.length > 0, "MALFORMED_DATABASE_GRANTS");
  const required = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "INDEX",
    "REFERENCES",
  ];
  const allowed =
    mode === "migrate" ? required : ["SELECT", "INSERT", "UPDATE", "DELETE"];
  const privileges = new Set(),
    seen = new Set();
  for (const row of rows) {
    check(
      row && typeof row === "object" && !Array.isArray(row),
      "MALFORMED_DATABASE_GRANTS",
    );
    const keys = Reflect.ownKeys(row);
    check(
      keys.length === 1 &&
        ["f0", "Grants for " + currentUser].includes(keys[0]),
      "MALFORMED_DATABASE_GRANTS",
    );
    const text = Object.getOwnPropertyDescriptor(row, keys[0])?.value;
    check(
      typeof text === "string" && !hasControls(text) && !seen.has(text),
      "MALFORMED_DATABASE_GRANTS",
    );
    seen.add(text);
    const m = /^GRANT (.+) ON (.+) TO `([^`]+)`@`([^`]+)`$/.exec(text);
    check(m && m[3] + "@" + m[4] === expected, "EXCESSIVE_DATABASE_PRIVILEGES");
    if (m[1] === "USAGE" && m[2] === "*.*") continue;
    if (
      disposable &&
      m[2] === "`" + target.schema.replace(/_test$/, "_owner") + "`.*"
    ) {
      check(m[1] === "SELECT", "EXCESSIVE_DATABASE_PRIVILEGES");
      continue;
    }
    const rights = m[1].split(", ");
    check(
      m[2] === "`" + target.schema + "`.*" &&
        new Set(rights).size === rights.length &&
        rights.every((x) => allowed.includes(x)),
      "EXCESSIVE_DATABASE_PRIVILEGES",
    );
    rights.forEach((x) => privileges.add(x));
  }
  check(
    (mode === "migrate" ? required : ["SELECT"]).every((x) =>
      privileges.has(x),
    ),
    mode === "migrate" ? "MIGRATION_DDL_PRIVILEGE" : "RUNTIME_SELECT_PRIVILEGE",
  );
}

export function verifyMigrationFiles(release, admin, manifest) {
  const chain = manifest.schema.migrations;
  check(Array.isArray(chain) && chain.length > 0, "MIGRATION_INTEGRITY");
  for (const base of [
    resolve(release, "backend/prisma"),
    resolve(admin, "prisma"),
  ]) {
    check(realpathSync(base) === base, "MIGRATION_INTEGRITY");
    const schema = resolve(base, "schema.prisma");
    check(
      !lstatSync(schema).isSymbolicLink() &&
        sha256(readFileSync(schema)) === manifest.schema.schemaSha256,
      "MIGRATION_INTEGRITY",
    );
    const dir = resolve(base, "migrations");
    check(!lstatSync(dir).isSymbolicLink(), "MIGRATION_INTEGRITY");
    const entries = readdirSync(dir)
      .filter((x) => x !== "migration_lock.toml")
      .sort();
    check(
      JSON.stringify(entries) === JSON.stringify(chain.map((x) => x.name)),
      "MIGRATION_INTEGRITY",
    );
    for (const item of chain) {
      check(
        /^\d{14}(?:_[a-zA-Z0-9_]+)?$/.test(item.name) && HASH.test(item.sha256),
        "MIGRATION_INTEGRITY",
      );
      const folder = resolve(dir, item.name),
        file = resolve(folder, "migration.sql");
      check(
        !lstatSync(folder).isSymbolicLink() &&
          !lstatSync(file).isSymbolicLink() &&
          sha256(readFileSync(file)) === item.sha256,
        "MIGRATION_INTEGRITY",
      );
    }
  }
  const lock = (base) =>
    readFileSync(resolve(base, "migrations/migration_lock.toml"));
  check(
    sha256(lock(resolve(release, "backend/prisma"))) ===
      sha256(lock(resolve(admin, "prisma"))),
    "MIGRATION_INTEGRITY",
  );
}

// Pure plan renderer: caller reviews/captures this using the MySQL textual client.
// This function never opens a connection. Identifiers are closed, not arbitrary SQL.
export function initialInspectionSql(auth, manifest) {
  check(
    ID.test(auth.authorizationId || "") &&
      /^[a-f0-9]{64}$/.test(auth.descriptorSha256 || "") &&
      /^\d{8}T\d{6}Z-[a-f0-9]{40}-[a-f0-9]{12}$/.test(auth.releaseId || "") &&
      HASH.test(manifest.schema.chainSha256) &&
      /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(auth.target.schema) &&
      /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(auth.target.migrationUser),
    "INITIAL_PLAN_BINDING",
  );
  const q = (s) => "'" + s + "'",
    user = q(auth.target.migrationUser);
  const count = (table, predicate) =>
    "(SELECT COUNT(*) FROM " + table + " WHERE " + predicate + ")";
  const roles = inspectorRoles(auth.initialization.inspection);
  return (
    "SELECT JSON_ARRAY(" +
    [
      q("traceflow-initial-schema-v1"),
      q(auth.authorizationId),
      q(auth.releaseId),
      q(auth.descriptorSha256),
      q(manifest.schema.chainSha256),
      "CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)",
      "@@server_uuid",
      "VERSION()",
      "@@port",
      "DATABASE()",
      "CURRENT_USER()",
      "CONNECTION_ID()",
      "(SELECT DEFAULT_CHARACTER_SET_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=DATABASE())",
      "(SELECT DEFAULT_COLLATION_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=DATABASE())",
      "@@mandatory_roles",
      count("mysql.user", "User='public'"),
      user,
      count("mysql.user", "User=" + user),
      count("mysql.role_edges", "FROM_USER=" + user + " OR TO_USER=" + user),
      count("mysql.default_roles", "USER=" + user),
      count("INFORMATION_SCHEMA.TABLES", "TABLE_SCHEMA=DATABASE()"),
      count("INFORMATION_SCHEMA.ROUTINES", "ROUTINE_SCHEMA=DATABASE()"),
      count("INFORMATION_SCHEMA.TRIGGERS", "TRIGGER_SCHEMA=DATABASE()"),
      count("INFORMATION_SCHEMA.EVENTS", "EVENT_SCHEMA=DATABASE()"),
      count(
        "INFORMATION_SCHEMA.TABLES",
        "TABLE_SCHEMA=DATABASE() AND TABLE_NAME='_prisma_migrations'",
      ),
      "@@sql_notes",
      "@@require_secure_transport",
      "(SELECT VARIABLE_VALUE FROM performance_schema.session_status WHERE VARIABLE_NAME='Ssl_cipher')",
      "(SELECT VARIABLE_VALUE FROM performance_schema.session_status WHERE VARIABLE_NAME='Ssl_version')",
      "(SELECT CONCAT(User,'@',Host) FROM mysql.user WHERE User=" + user + ")",
      "@@partial_revokes",
      "@@activate_all_roles_on_login",
      "CAST(CURRENT_ROLE() AS CHAR CHARACTER SET utf8mb4)",
    ].join(",\n  ") +
    ");\nSHOW COUNT(*) WARNINGS;\nSHOW GRANTS FOR CURRENT_USER" +
    (roles.length ? " USING " + roles[0] : "") +
    ";\nSHOW COUNT(*) WARNINGS;\n"
  );
}

function inspectorRoles(spec) {
  check(
    Array.isArray(spec.inspectorRoles) && spec.inspectorRoles.length <= 1,
    "INITIAL_INSPECTOR_ROLES",
  );
  return spec.inspectorRoles.map((role) => {
    exact(role, ["user", "host"], "INITIAL_INSPECTOR_ROLES");
    check(
      /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(role.user) &&
        /^(?:%|[A-Za-z0-9_.-]{1,255})$/.test(role.host),
      "INITIAL_INSPECTOR_ROLES",
    );
    return "`" + role.user + "`@`" + role.host + "`";
  });
}

// This checks metadata VISIBILITY of the independent administrator, not runtime
// privileges. A role assignment alone never supplies this proof: USING must expand
// the explicitly authorized, active role, or the transcript is refused.
export function validateMetadataVisibility(grants, spec, schema, currentRoles) {
  const roles = inspectorRoles(spec);
  check(currentRoles === (roles[0] || "NONE"), "INITIAL_INSPECTOR_ROLES");
  check(
    Array.isArray(grants) && grants.length > 0,
    "INITIAL_METADATA_VISIBILITY",
  );
  const global = new Set(),
    local = new Set(),
    seen = new Set();
  for (const text of grants) {
    check(
      typeof text === "string" && !hasControls(text) && !seen.has(text),
      "INITIAL_METADATA_VISIBILITY",
    );
    seen.add(text);
    const revoke =
      /^REVOKE ([A-Z_, ]+) ON `([^`]+)`\.\* FROM `([^`]+)`@`([^`]+)`$/.exec(
        text,
      );
    if (revoke) {
      check(
        revoke[2] !== schema &&
          revoke[3] + "@" + revoke[4] === spec.inspectorAccount,
        "INITIAL_METADATA_VISIBILITY",
      );
      continue;
    }
    const grant =
      /^GRANT (.+) TO `([^`]+)`@`([^`]+)`(?: WITH GRANT OPTION)?$/.exec(text);
    check(
      grant && grant[2] + "@" + grant[3] === spec.inspectorAccount,
      "INITIAL_METADATA_VISIBILITY",
    );
    const privilege = /^([A-Z_, ]+) ON (\*\.\*|`[^`]+`\.\*)$/.exec(grant[1]);
    if (!privilege) {
      check(
        roles.length === 1 && grant[1] === roles[0],
        "INITIAL_METADATA_VISIBILITY",
      );
      continue;
    }
    const rights = privilege[1].split(", ");
    check(
      new Set(rights).size === rights.length,
      "INITIAL_METADATA_VISIBILITY",
    );
    const set =
      privilege[2] === "*.*"
        ? global
        : privilege[2] === "`" + schema + "`.*"
          ? local
          : null;
    if (set) rights.forEach((x) => set.add(x));
  }
  const has = (p) =>
    global.has(p) ||
    local.has(p) ||
    global.has("ALL PRIVILEGES") ||
    local.has("ALL PRIVILEGES");
  check(
    has("SELECT") &&
      has("TRIGGER") &&
      has("EVENT") &&
      (global.has("SELECT") ||
        global.has("ALL PRIVILEGES") ||
        global.has("SHOW_ROUTINE") ||
        has("CREATE ROUTINE") ||
        has("ALTER ROUTINE") ||
        has("EXECUTE")),
    "INITIAL_METADATA_VISIBILITY",
  );
}
