import { MemoryRouter } from 'react-router';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationItem } from '../../src/features/notifications/components/NotificationItem.jsx';
import {
  formatInstant,
  notificationCardLabel,
  notificationSentence,
  notificationState,
  notificationTypeLabel,
  readToggleLabel
} from '../../src/features/notifications/model/notification-view.js';

const OCCURRED = '2026-10-10T12:00:00.000Z';
const CREATED = '2026-10-15T12:00:00.000Z';
const project = { id: 7, name: 'Projeto Alfa' };

const notice = (alert, overrides = {}) => ({
  id: 90,
  type: 'TRACEABILITY_INCONSISTENCY',
  readAt: null,
  createdAt: CREATED,
  project,
  task: null,
  link: '/projects/7/repository?alerta=12',
  context: {
    occurredAt: OCCURRED,
    artifact: {
      kind: 'PULL_REQUEST',
      number: 8,
      title: 'Ajusta login',
      url: 'https://github.com/o/r/pull/8'
    },
    alert,
    batch: null
  },
  ...overrides
});

const open = { id: 12, type: 'PULL_REQUEST_MERGED_WITHOUT_TASK', status: 'OPEN' };

const summary = {
  ...notice(null),
  id: 91,
  link: '/projects/7/repository?inconsistencia=OPEN',
  context: {
    occurredAt: null,
    artifact: null,
    alert: null,
    batch: { total: 12, pullRequests: 9, issues: 3 }
  }
};

describe('PR #26 avisos de inconsistência na central (TF-REV-008)', () => {
  it('A-F01 o aviso descreve o artefato, a data e o estado atual do alerta (painel, TF-REV-008)', () => {
    const resolved = { ...open, status: 'RESOLVED', resolvedAt: '2026-10-16T15:00:00.000Z' };
    const dismissed = { ...open, status: 'DISMISSED', dismissedAt: '2026-10-17T15:00:00.000Z' };
    const issue = notice(open, {
      context: {
        ...notice(open).context,
        artifact: { kind: 'ISSUE', number: 45, title: 'Corrigir login', url: null }
      }
    });

    expect(notificationTypeLabel('TRACEABILITY_INCONSISTENCY')).toBe('Inconsistência');
    expect(notificationSentence(notice(open))).toBe('PR #8 mesclada sem tarefa vinculada');
    expect(notificationCardLabel(notice(open))).toBe(
      `Inconsistência: PR #8 mesclada sem tarefa vinculada. Projeto Alfa, ${formatInstant(CREATED)}`
    );
    expect(notificationState(notice(open))).toBe('em aberto');
    expect(notificationState(notice(resolved))).toBe(
      `resolvida em ${new Date(resolved.resolvedAt).toLocaleDateString('pt-BR')}`
    );
    expect(notificationState(notice(dismissed))).toBe(
      `dispensada em ${new Date(dismissed.dismissedAt).toLocaleDateString('pt-BR')}`
    );
    expect(notificationSentence(issue)).toBe('Issue #45 fechada sem tarefa vinculada');
    expect(notificationState(notice(null))).toBe('');
  });

  it('A-F02 o resumo conta as inconsistências por tipo, sem artefato (painel, TF-REV-008)', () => {
    expect(notificationSentence(summary)).toBe(
      '12 inconsistências novas: 9 PRs mescladas e 3 issues fechadas sem tarefa'
    );
    expect(
      notificationSentence({
        ...summary,
        context: { ...summary.context, batch: { total: 11, pullRequests: 11, issues: 0 } }
      })
    ).toBe('11 inconsistências novas: 11 PRs mescladas sem tarefa');
    expect(notificationState(summary)).toBe('');
    expect(notificationCardLabel(summary)).toBe(
      `Inconsistência: 12 inconsistências novas: 9 PRs mescladas e 3 issues fechadas sem tarefa. Projeto Alfa, ${formatInstant(CREATED)}`
    );
    expect(readToggleLabel(summary)).toBe(
      `Marcar como lida: 12 inconsistências novas: 9 PRs mescladas e 3 issues fechadas sem tarefa, Projeto Alfa, ${formatInstant(CREATED)}`
    );
  });

  it('A-F03 o aviso sem tarefa abre o Repositório, deixa o GitHub para o destino e não quebra (painel, TF-REV-008)', () => {
    render(
      <MemoryRouter>
        <NotificationItem
          notification={notice(open)}
          busy={false}
          onToggleRead={vi.fn()}
          onOpen={vi.fn()}
        />
        <NotificationItem
          notification={summary}
          busy={false}
          onToggleRead={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>
    );

    const [single, batch] = screen.getAllByRole('article');
    expect(single).toHaveAccessibleName(
      `Inconsistência: PR #8 mesclada sem tarefa vinculada. Projeto Alfa, ${formatInstant(CREATED)}`
    );
    expect(single.querySelector('.notification-item__meta')).toHaveTextContent(
      `Projeto Alfa · ${formatInstant(CREATED)} · em aberto`
    );
    expect(
      within(single).getByRole('link', { name: /PR #8 mesclada sem tarefa vinculada/ })
    ).toHaveAttribute('href', '/projects/7/repository?alerta=12');
    expect(
      within(batch).getByRole('link', { name: /12 inconsistências novas: 9 PRs mescladas/ })
    ).toHaveAttribute('href', '/projects/7/repository?inconsistencia=OPEN');
    expect(screen.queryByRole('link', { name: /Abrir no GitHub/ })).not.toBeInTheDocument();
    expect(document.body.querySelector('a[href^="https://github.com"]')).toBeNull();
    expect(single).not.toHaveTextContent('Tarefa excluída');
    expect(batch).not.toHaveTextContent('Tarefa excluída');
    expect(screen.queryByText('Abrir tarefa')).not.toBeInTheDocument();
  });
});
