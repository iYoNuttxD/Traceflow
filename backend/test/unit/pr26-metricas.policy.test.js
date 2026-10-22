import { describe, expect, it, vi } from 'vitest';
import {
  decisionsByEvent,
  githubEventTally,
  notificationCoverages,
  overdueDecisionInstant,
  overdueOccurrences,
  tallyDecidedEvents
} from '../../src/modules/notifications/notification-metrics.policy.js';
import { createNotificationService } from '../../src/modules/notifications/notification.service.js';
import {
  parseNotificationMetricsArguments,
  runNotificationMetrics
} from '../../src/jobs/cli/notification-metrics.js';

const TZ = 'America/Sao_Paulo';
const at = (iso) => new Date(iso);

const counts = (overrides = {}) => ({
  occurred: 10,
  sent: 6,
  notSent: 3,
  noRecipient: 1,
  unobserved: 0,
  gaps: [],
  ...overrides
});

describe('PR #26 métrica oficial — coberturas (TF-REV-002)', () => {
  it('M-P01 a cobertura total é E / T × 100 e a elegível sai rotulada como auxiliar', () => {
    const { coberturaTotal, coberturaElegivel } = notificationCoverages(counts());

    expect(coberturaTotal).toEqual({
      valor: 60,
      situacao: 'CALCULADA',
      motivo: null,
      formula: 'enviadasCorretamente / ocorridos × 100'
    });
    expect(coberturaElegivel).toEqual({
      valor: 100,
      situacao: 'CALCULADA',
      motivo: null,
      formula: 'enviadasCorretamente / (ocorridos − naoEnviadas − semDestinatario) × 100',
      auxiliar: true
    });
    expect(
      notificationCoverages(counts({ occurred: 3, sent: 2, notSent: 0, noRecipient: 0 }))
        .coberturaTotal.valor
    ).toBe(66.67);
  });

  it('M-P02 sem evento, com evento não observado ou com lacuna a cobertura é indisponível, nunca 0 nem 100', () => {
    const unavailable = (motivo) => ({ valor: null, situacao: 'INDISPONIVEL', motivo });

    const empty = notificationCoverages(
      counts({ occurred: 0, sent: 0, notSent: 0, noRecipient: 0 })
    );
    expect(empty.coberturaTotal).toMatchObject(unavailable('SEM_EVENTOS'));
    expect(empty.coberturaElegivel).toMatchObject(unavailable('SEM_EVENTOS'));

    const unobserved = notificationCoverages(counts({ occurred: 11, unobserved: 1 }));
    expect(unobserved.coberturaTotal).toMatchObject(unavailable('EVENTOS_NAO_OBSERVADOS'));
    expect(unobserved.coberturaElegivel).toMatchObject(unavailable('EVENTOS_NAO_OBSERVADOS'));

    const onlyExcluded = notificationCoverages(
      counts({ occurred: 2, sent: 0, notSent: 1, noRecipient: 1 })
    );
    expect(onlyExcluded.coberturaTotal).toMatchObject({ valor: 0, situacao: 'CALCULADA' });
    expect(onlyExcluded.coberturaElegivel).toMatchObject(unavailable('SEM_EVENTOS'));

    const gap = notificationCoverages(
      counts({
        occurred: 0,
        sent: 0,
        notSent: 0,
        noRecipient: 0,
        unobserved: 0,
        gaps: ['REGISTRO_INCOMPLETO', 'FONTE_POR_COMPARACAO_DE_ESTADO']
      })
    );
    expect(gap.coberturaTotal).toMatchObject(unavailable('REGISTRO_INCOMPLETO'));
    expect(gap.coberturaElegivel).toMatchObject(unavailable('REGISTRO_INCOMPLETO'));
  });
});

