import { createHash } from 'node:crypto';
import { requireCondition as check } from './oci-compatibility-safety.js';
import { parseRoleAttestationJson } from './heatwave-role-attestation.js';

// Closed model, deliberately narrower than MySQL's general privilege system.
// These are column NAMES, never authentication values.
export const schemaPrivileges = Object.freeze([
  'Select_priv',
  'Insert_priv',
  'Update_priv',
  'Delete_priv',
  'Create_priv',
  'Drop_priv',
  'Grant_priv',
  'References_priv',
  'Index_priv',
  'Alter_priv',
  'Create_tmp_table_priv',
  'Lock_tables_priv',
  'Create_view_priv',
  'Show_view_priv',
  'Create_routine_priv',
  'Alter_routine_priv',
  'Execute_priv',
  'Event_priv',
  'Trigger_priv'
]);
export const globalPrivileges = Object.freeze([
  ...schemaPrivileges,
  'Reload_priv',
  'Shutdown_priv',
  'Process_priv',
  'File_priv',
  'Show_db_priv',
  'Super_priv',
  'Repl_slave_priv',
  'Repl_client_priv',
  'Create_user_priv',
  'Create_tablespace_priv',
  'Create_role_priv',
  'Drop_role_priv'
]);
export const aclColumns = Object.freeze(
  Object.fromEntries(
    Object.entries({
      user: [
        'Host',
        'User',
        ...globalPrivileges,
        'ssl_type',
        'ssl_cipher',
        'x509_issuer',
        'x509_subject',
        'max_questions',
        'max_updates',
        'max_connections',
        'max_user_connections',
        'plugin',
        'authentication_string',
        'password_expired',
        'password_last_changed',
        'password_lifetime',
        'account_locked',
        'Password_reuse_history',
        'Password_reuse_time',
        'Password_require_current',
        'User_attributes'
      ],
      global_grants: ['USER', 'HOST', 'PRIV', 'WITH_GRANT_OPTION'],
      db: ['Host', 'Db', 'User', ...schemaPrivileges],
      tables_priv: [
        'Host',
        'Db',
        'User',
        'Table_name',
        'Grantor',
        'Timestamp',
        'Table_priv',
        'Column_priv'
      ],
      columns_priv: ['Host', 'Db', 'User', 'Table_name', 'Column_name', 'Timestamp', 'Column_priv'],
      procs_priv: [
        'Host',
        'Db',
        'User',
        'Routine_name',
        'Routine_type',
        'Grantor',
        'Proc_priv',
        'Timestamp'
      ],
      role_edges: ['FROM_HOST', 'FROM_USER', 'TO_HOST', 'TO_USER', 'WITH_ADMIN_OPTION'],
      default_roles: ['HOST', 'USER', 'DEFAULT_ROLE_HOST', 'DEFAULT_ROLE_USER'],
      proxies_priv: [
        'Host',
        'User',
        'Proxied_host',
        'Proxied_user',
        'With_grant',
        'Grantor',
        'Timestamp'
      ]
    }).map(([table, columns]) => [table, Object.freeze(columns)])
  )
);
export const AUDIT_MODEL = 'mysql-26.7-absent-v1';
export const GRANTS = Object.freeze([
  'GRANT SELECT ON `traceflow`.* TO `traceflow_diag`@`10.20.1.184`',
  'GRANT USAGE ON *.* TO `traceflow_diag`@`10.20.1.184`'
]);
const q = (name) => '`' + name + '`';
const rowSql = (table, columns, predicate) =>
  'SELECT JSON_ARRAY(' +
  columns.map(q).join(', ') +
  ') FROM mysql.' +
  q(table) +
  ' WHERE ' +
  predicate;
const diag = "User = 'traceflow_diag'";
const identity =
  'SELECT JSON_ARRAY(@@server_uuid, VERSION(), @@port, CURRENT_USER(), CONNECTION_ID(), @@GLOBAL.mandatory_roles, @@GLOBAL.activate_all_roles_on_login, @@GLOBAL.partial_revokes, @@SESSION.sql_notes, @@GLOBAL.require_secure_transport)';
