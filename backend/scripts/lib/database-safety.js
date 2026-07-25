export function parseDatabaseUrl(value, label = 'DATABASE_URL') {
  if (!value) throw new Error(`${label} é obrigatória.`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} não é uma URL válida.`); }
  if (parsed.protocol !== 'mysql:') throw new Error(`${label} deve usar MySQL.`);
  return parsed;
}

export function validateTestDatabaseUrl(testDatabaseUrl, developmentDatabaseUrl) {
  const parsed = parseDatabaseUrl(testDatabaseUrl, 'TEST_DATABASE_URL');
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!databaseName || !/(^|[_-])test([_-]|$)/.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL deve apontar claramente para um banco de teste (nome contendo test).');
  }
  if (/(^|[_-])(prod|production)([_-]|$)/.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL não pode apontar para um banco de produção.');
  }
  if (developmentDatabaseUrl && testDatabaseUrl === developmentDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL deve ser diferente de DATABASE_URL.');
  }
  return testDatabaseUrl;
}

export function sanitizedDatabaseTarget(value) {
  const parsed = parseDatabaseUrl(value);
  return { host: parsed.hostname, port: parsed.port || '3306', database: parsed.pathname.replace(/^\//, '') };
}

export function isProductionDatabase(value) {
  const name = parseDatabaseUrl(value).pathname.replace(/^\//, '').toLowerCase();
  return /(^|[_-])(prod|production)([_-]|$)/.test(name);
}
