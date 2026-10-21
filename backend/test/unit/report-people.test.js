import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_PERSON_NAME,
  freezePeople,
  stripPeople
} from '../../src/modules/reports/report-people.js';

describe('S2-06 — pessoas no snapshot do relatório', () => {
  it('remove nomes de toda referência com userId e coleta os IDs, em qualquer profundidade', () => {
    const { snapshot, userIds } = stripPeople({
      project: { id: 3, name: 'Projeto mantém o nome' },
      sprint: { id: 9, name: 'Sprint mantém o nome' },
      indicators: [
        {
          metricId: 'I05',
          people: [
            { userId: 7, displayName: 'Ana', completedTasks: 2, commits: 1 },
            { userId: 4, displayName: 'Bruno', completedTasks: 0, commits: 3 }
          ]
        },
        {
          metricId: 'I28',
          items: [{ taskId: 1, title: 'Tarefa', responsible: { userId: 7, name: 'Ana' } }]
        }
      ],
      responsible: { userId: 11, displayName: 'Carla', username: 'carla', email: 'c@x.invalid' }
    });
    expect(userIds).toEqual([4, 7, 11]);
    expect(snapshot.project).toEqual({ id: 3, name: 'Projeto mantém o nome' });
    expect(snapshot.sprint).toEqual({ id: 9, name: 'Sprint mantém o nome' });
    expect(snapshot.indicators[0].people).toEqual([
      { userId: 7, completedTasks: 2, commits: 1 },
      { userId: 4, completedTasks: 0, commits: 3 }
    ]);
    expect(snapshot.indicators[1].items[0]).toEqual({
      taskId: 1,
      title: 'Tarefa',
      responsible: { userId: 7 }
    });
    expect(snapshot.responsible).toEqual({ userId: 11 });
    expect(JSON.stringify(snapshot)).not.toMatch(/Ana|Bruno|Carla|carla|c@x/);
  });

  it('não trata como pessoa um objeto sem userId inteiro positivo', () => {
    const input = { owner: { userId: '7', name: 'Texto' }, other: { userId: 0, name: 'Zero' } };
    const { snapshot, userIds } = stripPeople(input);
    expect(userIds).toEqual([]);
    expect(snapshot).toEqual(input);
  });

  it('congela nome e usuário vigentes e usa um rótulo neutro para conta inexistente', () => {
    expect(
      freezePeople(
        [7, 8, 9],
        [
          { id: 7, name: 'Ana', username: 'ana' },
          { id: 8, name: 'Usuário excluído', username: 'anonymous_abc' }
        ]
      )
    ).toEqual([
      { userId: 7, displayNameSnapshot: 'Ana', usernameSnapshot: 'ana' },
      { userId: 8, displayNameSnapshot: 'Usuário excluído', usernameSnapshot: 'anonymous_abc' },
      { userId: 9, displayNameSnapshot: UNKNOWN_PERSON_NAME, usernameSnapshot: null }
    ]);
  });
});
