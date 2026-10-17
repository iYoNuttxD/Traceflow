import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: { get, patch } }));

import { indicatorsApi } from '../../src/features/indicators/api/indicators.api.js';

describe('P8 indicators API client', () => {
  beforeEach(() => get.mockReset());

  it('envia uma chamada agregada com view, período IANA, Sprint e responsável', () => {
    const signal = new AbortController().signal;
    indicatorsApi.dashboard(
      4,
      {
        view: 'QUALITY',
        startDate: '2026-09-01',
        endDate: '2026-09-20',
        timeZone: 'America/Sao_Paulo',
        sprintId: 3,
        responsibleUserId: 9
      },
      { signal }
    );
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('/projects/4/indicators/dashboard', {
      signal,
      params: {
        view: 'QUALITY',
        startDate: '2026-09-01',
        endDate: '2026-09-20',
        timeZone: 'America/Sao_Paulo',
        sprintId: 3,
        responsibleUserId: 9
      }
    });
  });

  it('changes only the personal overview flag', () => {
    indicatorsApi.setOverviewPin(4, false);
    expect(patch).toHaveBeenCalledExactlyOnceWith('/projects/4/indicator-preference', {
      pinnedToOverview: false
    });
  });

  it('consulta catálogo por projeto', () => {
    indicatorsApi.catalog(4);
    expect(get).toHaveBeenCalledWith('/projects/4/indicators/catalog', {});
  });
  it('sends the browser timezone for current deadlines even without an event filter', () => {
    indicatorsApi.dashboard(4, { view: 'GENERAL' });
    expect(get.mock.lastCall[1].params).toEqual({
      view: 'GENERAL',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  });
});
