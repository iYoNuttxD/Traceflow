// Correcao pontual dos registros de cronograma criados antes do ADR-010 D05,
// quando `@db.Date` truncava a escrita para a meia-noite UTC. O risco do script
// nao e falhar: e acertar demais e mexer em quem informou hora de verdade.
import { describe, expect, it, vi } from 'vitest';
import {
  paraMeiaNoiteLocal,
  runS104LegacyScheduleDates
} from '../../scripts/lib/s104-legacy-schedule-dates.js';

const utc = (texto) => new Date(texto);

function clienteFalso({ sprints = [], milestones = [] } = {}) {
  const escritas = { sprint: [], milestone: [] };
  const tx = {
    sprint: {
      update: vi.fn(async (args) => escritas.sprint.push(args))
    },
    milestone: {
      update: vi.fn(async (args) => escritas.milestone.push(args))
    }
  };
  return {
    escritas,
    sprint: { findMany: vi.fn(async () => sprints) },
    milestone: { findMany: vi.fn(async () => milestones) },
    $transaction: vi.fn(async (fn) => fn(tx))
  };
}

const sprint = (id, name, startDate, endDate, projectId = 1) => ({
  id,
  name,
  projectId,
  startDate: utc(startDate),
  endDate: utc(endDate)
});

describe('paraMeiaNoiteLocal', () => {
  // O dia civil e o que a pessoa escolheu; o que muda e o fuso em que ele
  // comeca. Se o dia mudasse, a correcao estaria trocando um erro por outro.
  it('preserva o dia civil e move para a meia-noite local', () => {
    const resultado = paraMeiaNoiteLocal(utc('2026-08-09T00:00:00.000Z'));
    expect(resultado.getFullYear()).toBe(2026);
    expect(resultado.getMonth()).toBe(7);
    expect(resultado.getDate()).toBe(9);
    expect(resultado.getHours()).toBe(0);
    expect(resultado.getMinutes()).toBe(0);
  });
});

describe('runS104LegacyScheduleDates', () => {
  it('nao escreve nada em modo de simulacao', async () => {
    const client = clienteFalso({
      sprints: [sprint(1, 'S1', '2026-08-09T00:00:00.000Z', '2026-08-10T00:00:00.000Z')]
    });
    const relatorio = await runS104LegacyScheduleDates({ client });

    expect(relatorio.aplicado).toBe(false);
    expect(relatorio.sprintsAfetadas).toBe(1);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  // A guarda que importa: quem informou hora nao pode ser tocado, senao o script
  // destroi justamente o dado que o D05 existe para preservar.
  it('ignora valores que nao estao na meia-noite UTC exata', async () => {
    const client = clienteFalso({
      sprints: [
        sprint(1, 'Com hora', '2026-08-09T12:30:00.000Z', '2026-08-10T18:00:00.000Z'),
        sprint(2, 'Quase', '2026-08-09T00:00:00.500Z', '2026-08-10T00:00:01.000Z')
      ]
    });
    const relatorio = await runS104LegacyScheduleDates({ client, apply: true });

    expect(relatorio.sprintsAfetadas).toBe(0);
    expect(client.escritas.sprint).toHaveLength(0);
  });

  // Uma ponta legada e outra informada com hora convivem no mesmo registro.
  it('corrige apenas a ponta legada de uma sprint mista', async () => {
    const client = clienteFalso({
      sprints: [sprint(1, 'Mista', '2026-08-09T00:00:00.000Z', '2026-08-10T18:00:00.000Z')]
    });
    await runS104LegacyScheduleDates({ client, apply: true });

    const [escrita] = client.escritas.sprint;
    expect(Object.keys(escrita.data)).toEqual(['startDate']);
    expect(escrita.data.startDate.getHours()).toBe(0);
  });

  it('aplica sprints e marcos numa unica transacao', async () => {
    const client = clienteFalso({
      sprints: [sprint(1, 'S1', '2026-08-09T00:00:00.000Z', '2026-08-10T00:00:00.000Z')],
      milestones: [{ id: 5, title: 'M1', projectId: 1, dueDate: utc('2026-08-09T00:00:00.000Z') }]
    });
    const relatorio = await runS104LegacyScheduleDates({ client, apply: true });

    expect(relatorio.aplicado).toBe(true);
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(client.escritas.sprint).toHaveLength(1);
    expect(client.escritas.milestone).toHaveLength(1);
  });

  // Deslocar todo mundo pelo mesmo offset preserva a ordem, mas a verificacao
  // nao custa nada — e um invariante vale mais que a suposicao de que ele vale.
  it('recusa a aplicacao se a correcao criar sobreposicao', async () => {
    const client = clienteFalso({
      sprints: [
        sprint(1, 'A', '2026-08-01T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
        // Comeca antes do fim da anterior: o banco ja estava inconsistente.
        sprint(2, 'B', '2026-08-05T00:00:00.000Z', '2026-08-20T00:00:00.000Z')
      ]
    });
    const relatorio = await runS104LegacyScheduleDates({ client, apply: true });

    expect(relatorio.aplicado).toBe(false);
    expect(relatorio.conflitos).toEqual([{ projectId: 1, entre: ['A', 'B'] }]);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('nao acusa sobreposicao entre projetos diferentes', async () => {
    const client = clienteFalso({
      sprints: [
        sprint(1, 'A', '2026-08-01T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 1),
        sprint(2, 'B', '2026-08-05T00:00:00.000Z', '2026-08-20T00:00:00.000Z', 2)
      ]
    });
    const relatorio = await runS104LegacyScheduleDates({ client, apply: true });
    expect(relatorio.conflitos).toEqual([]);
    expect(relatorio.aplicado).toBe(true);
  });
});
