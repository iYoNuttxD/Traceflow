import { describe, expect, it } from 'vitest';
import { changedFields } from '../../src/shared/persistence/changed-fields.js';

const FIELDS = ['title', 'description', 'labels', 'closedAtGithub'];

describe('S203-F22 — F1-07 comparação campo a campo', () => {
  it('undefined e null são iguais', () => {
    expect(
      changedFields(
        { title: 'a', description: null, labels: null, closedAtGithub: null },
        { title: 'a', labels: undefined, closedAtGithub: undefined },
        FIELDS
      )
    ).toEqual({});
  });

  it('datas iguais em objetos diferentes não mudam', () => {
    expect(
      changedFields(
        { closedAtGithub: new Date('2026-09-01T10:00:00.000Z') },
        { closedAtGithub: new Date('2026-09-01T10:00:00Z') },
        ['closedAtGithub']
      )
    ).toEqual({});
  });

  it('JSON igual com as chaves em outra ordem não muda; lista em outra ordem muda', () => {
    const stored = {
      labels: [{ id: 7, name: 'bug', color: 'd73a4a', description: null }, 'texto']
    };

    expect(
      changedFields(
        stored,
        { labels: [{ description: null, color: 'd73a4a', name: 'bug', id: 7 }, 'texto'] },
        ['labels']
      )
    ).toEqual({});
    expect(
      changedFields(
        stored,
        { labels: ['texto', { id: 7, name: 'bug', color: 'd73a4a', description: null }] },
        ['labels']
      )
    ).toEqual({ labels: ['texto', { id: 7, name: 'bug', color: 'd73a4a', description: null }] });
  });

  it('só os campos que mudaram voltam, com o valor novo, e undefined novo vira null', () => {
    const closed = new Date('2026-09-05T09:00:00Z');

    expect(
      changedFields(
        { title: 'a', description: 'x', labels: [], closedAtGithub: null },
        { title: 'b', description: undefined, labels: [], closedAtGithub: closed },
        FIELDS
      )
    ).toEqual({ title: 'b', description: null, closedAtGithub: closed });
  });

  it('valor para null e null para valor mudam; texto com outro espaço muda', () => {
    expect(
      changedFields({ title: 'a', description: 'x' }, { title: 'a ', description: null }, [
        'title',
        'description'
      ])
    ).toEqual({ title: 'a ', description: null });
    expect(changedFields({ description: null }, { description: 'y' }, ['description'])).toEqual({
      description: 'y'
    });
  });

  it('campo fora da lista é ignorado', () => {
    expect(changedFields({ title: 'a', extra: 1 }, { title: 'a', extra: 2 }, ['title'])).toEqual(
      {}
    );
  });
});
