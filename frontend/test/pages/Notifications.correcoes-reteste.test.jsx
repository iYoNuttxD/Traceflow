import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Profiler } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act, render, waitFor } from '@testing-library/react';
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

import {
  NotificationsPanel,
  UnreadNotificationsProvider
} from '../../src/features/notifications/index.js';

const closePanel = () => {};

function NotificationsPage() {
  return <NotificationsPanel onClose={closePanel} />;
}

function mediaBlock(css, condition) {
  const start = css.indexOf(`@media ${condition}`);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  return null;
}

function notification(id) {
  return {
    id,
    type: 'TASK_STATUS_CHANGED',
    createdAt: new Date(Date.UTC(2026, 0, 1) + id * 60_000).toISOString(),
    readAt: null,
    project: { id: 9, name: 'Projeto Correções' },
    task: { id: 1000 + id, code: `TASK-${1000 + id}`, title: `Tarefa ${id}`, available: true },
    context: { fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO', actor: { id: 3, name: 'Ana' } },
    link: `/projects/9/kanban?task=${1000 + id}`
  };
}

function cursorServer(count) {
  const store = Array.from({ length: count }, (_, index) => notification(index + 1));
  api.listNotifications.mockImplementation(async ({ page, cursor, limit }) => {
    const visible = [...store].sort((a, b) => b.id - a.id);
    const after = cursor ? visible.findIndex((item) => item.id < Number(cursor)) : -1;
    const start = cursor ? (after === -1 ? visible.length : after) : (page - 1) * limit;
    const slice = visible.slice(start, start + limit);
    return {
      notifications: slice,
      pagination: {
        page: cursor ? null : page,
        limit,
        total: visible.length,
        totalPages: Math.ceil(visible.length / limit)
      },
      unreadCount: visible.length,
      nextCursor: start + limit < visible.length ? String(slice.at(-1).id) : null
    };
  });
  api.getUnreadNotificationCount.mockResolvedValue({ unreadCount: count });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('S2-02 correções do reteste — ponto do ☰ em alto contraste (S202-R08)', () => {
  it('CR-07 o AppShell.css desenha o ponto com cor do sistema quando forced-colors está ativo', () => {
    const css = readFileSync(resolve('src/app/layout/AppShell.css'), 'utf8');
    const block = mediaBlock(css, '(forced-colors: active)');
    const rule = block?.match(/\.trace-shell__menu-dot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(block).not.toBeNull();
    expect(rule).toMatch(/forced-color-adjust:\s*none/);
    expect(rule).toMatch(/background(-color)?:\s*CanvasText/);
  });
});

describe('S2-02 correções do reteste — "Carregar mais" sem refazer a lista (S202-R09)', () => {
  it('CR-08 a cada "Carregar mais", os cartões já exibidos não são refeitos', async () => {
    cursorServer(300);
    const commits = [];
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <UnreadNotificationsProvider>
          <Profiler id="central" onRender={(_, __, actual, base) => commits.push({ actual, base })}>
            <Routes>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </Profiler>
        </UnreadNotificationsProvider>
      </MemoryRouter>
    );
    const panel = () => document.body.querySelector('[role="dialog"]');
    const cards = () => panel().querySelectorAll('article').length;
    const loadMore = () =>
      [...panel().querySelectorAll('button')].find((button) =>
        /^Carregar mais \(\d+ restantes\)$/.test(button.textContent)
      );
    await waitFor(() => expect(cards()).toBe(20));

    const shares = [];
    for (let click = 1; click <= 14; click += 1) {
      const mark = commits.length;
      await act(async () => loadMore().click());
      await waitFor(() => expect(cards()).toBe(20 * (click + 1)));
      await waitFor(() => expect(loadMore()?.disabled ?? false).toBe(false));
      const measured = commits.slice(mark).filter((commit) => commit.base > 0);
      shares.push(Math.max(...measured.map((commit) => commit.actual / commit.base)));
    }

    const lastShare = median(shares.slice(-3));
    process.stdout.write(
      `CR-08 ${JSON.stringify({ lastShare: Number(lastShare.toFixed(2)), shares: shares.map((share) => Number(share.toFixed(2))) })}\n`
    );
    expect(cards()).toBe(300);
    expect(lastShare).toBeLessThanOrEqual(0.5);
  }, 120000);
});
