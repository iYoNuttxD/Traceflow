import { describe, expect, it } from 'vitest';
import {
  REPORT_MAX_PERIOD_DAYS,
  createReportBodySchema
} from '../../src/modules/reports/report.validation.js';

const parse = (body) => createReportBodySchema.safeParse(body);
const messages = (result) => result.error.issues.map((issue) => issue.message);

describe('S2-06 — filtro do relatório', () => {
  it('aceita relatório sem recorte, com período completo e com Sprint', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ sprintId: 4 }).success).toBe(true);
    expect(
      parse({ startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'America/Sao_Paulo' })
        .success
    ).toBe(true);
  });

  it('exige as três partes do período juntas, como o painel', () => {
    for (const body of [
      { startDate: '2026-09-01' },
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      { endDate: '2026-09-30', timeZone: 'UTC' },
      { timeZone: 'UTC' }
    ]) {
      const result = parse(body);
      expect(result.success).toBe(false);
      expect(messages(result)).toContain('Período exige startDate, endDate e timeZone.');
    }
  });

  it('recusa período invertido, maior que o teto das visões e fuso inválido', () => {
    expect(
      messages(parse({ startDate: '2026-09-30', endDate: '2026-09-01', timeZone: 'UTC' }))
    ).toContain('A data inicial não pode ser maior que a data final.');
    expect(
      messages(parse({ startDate: '2025-01-01', endDate: '2026-01-02', timeZone: 'UTC' }))
    ).toContain(`O período informado deve ter no máximo ${REPORT_MAX_PERIOD_DAYS} dias.`);
    expect(parse({ startDate: '2025-01-01', endDate: '2026-01-01', timeZone: 'UTC' }).success).toBe(
      true
    );
    expect(
      messages(parse({ startDate: '2026-09-01', endDate: '2026-09-02', timeZone: 'Mars/Base' }))
    ).toContain('Fuso IANA inválido.');
  });

  it('recusa campos desconhecidos e Sprint inválida; normaliza o ID como o restante da API', () => {
    expect(parse({ view: 'GENERAL' }).success).toBe(false);
    expect(parse({ sprintId: 0 }).success).toBe(false);
    expect(parse({ sprintId: 'abc' }).success).toBe(false);
    expect(parse({ sprintId: '3' }).data).toEqual({ sprintId: 3 });
  });
});