describe('PR #26 métrica oficial — decisões e reconstrução (TF-REV-002)', () => {
  it('M-P03 por evento, o envio prevalece; sem envio, vale a decisão mais recente', () => {
    const rows = [
      {
        id: 1,
        eventKey: 'a',
        outcome: 'SENT',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-11T03:15:00Z')
      },
      {
        id: 2,
        eventKey: 'a',
        outcome: 'INACTIVE_ACCOUNT',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-12T03:15:00Z')
      },
      {
        id: 3,
        eventKey: 'b',
        outcome: 'NO_RESPONSIBLE',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-11T03:15:00Z')
      },
      {
        id: 4,
        eventKey: 'b',
        outcome: 'PREFERENCE_OFF',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-11T03:30:00Z')
      },
      {
        id: 5,
        eventKey: 'c',
        outcome: 'INACTIVE_MEMBER',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-11T03:15:00Z')
      },
      {
        id: 6,
        eventKey: 'c',
        outcome: 'SENT',
        occurredAt: at('2026-10-11T03:00:00Z'),
        decidedAt: at('2026-10-11T03:45:00Z')
      }
    ];

    const events = decisionsByEvent(rows);

    expect(Object.fromEntries([...events].map(([key, value]) => [key, value.outcome]))).toEqual({
      a: 'SENT',
      b: 'PREFERENCE_OFF',
      c: 'SENT'
    });
    expect(tallyDecidedEvents(['a', 'b', 'c', 'd'], events)).toEqual({
      ocorridos: 4,
      enviadasCorretamente: 2,
      naoEnviadas: { total: 1, PREFERENCE_OFF: 1, INACTIVE_ACCOUNT: 0, INACTIVE_MEMBER: 0 },
      semDestinatario: { total: 0, NO_RESPONSIBLE: 0 },
      naoEnviadasSemMotivoAutorizado: { total: 0 },
      naoObservados: 1
    });
  });

  it('M-P04 o vencimento ocorre no primeiro instante com o corte passado, o prazo e a tarefa aberta', () => {
    const task = (overrides = {}) => ({
      createdAt: at('2026-10-01T12:00:00.000Z'),
      deadline: at('2026-10-10T00:00:00.000Z'),
      status: 'A_FAZER',
      ...overrides
    });
    const status = (from, to, iso) => ({
      field: 'STATUS',
      fromValue: from,
      toValue: to,
      occurredAt: at(iso)
    });
    const deadline = (from, to, iso) => ({
      field: 'DEADLINE',
      fromValue: from,
      toValue: to,
      occurredAt: at(iso)
    });
    const until = at('2026-10-25T12:00:00.000Z');
    const occurrences = (value, entries = [], limit = until) =>
      Object.fromEntries(
        [...overdueOccurrences(value, entries, { timeZone: TZ, until: limit })].map(
          ([dueDate, instant]) => [dueDate, instant.toISOString()]
        )
      );

    expect(occurrences(task())).toEqual({ '2026-10-10': '2026-10-11T03:00:00.000Z' });
    expect(
      occurrences(task({ status: 'CONCLUIDO' }), [
        status('A_FAZER', 'CONCLUIDO', '2026-10-10T18:00:00.000Z')
      ])
    ).toEqual({});
    expect(
      occurrences(task({ deadline: at('2026-10-20T00:00:00.000Z') }), [
        deadline('2026-10-10T00:00:00.000Z', '2026-10-20T00:00:00.000Z', '2026-10-09T15:00:00.000Z')
      ])
    ).toEqual({ '2026-10-20': '2026-10-21T03:00:00.000Z' });
    expect(occurrences(task({ createdAt: at('2026-10-15T14:00:00.000Z') }))).toEqual({
      '2026-10-10': '2026-10-15T14:00:00.000Z'
    });
    expect(
      occurrences(task({ status: 'CONCLUIDO' }), [
        status('A_FAZER', 'CONCLUIDO', '2026-10-11T13:00:00.000Z')
      ])
    ).toEqual({ '2026-10-10': '2026-10-11T03:00:00.000Z' });
    expect(
      occurrences(task(), [
        status('A_FAZER', 'CONCLUIDO', '2026-10-10T20:00:00.000Z'),
        status('CONCLUIDO', 'EM_ANDAMENTO', '2026-10-12T09:00:00.000Z')
      ])
    ).toEqual({ '2026-10-10': '2026-10-12T09:00:00.000Z' });
    expect(occurrences(task(), [], at('2026-10-11T02:59:59.999Z'))).toEqual({});
    expect(occurrences(task({ deadline: null }))).toEqual({});
  });

  it('M-P04 o instante da decisão do job é o corte, ou a criação da tarefa quando posterior', () => {
    const cutoff = at('2026-10-11T03:00:00.000Z');

    expect(overdueDecisionInstant(cutoff, at('2026-10-01T12:00:00.000Z'))).toEqual(cutoff);
    expect(overdueDecisionInstant(cutoff, at('2026-10-15T14:00:00.000Z'))).toEqual(
      at('2026-10-15T14:00:00.000Z')
    );
  });

  it('M-P05 RF60/RF61: pares do outcome; exclusão antiga por janela não vira motivo autorizado; evento não despachado é não observado', () => {
    const excluded = (overrides = {}) => ({
      NO_TASK: 0,
      NO_PARTICIPANT: 0,
      INACTIVE_ACCOUNT: 0,
      INACTIVE_MEMBER: 0,
      PREFERENCE_OFF: 0,
      ...overrides
    });
    const dispatched = (outcome) => ({ status: 'DISPATCHED', outcome });

    const tally = githubEventTally([
      dispatched({
        tasks: 2,
        participants: 4,
        eligible: 3,
        created: 2,
        alreadyNotified: 1,
        excluded: excluded({ PREFERENCE_OFF: 1, NO_PARTICIPANT: 1 })
      }),
      dispatched({
        tasks: 1,
        participants: 2,
        eligible: 0,
        created: 0,
        alreadyNotified: 0,
        excluded: { ...excluded({ NO_TASK: 1 }), OUTSIDE_WINDOW: 2 }
      }),
      { status: 'PENDING', outcome: null },
      { status: 'FAILED', outcome: null }
    ]);

    expect(tally).toEqual({
      eventos: 4,
      ocorridos: 10,
      enviadasCorretamente: 3,
      naoEnviadas: { total: 1, PREFERENCE_OFF: 1, INACTIVE_ACCOUNT: 0, INACTIVE_MEMBER: 0 },
      semDestinatario: { total: 2, NO_PARTICIPANT: 1, NO_TASK: 1 },
      naoEnviadasSemMotivoAutorizado: { total: 2, OUTSIDE_WINDOW: 2 },
      naoObservados: 2
    });
  });
});

