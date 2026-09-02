import { describe, expect, it } from 'vitest';
import {
  filterAccessibleProjectIds,
  readProjectIds,
  recordRecentProject,
  selectQuickProjects,
  togglePinnedProject
} from '../../src/app/layout/quick-projects.js';

const projects = Array.from({ length: 7 }, (_, index) => ({
  id: index + 1,
  name: `Projeto ${index + 1}`
}));

describe('preferências de projetos rápidos', () => {
  it('prioriza fixados, completa com recentes não fixados e limita a cinco', () => {
    const selected = selectQuickProjects(projects, ['3', '1'], ['2', '3', '4', '5', '6']);
    expect(selected.map(({ project }) => project.id)).toEqual([3, 1, 2, 4, 5]);
    expect(selected.map(({ pinned }) => pinned)).toEqual([true, true, false, false, false]);
  });

  it('não apresenta IDs locais ausentes da lista autorizada pelo backend', () => {
    expect(filterAccessibleProjectIds(['999', '2'], projects)).toEqual(['2']);
    expect(selectQuickProjects(projects, ['999'], ['998', '2'])).toEqual([
      { project: projects[1], pinned: false }
    ]);
  });

  it('move o projeto acessado para a frente dos recentes sem duplicar', () => {
    expect(recordRecentProject(['2', '1', '3'], 1)).toEqual(['1', '2', '3']);
    expect(recordRecentProject(['1', '2'], 3)).toEqual(['3', '1', '2']);
  });

  it('recusa o sexto pin sem remover os cinco existentes', () => {
    const current = ['1', '2', '3', '4', '5'];
    expect(togglePinnedProject(current, 6)).toEqual({ ids: current, limitReached: true });
  });

  it('trata storage corrompido como preferência vazia', () => {
    const storage = { getItem: () => '{inválido' };
    expect(readProjectIds(storage, 'traceflow.test')).toEqual([]);
  });
});
