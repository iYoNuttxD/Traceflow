import { describe, expect, it } from 'vitest';
import { Octokit } from '@octokit/rest';
import { githubFetch, githubId, parseGithubJson } from '../../src/modules/github/github-json.js';
import { githubConnectBodySchema } from '../../src/modules/github/github.validation.js';

describe('GitHub integer precision at the wire boundary', () => {
  const large = '3849085576043036672';
  it('preserves the original integer lexeme, including nested arrays', () => {
    expect(parseGithubJson(`{"id":${large},"nested":[9007199254740993],"safe":7}`)).toEqual({
      id: large,
      nested: ['9007199254740993'],
      safe: 7
    });
    expect(githubId(7)).toBe('7');
    expect(githubId(large)).toBe(large);
    expect(() => githubId(Number(large))).toThrow('GITHUB_UNSAFE_ID');
    expect(() => parseGithubJson('{"id":9e25}')).toThrow('GITHUB_UNSAFE_JSON_INTEGER');
    expect(() => githubId('01')).toThrow();
    expect(() =>
      githubConnectBodySchema.parse({
        githubInstallationId: '1',
        githubRepositoryId: Number(large)
      })
    ).toThrow();
  });
  it('preserves raw numeric payload tokens for HMAC reconstruction', () => {
    const wire = `{"id":${large},"nested":{"id":9007199254740993}}`;
    const data = parseGithubJson(wire, { rawIntegers: true });
    expect(githubId(data.id)).toBe(large);
    expect(JSON.stringify(data)).toBe(wire);
  });
  it('normalizes Octokit text before its internal JSON.parse, preserving auth and paths', async () => {
    const calls = [];
    const fetch = githubFetch(async (url, options) => {
      calls.push({ url, options });
      return new Response(`{"id":${large},"account":{"id":9007199254740993}}`, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    });
    const client = new Octokit({ auth: 'synthetic-unit-only', request: { fetch } });
    const result = await client.request('GET /app/installations/{installation_id}', {
      installation_id: large
    });
    expect(result.data).toEqual({ id: large, account: { id: '9007199254740993' } });
    expect(calls[0].url).toBe('https://api.github.com/app/installations/' + large);
    expect(calls[0].options.headers.authorization).toContain('synthetic-unit-only');
  });
  it('leaves binary/non JSON responses untouched and refuses malformed JSON', async () => {
    expect(
      await (
        await githubFetch(async () => new Response('binary'))
      )('https://example.test')
    ).toBeInstanceOf(Response);
    const response = await githubFetch(
      async () => new Response('{bad}', { headers: { 'content-type': 'application/json' } })
    )('https://example.test');
    await expect(response.text()).rejects.toThrow();
  });
});