describe('PR #26 métrica oficial — decisões do job do RF59', () => {
  const NOW = at('2026-10-20T12:00:00.000Z');
  const candidate = (id, responsibleUserId) => ({
    id,
    title: `Tarefa ${id}`,
    status: 'A_FAZER',
    deadline: at('2026-10-10T00:00:00.000Z'),
    responsibleUserId,
    createdAt: at('2026-10-01T12:00:00.000Z')
  });
  const fakeRepository = (candidates) => ({
    listActiveProjectIds: vi.fn(async () => [1]),
    findOverdueCandidates: vi.fn(async () => candidates),
    activeAccountIds: vi.fn(async (userIds) => new Set(userIds)),
    activeMemberIds: vi.fn(async () => new Set([7])),
    overduePreferences: vi.fn(async () => new Map()),
    existingOverdueKeys: vi.fn(async () => new Set()),
    currentOverdueDecisions: vi.fn(async () => new Map()),
    persistOverdueUnit: vi.fn(async (_projectId, unit) => unit.rows.length)
  });
  const silent = { info() {}, warn() {}, error() {} };

  it('M-P07 o lote leva as notificações novas e todas as decisões, e o dry-run não grava nada', async () => {
    const repository = fakeRepository([candidate(10, 7), candidate(11, 7), candidate(12, null)]);
    repository.currentOverdueDecisions.mockResolvedValue(
      new Map([['11:2026-10-10|7', 'INACTIVE_MEMBER']])
    );
    const job = createNotificationService({ repository, log: silent, clock: () => NOW });

    await job.notifyOverdueTasks({ now: NOW, timeZone: TZ, dryRun: true });
    expect(repository.currentOverdueDecisions).not.toHaveBeenCalled();
    expect(repository.persistOverdueUnit).not.toHaveBeenCalled();

    repository.existingOverdueKeys.mockResolvedValueOnce(new Set(['7|TASK_OVERDUE:10:2026-10-10']));
    const report = await job.notifyOverdueTasks({ now: NOW, timeZone: TZ, dryRun: false });

    expect(report).toMatchObject({ eligible: 2, created: 1, alreadyNotified: 1 });
    expect(repository.currentOverdueDecisions).toHaveBeenCalledWith(1, [
      '10:2026-10-10',
      '11:2026-10-10',
      '12:2026-10-10'
    ]);
    expect(repository.persistOverdueUnit).toHaveBeenCalledTimes(1);
    const [projectId, unit] = repository.persistOverdueUnit.mock.calls[0];
    expect(projectId).toBe(1);
    expect(unit.decidedAt).toEqual(NOW);
    expect(unit.current.get('11:2026-10-10|7')).toBe('INACTIVE_MEMBER');
    expect(unit.rows.map((row) => row.dedupeKey)).toEqual(['TASK_OVERDUE:11:2026-10-10']);
    expect(
      unit.decisions.map((decision) => [
        decision.eventKey,
        decision.recipientUserId,
        decision.outcome,
        decision.occurredAt.toISOString()
      ])
    ).toEqual([
      ['10:2026-10-10', 7, 'SENT', '2026-10-11T03:00:00.000Z'],
      ['11:2026-10-10', 7, 'SENT', '2026-10-11T03:00:00.000Z'],
      ['12:2026-10-10', null, 'NO_RESPONSIBLE', '2026-10-11T03:00:00.000Z']
    ]);
  });

  it('M-P08 a falha de um lote conta o projeto como falho, sem desfazer nada à parte', async () => {
    const failure = Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'P2034'
    });
    const repository = fakeRepository([candidate(10, 7)]);
    repository.persistOverdueUnit.mockRejectedValue(failure);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const job = createNotificationService({ repository, log, clock: () => NOW });

    const report = await job.notifyOverdueTasks({ now: NOW, timeZone: TZ, dryRun: false });

    expect(report).toMatchObject({ projects: 1, failed: 1, created: 0 });
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'notifications_due_project_failed', errorCode: 'P2034' })
    );
    expect(Object.keys(repository)).not.toContain('revertOverdueDecisions');
  });

  it('M-P09 os lotes têm até 1.000 tarefas e rodam no máximo 4 ao mesmo tempo', async () => {
    const repository = fakeRepository(
      Array.from({ length: 9500 }, (_, index) => candidate(index + 1, 7))
    );
    let running = 0;
    let peak = 0;
    repository.persistOverdueUnit.mockImplementation(async (_projectId, unit) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return unit.rows.length;
    });
    const job = createNotificationService({ repository, log: silent, clock: () => NOW });

    const report = await job.notifyOverdueTasks({ now: NOW, timeZone: TZ, dryRun: false });

    const sizes = repository.persistOverdueUnit.mock.calls.map(([, unit]) => unit.decisions.length);
    expect(sizes).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500]);
    expect(peak).toBe(4);
    expect(report.created).toBe(9500);
  });
});

