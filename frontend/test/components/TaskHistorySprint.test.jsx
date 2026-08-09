// RF10 §9.4: regressao do historico de tarefas apos estender TaskHistoryField.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatHistoryValue,
  historyFieldLabels
} from '../../src/features/tasks/components/kanban-display.js';
import { MovementHistory } from '../../src/features/tasks/components/MovementHistory.jsx';

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

  it('trata valor nulo como nao informado', () => {
    expect(formatHistoryValue('SPRINT', null, [], sprints)).toBe('Não informado');
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

function renderHistory(props = {}) {
  const noop = () => {};
  return render(
    <MovementHistory
      movements={[
        {
          id: 1,
          taskId: 5,
          taskTitle: 'Finalizar login',
          field: 'SPRINT',
          fromValue: null,
          toValue: '3',
          actorUserId: 9,
          actor: { id: 9, name: 'Ana' },
          occurredAt: '2026-08-05T12:00:00.000Z'
        }
      ]}
      pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
      rangeStart={1}
      rangeEnd={1}
      currentPage={1}
      totalPages={1}
      pageSize={10}
      period={{ startDate: '', endDate: '' }}
      memberFilter=""
      fieldFilter=""
      members={[]}
      metrics={{}}
      onPeriodChange={noop}
      onMemberFilterChange={noop}
      onFieldFilterChange={noop}
      onSubmit={noop}
      onClear={noop}
      onPageChange={noop}
      {...props}
    />
  );
}

describe('MovementHistory com entradas de sprint', () => {
  it('exibe o rotulo Sprint e o nome, nao o enum cru nem o ID', () => {
    renderHistory({ sprints });
    const entry = screen.getByText(/Sprint:/);
    expect(entry).toHaveTextContent('Sprint: Não informado para Sprint 1');
    expect(screen.queryByText(/SPRINT:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sprint #3/)).not.toBeInTheDocument();
  });

  it('degrada para o ID quando a prop sprints nao e passada', () => {
    renderHistory();
    expect(screen.getByText(/Sprint:/)).toHaveTextContent('Sprint #3');
  });

  it('oferece Sprint como opcao no filtro por campo', () => {
    renderHistory({ sprints });
    expect(screen.getByRole('option', { name: 'Sprint' })).toBeInTheDocument();
  });
});
