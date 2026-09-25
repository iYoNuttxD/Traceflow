import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/http-client.js', () => ({ httpClient: { get } }));

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

  it('consulta catálogo por projeto', () => {
    indicatorsApi.catalog(4);
    expect(get).toHaveBeenCalledWith('/projects/4/indicators/catalog', {});
  });
});
