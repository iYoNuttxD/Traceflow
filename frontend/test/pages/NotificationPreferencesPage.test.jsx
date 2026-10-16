import { MemoryRouter } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn()
}));
vi.mock('../../src/features/notifications/api/notifications.api.js', () => api);

import { NotificationPreferencesPage } from '../../src/features/notifications/index.js';

function apiError(status, { retryAfter } = {}) {
  const error = new Error('falha');
  error.response = {
    status,
    data: {},
    headers: retryAfter ? { 'retry-after': String(retryAfter) } : {}
  };
  return error;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/notifications']}>
      <NotificationPreferencesPage />
    </MemoryRouter>
  );
}

const statusSwitch = () =>
  screen.getByRole('checkbox', { name: /Mudança de status das minhas tarefas/ });
const overdueSwitch = () =>
  screen.getByRole('checkbox', { name: /Prazo vencido das minhas tarefas/ });
const issueSwitch = () =>
  screen.getByRole('checkbox', { name: /Issues vinculadas às tarefas de que você participa/ });
const pullRequestSwitch = () =>
  screen.getByRole('checkbox', {
    name: /Pull requests vinculadas às tarefas de que você participa/
  });
const saveButton = () => screen.getByRole('button', { name: 'Salvar preferências' });

beforeEach(() => {
  vi.clearAllMocks();
  api.getNotificationPreferences.mockResolvedValue({
    preferences: {
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    }
  });
});

describe('S2-02 preferências de notificação (D7)', () => {
  it('carrega os dois tipos com explicação e o canal só na aplicação', async () => {
    renderPage();

    await waitFor(() => expect(statusSwitch()).toBeChecked());
    expect(overdueSwitch()).not.toBeChecked();
    expect(screen.getByText(/inclusive quando é você quem muda/)).toBeInTheDocument();
    expect(screen.getByText(/passa do prazo/)).toBeInTheDocument();
    expect(screen.getByText(/aparecem só aqui no TRACEFLOW/)).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.setup().click(saveButton());
    expect(api.saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it('salva, confirma e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences.mockResolvedValue({
      preferences: {
        TASK_STATUS_CHANGED: false,
        TASK_OVERDUE: false,
        ISSUE_EVENT: true,
        PULL_REQUEST_EVENT: true
      }
    });
    renderPage();
    await waitFor(() => expect(statusSwitch()).toBeChecked());

    await user.click(statusSwitch());
    await user.click(saveButton());

    expect(api.saveNotificationPreferences).toHaveBeenCalledWith({
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    expect(await screen.findByText('Preferências salvas.')).toBeInTheDocument();
    expect(statusSwitch()).not.toBeChecked();
    await waitFor(() => expect(saveButton()).toHaveFocus());
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('erro ao salvar mantém a escolha, avisa e devolve o foco', async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences.mockRejectedValue(apiError(500));
    renderPage();
    await waitFor(() => expect(statusSwitch()).toBeChecked());

    await user.click(overdueSwitch());
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O TRACEFLOW encontrou um problema interno.'
    );
    expect(overdueSwitch()).toBeChecked();
    await waitFor(() => expect(saveButton()).toHaveFocus());
    expect(saveButton()).toHaveAttribute('aria-disabled', 'false');
  });

  it('429 ao salvar informa a espera', async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences.mockRejectedValue(apiError(429, { retryAfter: 40 }));
    renderPage();
    await waitFor(() => expect(statusSwitch()).toBeChecked());

    await user.click(overdueSwitch());
    await user.click(saveButton());

    expect(await screen.findByText(/Aguarde 40 segundos/)).toBeInTheDocument();
  });

  it('falha ao carregar mostra erro com nova tentativa', async () => {
    const user = userEvent.setup();
    api.getNotificationPreferences.mockRejectedValueOnce(apiError(503));
    renderPage();

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(statusSwitch()).toBeChecked());
  });
});

describe('S2-03 preferências dos avisos do GitHub (D7, D13)', () => {
  it('F5 mostra dois grupos com quatro interruptores e salva as quatro chaves', async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences.mockImplementation(async (preferences) => ({ preferences }));
    renderPage();
    await waitFor(() => expect(issueSwitch()).toBeChecked());

    const tasks = screen.getByRole('group', { name: 'Avisos sobre as suas tarefas' });
    const github = screen.getByRole('group', { name: 'Avisos do GitHub' });
    expect(within(tasks).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(github).getAllByRole('checkbox')).toHaveLength(2);
    expect(issueSwitch()).toHaveAccessibleDescription(
      /responsável, em que comentou ou registrou esforço é fechada ou reaberta no GitHub/
    );
    expect(pullRequestSwitch()).toHaveAccessibleDescription(
      /é mesclada ou fechada sem merge no GitHub/
    );

    await user.click(issueSwitch());
    await user.click(saveButton());

    expect(api.saveNotificationPreferences).toHaveBeenCalledWith({
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: false,
      PULL_REQUEST_EVENT: true
    });
    expect(await screen.findByText('Preferências salvas.')).toBeInTheDocument();
    expect(issueSwitch()).not.toBeChecked();
    expect(pullRequestSwitch()).toBeChecked();
  });
});
