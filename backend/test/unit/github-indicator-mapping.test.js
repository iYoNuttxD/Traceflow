import { describe, expect, it, vi } from 'vitest';
import { createGithubClient } from '../../src/modules/github/github.client.js';
import {
  mapGithubCommit,
  mapGithubPullRequestLifecycleEvent
} from '../../src/modules/github/github.mapper.js';

describe('dados GitHub para a fundação de indicadores', () => {
  it('usa author.id estável e deixa autoria não resolvida sem associação', () => {
    const payload = {
      sha: 'a',
      author: { id: 123, login: 'old-login' },
      commit: { author: { name: 'Mesmo nome', email: 'x@example.invalid' } }
    };
    expect(mapGithubCommit(payload)).toMatchObject({
      authorGithubUserId: '123',
      authorUsername: 'old-login'
    });
    expect(mapGithubCommit({ ...payload, author: null }).authorGithubUserId).toBeNull();
  });

  it('aceita só eventos lifecycle de PR com ID e relógio do provider', () => {
    const payload = {
      id: 20,
      event: 'reopened',
      created_at: '2026-09-01T10:00:00Z',
      issue: { number: 7, pull_request: {} }
    };
    expect(mapGithubPullRequestLifecycleEvent(payload)).toEqual({
      providerEventId: '20',
      number: 7,
      eventType: 'REOPENED',
      occurredAt: new Date(payload.created_at)
    });
    expect(mapGithubPullRequestLifecycleEvent({ ...payload, issue: { number: 7 } })).toBeNull();
    expect(mapGithubPullRequestLifecycleEvent({ ...payload, event: 'labeled' })).toBeNull();
    expect(() => mapGithubPullRequestLifecycleEvent({ ...payload, id: null })).toThrow();
  });

  it('pagina repository-wide sem N+1 por Pull Request', async () => {
    const listEventsForRepo = vi.fn(async ({ page }) => ({
      data:
        page === 1
          ? [
              {
                id: 1,
                event: 'closed',
                created_at: '2026-09-01T10:00:00Z',
                issue: { number: 7, pull_request: {} }
              }
            ]
          : [
              {
                id: 2,
                event: 'reopened',
                created_at: '2026-09-02T10:00:00Z',
                issue: { number: 7, pull_request: {} }
              }
            ],
      headers: { link: page === 1 ? '<https://api.github.com/page=2>; rel="next"' : '' }
    }));
    const OctokitClass = class {
      constructor() {
        this.rest = { issues: { listEventsForRepo } };
      }
    };
    const client = createGithubClient({ auth: 'artificial', OctokitClass });
    const collected = [];
    for await (const page of client.listPullRequestLifecycleEventPages({ owner: 'o', repo: 'r' }))
      collected.push(...page);
    expect(collected.map(({ providerEventId }) => providerEventId)).toEqual(['1', '2']);
    expect(listEventsForRepo).toHaveBeenCalledTimes(2);
  });
});
