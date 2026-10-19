import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const catalog = JSON.parse(
  readFileSync(new URL('../fixtures/asvs-5.0.0-l1-l2.json', import.meta.url), 'utf8')
);
const matrix = readFileSync(`${root}docs/security/ASVS_5_0_L1_L2_MATRIX.md`, 'utf8');
const VERDICTS = [
  'ATENDIDO',
  'PARCIAL',
  'NÃO ATENDIDO',
  'NÃO APLICÁVEL',
  'NÃO VERIFICÁVEL LOCALMENTE'
];

const rows = matrix
  .split('\n')
  .filter((line) => /^\| V\d+\.\d+\.\d+ \|/.test(line))
  .map((line) => {
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    const [id, level, , applicability, verdict, , evidence, owner] = cells;
    return { id, level: Number(level), applicability, verdict, evidence, owner };
  });

const citedPaths = (text) =>
  [...text.matchAll(/`((?:backend|frontend|docs|scripts)\/[^`:]+?)(?::[\d,-]+)?`/g)].map(
    (match) => match[1]
  );

describe('matriz ASVS 5.0.0 L1+L2', () => {
  it('tem exatamente os 253 identificadores do catálogo congelado, com o mesmo nível', () => {
    expect(catalog).toHaveLength(253);
    expect(rows.map(({ id }) => id)).toEqual(catalog.map(({ id }) => id));
    expect(rows.map(({ level }) => level)).toEqual(catalog.map(({ level }) => level));
  });

  it('usa só os cinco vereditos admitidos', () => {
    for (const { id, verdict } of rows) expect(VERDICTS, id).toContain(verdict);
  });

  it('todo veredito positivo cita um caminho que existe no repositório', () => {
    for (const { id, evidence } of rows.filter((row) => row.verdict === 'ATENDIDO')) {
      const paths = citedPaths(evidence);
      expect(paths.length, id).toBeGreaterThan(0);
      for (const path of paths) expect(existsSync(`${root}${path}`), `${id}: ${path}`).toBe(true);
    }
  });

  it('nenhum NÃO APLICÁVEL fica sem a linha do inventário que o justifica', () => {
    for (const { id, applicability } of rows.filter((row) => row.verdict === 'NÃO APLICÁVEL'))
      expect(applicability, id).toMatch(/^INV-\d{2}: \S/);
  });

  it('todo NÃO VERIFICÁVEL LOCALMENTE nomeia o dono', () => {
    for (const { id, owner } of rows.filter((row) => row.verdict === 'NÃO VERIFICÁVEL LOCALMENTE'))
      expect(owner, id).toMatch(/S2-0[89]|S2-10/);
  });
});
