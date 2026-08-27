import { describe, expect, it, vi } from 'vitest';
import { runAdr011MilestoneSprintAudit } from '../../scripts/lib/adr011-milestone-sprint-audit.js';

function clienteFalso(vinculos, { totalSprints, totalMarcos } = {}) {
  const ordenados = [...vinculos].sort(
    (a, b) =>
      a.sprintId - b.sprintId || new Date(a.prazo) - new Date(b.prazo) || a.marcoId - b.marcoId
  );
  return {
    $queryRawUnsafe: vi.fn(async (sql) => {
      if (sql.includes('FROM Milestone m')) return ordenados;
      if (sql.includes('FROM Sprint')) return [{ total: totalSprints ?? 0 }];
      return [{ total: totalMarcos ?? vinculos.length }];
    })
  };
}

const vinculo = (marcoId, sprintId, prazo, titulo = `M${marcoId}`) => ({
  marcoId,
  marcoTitulo: titulo,
  prazo,
  projectId: 1,
  sprintId,
  sprintNome: `Sprint ${sprintId}`
});

describe('relatorio', () => {
  it('nao reporta perda quando cada sprint tem no maximo um marco', async () => {
    const relatorio = await runAdr011MilestoneSprintAudit({
      client: clienteFalso([vinculo(1, 10, '2026-08-10'), vinculo(2, 11, '2026-08-20')], {
        totalSprints: 2
      })
    });
    expect(relatorio.sprintsComVariosMarcos).toEqual([]);
    expect(relatorio.marcosQueFicamSemSprint).toBe(0);
    expect(relatorio.sprintsQueGanhamMarco).toBe(2);
  });

  it('escolhe o marco de menor prazo e reporta os demais', async () => {
    const relatorio = await runAdr011MilestoneSprintAudit({
      client: clienteFalso(
        [
          vinculo(1, 10, '2026-08-20', 'Depois'),
          vinculo(2, 10, '2026-08-05', 'Antes'),
          vinculo(3, 10, '2026-08-31', 'Muito depois')
        ],
        { totalSprints: 1 }
      )
    });
    const [caso] = relatorio.sprintsComVariosMarcos;
    expect(caso.escolhido).toMatchObject({ marcoId: 2, titulo: 'Antes' });
    expect(caso.perdemOVinculo.map((marco) => marco.marcoId)).toEqual([1, 3]);
    expect(relatorio.marcosQueFicamSemSprint).toBe(2);
  });

  it('desempata prazos iguais pelo menor id', async () => {
    const relatorio = await runAdr011MilestoneSprintAudit({
      client: clienteFalso(
        [vinculo(9, 10, '2026-08-10', 'Nove'), vinculo(4, 10, '2026-08-10', 'Quatro')],
        { totalSprints: 1 }
      )
    });
    expect(relatorio.sprintsComVariosMarcos[0].escolhido.marcoId).toBe(4);
  });

  it('conta as sprints que ficam sem marco', async () => {
    const relatorio = await runAdr011MilestoneSprintAudit({
      client: clienteFalso([vinculo(1, 10, '2026-08-10')], { totalSprints: 4 })
    });
    expect(relatorio.sprintsQueFicamSemMarco).toBe(3);
  });

  it('projeto sem marco algum nao acusa perda', async () => {
    const relatorio = await runAdr011MilestoneSprintAudit({
      client: clienteFalso([], { totalSprints: 2, totalMarcos: 0 })
    });
    expect(relatorio).toMatchObject({
      jaInvertido: false,
      sprintsQueGanhamMarco: 0,
      marcosQueFicamSemSprint: 0
    });
  });
});

describe('migration ja aplicada', () => {
  it('reconhece a ausencia de Milestone.sprintId', async () => {
    const client = {
      $queryRawUnsafe: vi.fn(async () => {
        throw new Error("Unknown column 'm.sprintId' in 'field list'");
      })
    };
    const relatorio = await runAdr011MilestoneSprintAudit({ client });
    expect(relatorio.jaInvertido).toBe(true);
    expect(relatorio.mensagem).toMatch(/migration ja foi aplicada/);
  });

  it('propaga erro que nao e coluna ausente', async () => {
    const client = {
      $queryRawUnsafe: vi.fn(async () => {
        throw new Error('Connection refused');
      })
    };
    await expect(runAdr011MilestoneSprintAudit({ client })).rejects.toThrow(/Connection refused/);
  });
});
