import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const patterns = [
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g
  },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Database URL with password', pattern: /\bmysql:\/\/[^\s/:]+:[^\s@]+@[^\s]+/gi },
  { name: 'JWT secret assignment', pattern: /\bJWT_SECRET\s*[:=]\s*["'][^"']{12,}["']/gi }
];

const allowedPlaceholders = [
  /mysql:\/\/usuario:senha@localhost/i,
  /mysql:\/\/user:password@localhost/i,
  /mysql:\/\/traceflow:traceflow@localhost/i,
  /mysql:\/\/root:traceflow_root_ci@localhost/i,
  /seu_token_do_github/i
];

export function scanText(source, file = 'unknown') {
  const findings = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (allowedPlaceholders.some((placeholder) => placeholder.test(line))) return;
    for (const { name, pattern } of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) findings.push({ file, line: index + 1, type: name });
    }
  });
  return findings;
}

function defaultFiles(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error('Não foi possível enumerar os arquivos do repositório.');
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => existsSync(resolve(root, file)))
    .filter((file) => {
      if (/^(?:backend|frontend)\/(?:node_modules|coverage|dist)\//.test(file)) return false;
      if (/^(?:docs|backend\/test|frontend\/test)\//.test(file)) return false;
      if (/package-lock\.json$/.test(file)) return false;
      return (
        ['.js', '.jsx', '.mjs', '.json', '.yml', '.yaml', '.env', '.example'].includes(
          extname(file)
        ) || /(?:^|\/)\.env\.example$/.test(file)
      );
    });
}

export function scanFiles(files, root = process.cwd()) {
  return files.flatMap((file) => {
    const path = resolve(root, file);
    if (!existsSync(path)) return [];
    return scanText(readFileSync(path, 'utf8'), relative(root, path));
  });
}

function main() {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const requested = process.argv.slice(2);
  const files = requested.length > 0 ? requested : defaultFiles(root);
  const findings = scanFiles(files, root);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${finding.line} [${finding.type}] possível segredo detectado\n`
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Secret scan aprovado (${files.length} arquivos verificados).\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
