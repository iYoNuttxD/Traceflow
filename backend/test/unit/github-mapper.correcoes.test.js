import { describe, expect, it } from 'vitest';
import {
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest
} from '../../src/modules/github/github.mapper.js';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const pullRequest = (overrides) => ({
  id: 1,
  number: 1,
  title: 'PR',
  state: 'closed',
  head: { ref: 'feature' },
  base: { ref: 'main' },
  html_url: 'https://github.com/dona/repo/pull/1',
  ...overrides
});

describe('Correções S2-01 — mapper do GitHub (S201-A03, O-9)', () => {
  it('C1-03 só aceita URL https://github.com/; o resto vira null', () => {
    const urlOf = (html_url) => mapGithubPullRequest(pullRequest({ html_url })).githubUrl;

    expect(urlOf('https://github.com/dona/repo/pull/1')).toBe(
      'https://github.com/dona/repo/pull/1'
    );
    for (const unsafe of [
      'javascript:alert(1)',
      'http://github.com/dona/repo/pull/1',
      'https://github.com.evil.example/dona/repo',
      'https://evil.example/github.com/dona',
      '//github.com/dona/repo',
      `https://github.com/${'p'.repeat(600)}`,
      '',
      null,
      undefined
    ])
      expect(urlOf(unsafe), String(unsafe)).toBeNull();
    expect(
      mapGithubIssue({ id: 2, number: 2, title: 'I', html_url: 'javascript:x' }).githubUrl
    ).toBeNull();
    expect(mapGithubCommit({ sha: 'a', html_url: 'data:text/html,x' }).githubUrl).toBeNull();
  });

  it('C1-04 autor do commit é truncado em 255 caracteres sem partir emoji', () => {
    const commit = mapGithubCommit({
      sha: 'b',
      commit: {
        author: {
          name: `${'n'.repeat(254)}\u{1F600}${'z'.repeat(40)}`,
          email: `${'e'.repeat(300)}@example.invalid`
        }
      }
    });

    expect(Array.from(commit.authorName)).toHaveLength(255);
    expect(commit.authorName.endsWith('\u{1F600}')).toBe(true);
    expect(LONE_SURROGATE.test(commit.authorName)).toBe(false);
    expect(Array.from(commit.authorEmail)).toHaveLength(255);
  });

  it('C1-04 textos acima da coluna são cortados por caractere; no limite ficam intactos', () => {
    const title256 = `${'t'.repeat(255)}\u{1F600}`;
    const mapped = mapGithubPullRequest(
      pullRequest({ title: `${title256}excesso`, head: { ref: 'r'.repeat(600) } })
    );
    const issue = mapGithubIssue({
      id: 3,
      number: 3,
      title: title256,
      milestone: { title: 'm'.repeat(300) }
    });

    expect(mapped.title).toBe(title256);
    expect(Array.from(mapped.sourceBranch)).toHaveLength(512);
    expect(issue.title).toBe(title256);
    expect(Array.from(issue.milestone)).toHaveLength(255);
  });
});