describe('PR #26 métrica oficial — script notifications:metrics', () => {
  it('M-P06 aceita só período fechado e projeto positivo', () => {
    expect(parseNotificationMetricsArguments(['--from=2026-10-01', '--to=2026-10-15'])).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
      projectId: null
    });
    expect(
      parseNotificationMetricsArguments(['--to=2026-10-15', '--from=2026-10-15', '--project-id=7'])
    ).toEqual({ from: '2026-10-15', to: '2026-10-15', projectId: 7 });
    for (const args of [
      [],
      ['--from=2026-10-01'],
      ['--from=2026-10-16', '--to=2026-10-15'],
      ['--from=2026-02-30', '--to=2026-03-01'],
      ['--from=2026-10-1', '--to=2026-10-15'],
      ['--from=2026-10-01', '--to=2026-10-15', '--project-id=0'],
      ['--from=2026-10-01', '--to=2026-10-15', '--project-id=1.5'],
      ['--from=2026-10-01', '--to=2026-10-15', '--apply'],
      ['--from=2026-10-01', '--from=2026-10-02', '--to=2026-10-15']
    ])
      expect(() => parseNotificationMetricsArguments(args), JSON.stringify(args)).toThrow(
        /--from=YYYY-MM-DD --to=YYYY-MM-DD/
      );
  });

  it('M-P06 JSON em stdout, erro em stderr e código 2 para projeto inexistente', async () => {
    const service = {
      compute: vi.fn(async ({ projectId }) => ({
        projetos: projectId === 99 ? 0 : 1,
        requisitos: {}
      }))
    };
    const io = () => {
      const out = [];
      const err = [];
      return { out, err, write: (text) => out.push(text), writeError: (text) => err.push(text) };
    };
    const databaseUrl = 'mysql://usuario:segredo@localhost:3306/traceflow_test';

    const ok = io();
    expect(
      await runNotificationMetrics({
        args: ['--from=2026-10-01', '--to=2026-10-15'],
        service,
        databaseUrl,
        ...ok
      })
    ).toBe(0);
    expect(JSON.parse(ok.out.join(''))).toMatchObject({ projetos: 1 });
    expect(ok.out.join('')).not.toContain('segredo');
    expect(service.compute).toHaveBeenCalledWith({
      from: '2026-10-01',
      to: '2026-10-15',
      projectId: null
    });

    const missing = io();
    expect(
      await runNotificationMetrics({
        args: ['--from=2026-10-01', '--to=2026-10-15', '--project-id=99'],
        service,
        databaseUrl,
        ...missing
      })
    ).toBe(2);
    expect(missing.err.join('')).toContain('--project-id=99');

    const usage = io();
    expect(
      await runNotificationMetrics({ args: ['--apply'], service, databaseUrl, ...usage })
    ).toBe(1);
    expect(usage.out).toEqual([]);
    expect(usage.err.join('')).toMatch(/Uso:/);

    const failing = io();
    const failure = Object.assign(new Error('Access denied for user segredo'), { code: 'P1010' });
    expect(
      await runNotificationMetrics({
        args: ['--from=2026-10-01', '--to=2026-10-15'],
        service: { compute: vi.fn().mockRejectedValue(failure) },
        databaseUrl,
        ...failing
      })
    ).toBe(1);
    expect(failing.err.join('')).toBe('Cálculo da métrica das notificações falhou.\n');
  });
});
