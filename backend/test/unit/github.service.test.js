import { describe, expect, it } from 'vitest';
import { githubService } from '../../src/modules/github/github.service.js';

describe('githubService L1', () => {
  it('expõe somente o status do provider GitHub App', () => {
    expect(githubService.configurationStatus()).toMatchObject({
      provider: 'github_app',
      configured: expect.any(Boolean)
    });
    expect(githubService).not.toHaveProperty('checkAuthentication');
    expect(githubService).not.toHaveProperty('listRepositories');
  });
});
