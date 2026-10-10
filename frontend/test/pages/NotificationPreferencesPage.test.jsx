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
const saveButton = () => screen.getByRole('button', { name: 'Salvar preferências' });

beforeEach(() => {
  vi.clearAllMocks();
  api.getNotificationPreferences.mockResolvedValue({
    preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false }
  });
});

describe('S2-02 preferências de notificação (D7)', () => {
  it('carrega os dois tipos com explicação e o canal só na aplicação', async () => {
    renderPage();

    await waitFor(() => expect(statusSwitch()).toBeChecked());
    expect(overdueSwitch()).not.toBeChecked();
    expect(
      screen.getByText(/alguém muda o status de uma tarefa da qual você é responsável/)
    ).toBeInTheDocument();
    expect(screen.getByText(/passa do prazo/)).toBeInTheDocument();
    expect(screen.getByText(/aparecem só aqui no TRACEFLOW/)).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.setup().click(saveButton());
    expect(api.saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it('salva, confirma e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences.mockResolvedValue({
      preferences: { TASK_STATUS_CHANGED: false, TASK_OVERDUE: false }
    });
    renderPage();
    await waitFor(() => expect(statusSwitch()).toBeChecked());

    await user.click(statusSwitch());
    await user.click(saveButton());

    expect(api.saveNotificationPreferences).toHaveBeenCalledWith({
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: false
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

    expect(await screen.findByText(/40/)).toBeInTheDocument();
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
