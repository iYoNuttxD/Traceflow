import { describe, expect, it, vi } from 'vitest';
import { createGithubClient } from '../../src/modules/github/github.client.js';

describe('configuração segura do client por instalação', () => {
  it('exige credencial efêmera e fixa host oficial', () => {
    expect(() => createGithubClient()).toThrow('Installation access token is required.');
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = {};
    });
    createGithubClient({ auth: 'token-efemero-artificial', OctokitClass });
    expect(OctokitClass).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'token-efemero-artificial',
        baseUrl: 'https://api.github.com'
      })
    );
  });
});
