import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationCard } from '../../src/features/notifications/components/NotificationCard.jsx';
import {
  formatInstant,
  notificationCardLabel,
  notificationContextText,
  notificationSubject,
  notificationTypeLabel,
  readToggleLabel
} from '../../src/features/notifications/model/notification-view.js';

const OCCURRED = '2026-10-10T12:00:00.000Z';
const project = { id: 7, name: 'Projeto Alfa' };

const notice = (alert, overrides = {}) => ({
  id: 90,
  type: 'TRACEABILITY_INCONSISTENCY',
  readAt: null,
  createdAt: '2026-10-15T12:00:00.000Z',
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
  it('A-F01 o aviso descreve o artefato, a data e o estado atual do alerta', () => {
    const resolved = { ...open, status: 'RESOLVED', resolvedAt: '2026-10-16T15:00:00.000Z' };
    const dismissed = { ...open, status: 'DISMISSED', dismissedAt: '2026-10-17T15:00:00.000Z' };
    const issue = notice(open, {
      context: {
        ...notice(open).context,
        artifact: { kind: 'ISSUE', number: 45, title: 'Corrigir login', url: null }
      }
    });

    expect(notificationTypeLabel('TRACEABILITY_INCONSISTENCY')).toBe('Inconsistência');
    expect(notificationContextText(notice(open))).toBe(
      `Pull request #8 mesclada sem tarefa em ${formatInstant(OCCURRED)}; em aberto`
    );
    expect(notificationContextText(notice(resolved))).toBe(
      `Pull request #8 mesclada sem tarefa em ${formatInstant(OCCURRED)}; resolvida em ${new Date(
        resolved.resolvedAt
      ).toLocaleDateString('pt-BR')}`
    );
    expect(notificationContextText(notice(dismissed))).toMatch(/; dispensada em /);
    expect(notificationContextText(issue)).toMatch(/^Issue #45 fechada sem tarefa em /);
    expect(notificationContextText(notice(null))).not.toMatch(/;/);
    expect(notificationSubject(notice(open))).toEqual({ code: 'PR #8', title: 'Ajusta login' });
  });

  it('A-F02 o resumo conta as inconsistências por tipo, sem artefato', () => {
    expect(notificationSubject(summary)).toEqual({ code: null, title: '12 inconsistências novas' });
    expect(notificationContextText(summary)).toBe('9 PRs mescladas e 3 issues fechadas sem tarefa');
    expect(
      notificationContextText({
        ...summary,
        context: { ...summary.context, batch: { total: 11, pullRequests: 11, issues: 0 } }
      })
    ).toBe('11 PRs mescladas sem tarefa');
    expect(notificationCardLabel(summary)).toBe(
      'Inconsistência: 12 inconsistências novas. 9 PRs mescladas e 3 issues fechadas sem tarefa'
    );
    expect(readToggleLabel(summary)).toBe(
      'Marcar como lida: 9 PRs mescladas e 3 issues fechadas sem tarefa, projeto Projeto Alfa'
    );
  });

  it('A-F03 o cartão sem tarefa abre o Repositório, oferece o GitHub e não quebra', () => {
    render(
      <MemoryRouter>
        <NotificationCard
          notification={notice(open)}
          busy={false}
          onToggleRead={vi.fn()}
          onOpen={vi.fn()}
        />
        <NotificationCard
          notification={summary}
          busy={false}
          onToggleRead={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>
    );

    const [single, batch] = screen.getAllByRole('article');
    expect(single).toHaveAccessibleName(
      `Inconsistência: PR #8 Ajusta login. Pull request #8 mesclada sem tarefa em ${formatInstant(
        OCCURRED
      )}; em aberto`
    );
    expect(
      screen.getByRole('link', { name: 'Ver no Repositório: PR #8 Ajusta login' })
    ).toHaveAttribute('href', '/projects/7/repository?alerta=12');
    expect(
      screen.getByRole('link', { name: 'Ver no Repositório: 12 inconsistências novas' })
    ).toHaveAttribute('href', '/projects/7/repository?inconsistencia=OPEN');
    expect(screen.getByRole('link', { name: /Abrir no GitHub a pull request #8/ })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/8'
    );
    expect(batch).not.toHaveTextContent('Tarefa excluída');
    expect(screen.queryByText('Abrir tarefa')).not.toBeInTheDocument();
  });
});