const plan = [
  ['IDENTITY_START', identity, 10],
  ['SESSION_TLS', "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')", 2],
  [
    'MODEL',
    "SELECT JSON_ARRAY(TABLE_NAME, COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'mysql' AND TABLE_NAME IN (" +
      Object.keys(aclColumns)
        .map((x) => "'" + x + "'")
        .join(', ') +
      ') ORDER BY TABLE_NAME, ORDINAL_POSITION',
    2
  ],
  ['PUBLIC', "SELECT JSON_ARRAY(User, Host) FROM mysql.user WHERE User = 'public'", 2],
  [
    'USER',
    'SELECT JSON_ARRAY(' +
      ['Host', 'User', ...globalPrivileges, 'ssl_type', 'account_locked'].map(q).join(', ') +
      ", JSON_EXTRACT(User_attributes, '$.Restrictions')) FROM mysql.user WHERE " +
      diag,
    globalPrivileges.length + 5
  ],
  ['DYNAMIC', rowSql('global_grants', aclColumns.global_grants, diag), 4],
  [
    'SCHEMA',
    rowSql('db', ['Host', 'Db', 'User', ...schemaPrivileges], diag),
    schemaPrivileges.length + 3
  ],
  [
    'TABLE',
    rowSql('tables_priv', ['Host', 'Db', 'User', 'Table_name', 'Table_priv', 'Column_priv'], diag),
    6
  ],
  [
    'COLUMN',
    rowSql(
      'columns_priv',
      ['Host', 'Db', 'User', 'Table_name', 'Column_name', 'Column_priv'],
      diag
    ),
    6
  ],
  [
    'ROUTINE',
    rowSql('procs_priv', ['Host', 'Db', 'User', 'Routine_name', 'Routine_type', 'Proc_priv'], diag),
    6
  ],
  [
    'EDGES',
    rowSql(
      'role_edges',
      aclColumns.role_edges,
      "FROM_USER IN ('traceflow_diag','public') OR TO_USER IN ('traceflow_diag','public')"
    ),
    5
  ],
  [
    'DEFAULTS',
    rowSql(
      'default_roles',
      aclColumns.default_roles,
      "USER IN ('traceflow_diag','public') OR DEFAULT_ROLE_USER IN ('traceflow_diag','public')"
    ),
    4
  ],
  [
    'PROXY',
    rowSql('proxies_priv', ['Host', 'User', 'Proxied_host', 'Proxied_user', 'With_grant'], diag),
    5
  ],
  ['GRANTS', "SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184'", 1],
  ['IDENTITY_END', identity, 10]
];
export const ADMIN_PLAN = Object.freeze(
  plan.map(([id, sql, width]) => Object.freeze({ id, sql, width }))
);
export const PLAN_SHA256 = createHash('sha256').update(JSON.stringify(ADMIN_PLAN)).digest('hex');

