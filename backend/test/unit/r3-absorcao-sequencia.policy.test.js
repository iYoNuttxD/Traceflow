import { describe, expect, it } from 'vitest';
import {
  mergeClosingsOf,
  pullRequestEventTypeOf
} from '../../src/modules/notifications/github-event.policy.js';

const at = (time) => new Date(`2026-10-17T${time}${time.includes('.') ? '' : '.000'}Z`);
const event = (eventType, time, providerEventId) => ({
  eventType,
  occurredAt: at(time),
  providerEventId
});
const typeOf = (closing, history, mergedAtGithub = null) =>
  pullRequestEventTypeOf(
    closing,
    mergeClosingsOf(history.includes(closing) ? history : [...history, closing], mergedAtGithub)
  );

describe('TF-REV-014 — o fechamento só é absorvido quando é o par do merge', () => {
  it('Q-01 fechada, reaberta e mesclada: o fechamento distinto sai (A3)', () => {
    const closed = event('CLOSED', '12:00:00', '100');
    const mergeClose = event('CLOSED', '12:00:04', '103');
    const history = [
      closed,
      event('REOPENED', '12:00:01', '101'),
      event('MERGED', '12:00:04', '102'),
      mergeClose
    ];

    expect(typeOf(closed, history)).toBe('PULL_REQUEST_CLOSED');
    expect(typeOf(mergeClose, history)).toBeNull();
    expect(typeOf(event('MERGED', '12:00:04', '102'), history)).toBe('PULL_REQUEST_MERGED');
  });

  it('Q-02 os três no mesmo segundo: a ordem vem do id do evento', () => {
    const closed = event('CLOSED', '12:00:00', '200');
    const mergeClose = event('CLOSED', '12:00:00', '203');
    const history = [
      closed,
      event('REOPENED', '12:00:00', '201'),
      event('MERGED', '12:00:00', '202'),
      mergeClose
    ];

    expect(typeOf(closed, history)).toBe('PULL_REQUEST_CLOSED');
    expect(typeOf(mergeClose, history)).toBeNull();
  });

  it('Q-03 merge normal, com o fechamento e o merge no mesmo segundo: só o merge', () => {
    const mergeClose = event('CLOSED', '12:00:00', '301');
    const history = [event('MERGED', '12:00:00', '300'), mergeClose];

    expect(typeOf(mergeClose, history)).toBeNull();
    expect(
      typeOf(event('CLOSED', '12:00:05', '302'), [event('MERGED', '12:00:00', '300')])
    ).toBeNull();
    expect(
      typeOf(event('CLOSED', '12:00:05.001', '303'), [event('MERGED', '12:00:00', '300')])
    ).toBe('PULL_REQUEST_CLOSED');
  });

  it('Q-04 merge só no retrato, com reabertura no mesmo segundo: o fechamento sai', () => {
    const closed = event('CLOSED', '12:00:00', '400');
    const history = [closed, event('REOPENED', '12:00:04', '401')];

    expect(typeOf(closed, history, at('12:00:04'))).toBe('PULL_REQUEST_CLOSED');
    expect(typeOf(event('CLOSED', '12:00:04', '402'), [], at('12:00:04'))).toBeNull();
  });

  it('Q-05 cada merge absorve um fechamento só, o mais próximo', () => {
    const early = event('CLOSED', '12:00:01', '501');
    const close = event('CLOSED', '12:00:03', '503');
    const history = [early, event('MERGED', '12:00:03', '502'), close];

    const absorbed = mergeClosingsOf(history);
    expect([...absorbed]).toEqual(['503']);
    expect(pullRequestEventTypeOf(early, absorbed)).toBe('PULL_REQUEST_CLOSED');
  });

  it('Q-06 o id do GitHub é comparado como número, não como texto', () => {
    const closed = event('CLOSED', '12:00:00', '9');
    const mergeClose = event('CLOSED', '12:00:00', '12');
    const history = [
      closed,
      event('REOPENED', '12:00:00', '10'),
      event('MERGED', '12:00:00', '11'),
      mergeClose
    ];

    expect(typeOf(closed, history)).toBe('PULL_REQUEST_CLOSED');
    expect(typeOf(mergeClose, history)).toBeNull();
  });

  it('id que não é número deixa a ordem do segundo desconhecida, e a reabertura impede a absorção', () => {
    expect(
      typeOf(event('CLOSED', '12:00:00', 'closed-1'), [event('MERGED', '12:00:00', 'merged-1')])
    ).toBeNull();
    expect(
      typeOf(event('CLOSED', '12:00:00', 'closed-2'), [
        event('REOPENED', '12:00:00', 'reopened-2'),
        event('MERGED', '12:00:00', 'merged-2')
      ])
    ).toBe('PULL_REQUEST_CLOSED');
  });

  it('o retrato não duplica o merge já gravado como evento', () => {
    const later = event('CLOSED', '12:00:03', '604');
    const history = [event('MERGED', '12:00:00', '600'), event('CLOSED', '12:00:00', '601'), later];

    const absorbed = mergeClosingsOf(history, at('12:00:00'));
    expect([...absorbed]).toEqual(['601']);
    expect(pullRequestEventTypeOf(later, absorbed)).toBe('PULL_REQUEST_CLOSED');
  });

  it('reabertura e outros tipos não viram aviso do RF61', () => {
    expect(pullRequestEventTypeOf(event('REOPENED', '12:00:00', '700'), new Set())).toBeNull();
    expect(pullRequestEventTypeOf(event('CLOSED', '12:00:00', '701'), new Set())).toBe(
      'PULL_REQUEST_CLOSED'
    );
  });
});
