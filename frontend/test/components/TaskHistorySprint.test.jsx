import { describe, expect, it } from 'vitest';
import {
  formatHistoryValue,
  historyFieldLabels
} from '../../src/features/tasks/components/kanban-display.js';

const sprints = [
  { id: 3, name: 'Sprint 1' },
  { id: 7, name: 'Sprint 2' }
];

describe('formatHistoryValue com SPRINT', () => {
  it('resolve o nome da sprint quando a lista esta disponivel', () => {
    expect(formatHistoryValue('SPRINT', '3', [], sprints)).toBe('Sprint 1');
    expect(formatHistoryValue('SPRINT', 7, [], sprints)).toBe('Sprint 2');
  });

  it('degrada para o ID quando a lista de sprints esta vazia', () => {
    expect(formatHistoryValue('SPRINT', '3', [], [])).toBe('Sprint #3');
  });

  it('degrada para o ID quando o quarto parametro e omitido', () => {
    expect(formatHistoryValue('SPRINT', '3', [])).toBe('Sprint #3');
  });

  it('trata valor nulo como ausencia de Sprint', () => {
    expect(formatHistoryValue('SPRINT', null, [], sprints)).toBe('Sem Sprint');
  });
});

describe('ramos existentes preservados com tres argumentos', () => {
  const members = [{ id: 1, user: { id: 9, name: 'Ana' } }];

  it('mantem STATUS', () => {
    expect(formatHistoryValue('STATUS', 'A_FAZER', members)).toBe('A Fazer');
  });

  it('mantem PRIORITY', () => {
    expect(formatHistoryValue('PRIORITY', 'ALTA', members)).toBe('Alta');
  });

  it('mantem DEADLINE', () => {
    expect(formatHistoryValue('DEADLINE', '2026-08-14T00:00:00.000Z', members)).toBe('14/08/2026');
  });

  it('mantem RESPONSIBLE resolvido e o fallback', () => {
    expect(formatHistoryValue('RESPONSIBLE', '9', members)).toBe('Ana');
    expect(formatHistoryValue('RESPONSIBLE', '99', members)).toBe('Usuário #99');
  });
});

describe('rotulo do campo', () => {
  it('expoe Sprint no mapa de rotulos', () => {
    expect(historyFieldLabels.SPRINT).toBe('Sprint');
  });
});