export function exact(value, keys, code = 'AUDIT_CONTRACT_INVALID') {
  check(value && typeof value === 'object' && !Array.isArray(value), code);
  const names = Reflect.ownKeys(value);
  check(names.length === keys.length && names.every((key) => keys.includes(key)), code);
  check(
    names.every((key) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')),
    code
  );
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');
export const byteHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const cid = (value) => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);

// Markers only surround Q + its immediate diagnostic count. No SQL is inserted
// between them. Each marker also checks the physical session. No user SQL input.
export function administrativeSql() {
  return (
    ADMIN_PLAN.map(
      ({ id, sql }) =>
        "SELECT 'TF_W02_" +
        id +
        "_BEGIN', CONNECTION_ID();\n" +
        sql +
        ";\nSHOW COUNT(*) WARNINGS;\nSELECT 'TF_W02_" +
        id +
        "_END', CONNECTION_ID();"
    ).join('\n') + '\n'
  );
}

export function parseAdministrativeTranscript(text) {
  check(
    typeof text === 'string' &&
      Buffer.byteLength(text) <= 65536 &&
      text.endsWith('\n') &&
      !text.includes('\r'),
    'ADMIN_OUTPUT_INVALID'
  );
  const lines = text.slice(0, -1).split('\n');
  const observations = [];
  let pos = 0,
    connectionId;
  for (const spec of ADMIN_PLAN) {
    const start = lines[pos++]?.split('\t');
    check(
      start?.length === 2 && start[0] === 'TF_W02_' + spec.id + '_BEGIN' && cid(start[1]),
      'ADMIN_FRAME_INVALID'
    );
    connectionId ??= start[1];
    check(start[1] === connectionId, 'ADMIN_SESSION_CHANGED');
    const payload = [];
    while (pos < lines.length && !lines[pos].startsWith('TF_W02_' + spec.id + '_END\t'))
      payload.push(lines[pos++]);
    const end = lines[pos++]?.split('\t');
    check(
      end?.length === 2 && end[0] === 'TF_W02_' + spec.id + '_END' && end[1] === connectionId,
      'ADMIN_FRAME_INVALID'
    );
    const counter = payload.pop();
    check(counter === '0', 'ADMIN_WARNINGS_UNVERIFIED');
    check(payload.length <= 512, 'ADMIN_OUTPUT_LIMIT');
    const rows = payload.map((line) => {
      if (spec.id === 'GRANTS') return [line];
      if (spec.id === 'SESSION_TLS') return line.split('\t');
      return parseRoleAttestationJson(line);
    });
    check(
      rows.every((row) => Array.isArray(row) && row.length === spec.width),
      'ADMIN_ROW_INVALID'
    );
    observations.push({
      queryId: spec.id,
      status: 'SUCCESS',
      connectionId,
      warningCount: 0,
      rowCount: rows.length,
      rows
    });
  }
  check(pos === lines.length, 'ADMIN_OUTPUT_TRAILING');
  return observations;
}

export function validateAdministrativeCollection(result, target) {
  exact(result, ['exitCode', 'signal', 'stderrBytes', 'stdout']);
  check(
    result.exitCode === 0 && result.signal === null && result.stderrBytes === 0,
    'ADMIN_SQL_FAILED'
  );
  const observations = parseAdministrativeTranscript(result.stdout);
  validateAdministrativeObservations(observations, target);
  return observations;
}

// Full contents, not just counts. Only the exact approved profile can succeed.
// No role expansion is attempted: any edge/default/existing public is refused.
export function validateAdministrativeObservations(observations, target) {
  check(
    Array.isArray(observations) && observations.length === ADMIN_PLAN.length,
    'ADMIN_SOURCES_INCOMPLETE'
  );
  let connectionId;
  const byId = {};
  observations.forEach((entry, index) => {
    exact(entry, ['queryId', 'status', 'connectionId', 'warningCount', 'rowCount', 'rows']);
    const spec = ADMIN_PLAN[index];
    check(
      entry.queryId === spec.id &&
        entry.status === 'SUCCESS' &&
        entry.warningCount === 0 &&
        cid(entry.connectionId),
      'ADMIN_SOURCE_INVALID'
    );
    connectionId ??= entry.connectionId;
    check(entry.connectionId === connectionId, 'ADMIN_SESSION_CHANGED');
    check(
      Array.isArray(entry.rows) &&
        entry.rowCount === entry.rows.length &&
        entry.rowCount <= 512 &&
        entry.rows.every(
          (row) =>
            Array.isArray(row) &&
            row.length === spec.width &&
            row.every(
              (v) =>
                v === null ||
                typeof v === 'string' ||
                (typeof v === 'number' && Number.isSafeInteger(v))
            )
        ),
      'ADMIN_ROW_INVALID'
    );
    byId[entry.queryId] = entry.rows;
  });
  const first = byId.IDENTITY_START,
    last = byId.IDENTITY_END;
  check(first.length === 1 && same(first, last), 'ADMIN_IDENTITY_CHANGED');
  check(
    same(first[0], [
      target.serverUuid,
      target.version,
      target.port,
      'traceflow_admin@%',
      Number(connectionId),
      'public',
      0,
      1,
      1,
      1
    ]),
    'ADMIN_IDENTITY_MISMATCH'
  );
  const tls = byId.SESSION_TLS;
  check(
    tls.length === 2 &&
      tls.every((row) => row.every((v) => typeof v === 'string')) &&
      new Set(tls.map((row) => row[0])).size === 2,
    'ADMIN_TLS_INVALID'
  );
  const tlsValues = Object.fromEntries(tls);
  check(
    tlsValues.Ssl_cipher?.length > 0 && ['TLSv1.2', 'TLSv1.3'].includes(tlsValues.Ssl_version),
    'ADMIN_TLS_INVALID'
  );
  const expectedColumns = Object.entries(aclColumns)
    .flatMap(([table, cols]) => cols.map((col) => table + '.' + col))
    .sort();
  check(
    same(byId.MODEL.map((row) => row.join('.')).sort(), expectedColumns),
    'ADMIN_MODEL_UNRECOGNIZED'
  );
  check(byId.PUBLIC.length === 0, 'ROLE_PRESENT_UNVERIFIED');
  const user = byId.USER;
  check(
    user.length === 1 && user[0][0] === '10.20.1.184' && user[0][1] === 'traceflow_diag',
    'ADMIN_ACCOUNT_MISMATCH'
  );
  check(
    user[0].slice(2, 2 + globalPrivileges.length).every((v) => v === 'N'),
    'ADMIN_GLOBAL_PRIVILEGE'
  );
  check(user[0][2 + globalPrivileges.length] === 'ANY', 'ADMIN_TLS_REQUIRED');
  check(user[0][3 + globalPrivileges.length] === 'Y', 'ADMIN_ACCOUNT_NOT_LOCKED');
  check(user[0][4 + globalPrivileges.length] === null, 'ADMIN_PARTIAL_REVOKE');
  const schema = byId.SCHEMA;
  check(
    schema.length === 1 &&
      same(schema[0].slice(0, 3), ['10.20.1.184', 'traceflow', 'traceflow_diag']) &&
      schema[0].slice(3).every((v, i) => v === (schemaPrivileges[i] === 'Select_priv' ? 'Y' : 'N')),
    'ADMIN_SCHEMA_PRIVILEGE'
  );
  for (const name of ['DYNAMIC', 'TABLE', 'COLUMN', 'ROUTINE', 'EDGES', 'DEFAULTS', 'PROXY'])
    check(byId[name].length === 0, 'ADMIN_UNEXPECTED_' + name);
  check(same(byId.GRANTS.map((row) => row[0]).sort(), GRANTS), 'ADMIN_GRANTS_MISMATCH');
  // Connection IDs are intentionally different across the two administrative sessions.
  // Transient session TLS cipher is not an ACL property; each session checks it separately.
  const state = {
    model: AUDIT_MODEL,
    roleState: 'ABSENT',
    account: target.account,
    mandatoryRoles: 'public',
    activateAllRolesOnLogin: 0,
    partialRevokes: 1,
    privileges: ['SELECT'],
    schema: 'traceflow',
    sslType: 'ANY',
    accountLocked: 'Y',
    schemaDigest: digest(expectedColumns)
  };
  return { state, stateSha256: digest(state) };
}

// A reversible representation of the two approved statements, not an approval
// boolean/marker. Scope, grantee, delegation and the original bytes' digest are
// retained. Unknown statements cannot enter this representation.
export function grantEvidence(statement) {
  check(GRANTS.includes(statement), 'ADMIN_GRANTS_MISMATCH');
  const schema = statement.startsWith('GRANT SELECT ');
  return {
    privilege: schema ? 'SELECT' : 'USAGE',
    scope: schema ? 'schema' : 'global',
    database: schema ? 'traceflow' : null,
    object: '*',
    granteeUser: 'traceflow_diag',
    granteeHost: '10.20.1.184',
    grantOption: false,
    adminOption: false,
    sourceSha256: byteHash(statement)
  };
}
export function restoreGrantEvidence(value) {
  exact(value, [
    'privilege',
    'scope',
    'database',
    'object',
    'granteeUser',
    'granteeHost',
    'grantOption',
    'adminOption',
    'sourceSha256'
  ]);
  const source = GRANTS.find((sql) => canonical(grantEvidence(sql)) === canonical(value));
  check(source, 'ADMIN_GRANTS_MISMATCH');
  return source;
}
export function encodeAdministrativeObservations(observations, target) {
  // Audit every original result before serialization. Re-audit after decoding.
  validateAdministrativeObservations(observations, target);
  return observations.map((entry) => ({
    ...entry,
    rows:
      entry.queryId === 'GRANTS'
        ? entry.rows.map(([statement]) => [grantEvidence(statement)])
        : entry.rows.map((row) => [...row])
  }));
}
export function decodeAdministrativeObservations(observations) {
  check(Array.isArray(observations), 'ADMIN_SOURCES_INCOMPLETE');
  return observations.map((entry) => {
    exact(entry, ['queryId', 'status', 'connectionId', 'warningCount', 'rowCount', 'rows']);
    check(Array.isArray(entry.rows), 'ADMIN_ROW_INVALID');
    return {
      ...entry,
      rows:
        entry.queryId === 'GRANTS'
          ? entry.rows.map((row) => {
              check(Array.isArray(row) && row.length === 1, 'ADMIN_ROW_INVALID');
              return [restoreGrantEvidence(row[0])];
            })
          : entry.rows
    };
  });
}
