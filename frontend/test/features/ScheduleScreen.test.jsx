import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    getSchedule: vi.fn(),
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    getMembership: vi.fn()
  },
  projects: { get: vi.fn() }
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

const { ScheduleScreen } = await import('../../src/features/schedule/pages/ScheduleScreen.jsx');
const { ScheduleCalendar } =
  await import('../../src/features/schedule/components/ScheduleCalendar.jsx');
const calendario = await import('../../src/features/schedule/components/schedule-calendar.js');

const emptySchedule = {
  projectId: 1,
  range: { from: null, to: null },
  generatedAt: '2026-08-05T12:00:00.000Z',
  sprints: [],
  milestones: [],
  unassignedTasks: []
};

const sprint = (overrides = {}) => ({
  id: 1,
  name: 'Sprint 1',
  objective: 'Identidade',
  startDate: '2026-08-03T00:00:00',
  endDate: '2026-08-15T00:00:00',
  status: 'EM_ANDAMENTO',
  milestoneId: 5,
  durationInDays: 12,
  taskCount: 0,
  tasks: [],
  ...overrides
});

const marco = (overrides = {}) => ({
  id: 5,
  title: 'Fundação',
  description: null,
  dueDate: '2026-08-20T00:00:00',
  status: 'PENDENTE',
  overdue: false,
  ...overrides
});

const tarefa = (overrides = {}) => ({
  id: 10,
  title: 'Finalizar login',
  status: 'A_FAZER',
  priority: 'ALTA',
  deadline: '2026-08-12T00:00:00',
  estimatedEffort: 5,
  ...overrides
});

const periodosDe = (opcoes = {}) =>
  calendario.milestonePeriods({
    milestones: opcoes.milestones ?? [marco()],
    sprints: opcoes.sprints ?? [sprint()]
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
  mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 0, milestones: [] } });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/schedule']}>
      <Routes>
        <Route path="/projects/:projectId/schedule" element={<ScheduleScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderCalendar(props = {}) {
  return render(
    <ScheduleCalendar
      schedule={emptySchedule}
      milestoneNames={{ 5: 'Fundação' }}
      hoje={new Date(2026, 7, 10, 12)}
      {...props}
    />
  );
}

describe('faixa da sprint no calendario', () => {
  it('fim a meia-noite nao pinta o proprio dia', () => {
    expect(calendario.sprintDayRange(sprint())).toEqual({
      inicio: '2026-08-03',
      fim: '2026-08-14'
    });
  });

  it('fim com hora pinta o dia inteiro', () => {
    expect(calendario.sprintDayRange(sprint({ endDate: '2026-08-15T18:00:00' })).fim).toBe(
      '2026-08-15'
    );
  });

  it('nunca termina antes de comecar', () => {
    const faixa = calendario.sprintDayRange(
      sprint({ startDate: '2026-08-03T00:00:00', endDate: '2026-08-03T00:00:00' })
    );
    expect(faixa).toEqual({ inicio: '2026-08-03', fim: '2026-08-03' });
  });
});

describe('periodos de marco', () => {
  it('comecam na primeira sprint do marco e terminam no prazo', () => {
    const [periodo] = periodosDe();
    expect(periodo).toMatchObject({
      id: 5,
      inicio: '2026-08-03',
      fim: '2026-08-20',
      prazo: '2026-08-20',
      nSprints: 1,
      nConcluidas: 0,
      comTrilha: true
    });
  });

  it('marco sem sprint nao tem trilha e ocupa apenas o dia do prazo', () => {
    const [periodo] = periodosDe({ sprints: [] });
    expect(periodo).toMatchObject({
      inicio: '2026-08-20',
      fim: '2026-08-20',
      nSprints: 0,
      comTrilha: false
    });
  });

  it('conta as sprints concluidas do marco', () => {
    const [periodo] = periodosDe({
      sprints: [
        sprint({ status: 'CONCLUIDA' }),
        sprint({ id: 2, startDate: '2026-08-16T00:00:00', endDate: '2026-08-19T00:00:00' })
      ]
    });
    expect(periodo).toMatchObject({ nSprints: 2, nConcluidas: 1 });
  });

  it('prazo antes do fim da sprint estende a barra ate esse fim', () => {
    const [periodo] = periodosDe({
      milestones: [marco({ dueDate: '2026-08-10T00:00:00' })]
    });
    expect(periodo).toMatchObject({
      inicio: '2026-08-03',
      fim: '2026-08-14',
      prazo: '2026-08-10',
      comTrilha: true
    });
  });

  it('a extensao para na sprint agrupada que termina primeiro', () => {
    const [periodo] = periodosDe({
      milestones: [marco({ dueDate: '2026-08-01T00:00:00' })],
      sprints: [
        sprint(),
        sprint({ id: 2, startDate: '2026-08-16T00:00:00', endDate: '2026-08-29T00:00:00' })
      ]
    });
    expect(periodo).toMatchObject({ inicio: '2026-08-01', fim: '2026-08-14', prazo: '2026-08-01' });
  });

  it('prazo anterior a primeira sprint estende do prazo ate o fim dela', () => {
    const [periodo] = periodosDe({
      milestones: [marco({ dueDate: '2026-07-20T00:00:00' })]
    });
    expect(periodo.inicio <= periodo.fim).toBe(true);
    expect(periodo).toMatchObject({ inicio: '2026-07-20', fim: '2026-08-14', prazo: '2026-07-20' });
  });

  it('a extensao respeita o fim a meia-noite da sprint', () => {
    const [periodo] = periodosDe({
      milestones: [marco({ dueDate: '2026-08-10T00:00:00' })],
      sprints: [sprint({ endDate: '2026-09-01T00:00:00' })]
    });
    expect(periodo.fim).toBe('2026-08-31');
  });

  it('marco sem prazo e descartado dos periodos', () => {
    const periodos = periodosDe({ milestones: [marco({ dueDate: null })] });
    expect(periodos).toHaveLength(0);
  });

  it('ordena os marcos pelo inicio derivado', () => {
    const periodos = calendario.milestonePeriods({
      milestones: [marco(), marco({ id: 6, title: 'Depois', dueDate: '2026-09-10T00:00:00' })],
      sprints: [
        sprint(),
        sprint({
          id: 2,
          milestoneId: 6,
          startDate: '2026-07-01T00:00:00',
          endDate: '2026-07-10T00:00:00'
        })
      ]
    });
    expect(periodos.map((periodo) => periodo.id)).toEqual([6, 5]);
  });
});

describe('grade do mes', () => {
  const grade = (opcoes = {}) =>
    calendario.buildMonthGrid({
      ano: 2026,
      mes: 7,
      sprints: [sprint()],
      periodos: periodosDe(),
      hojeIso: '2026-08-10',
      selecionadoIso: '2026-08-10',
      ...opcoes
    });

  it('tem sempre 42 celulas', () => {
    expect(grade()).toHaveLength(42);
  });

  it('marca os dias cobertos pela sprint', () => {
    const cobertos = grade()
      .filter((celula) => celula.sprintId === 1)
      .map((celula) => celula.iso);
    expect(cobertos[0]).toBe('2026-08-03');
    expect(cobertos[cobertos.length - 1]).toBe('2026-08-14');
  });

  it('arredonda so as pontas da faixa e as bordas da semana', () => {
    const celulas = grade();
    const porDia = Object.fromEntries(celulas.map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03']).toMatchObject({ inicioDaFaixa: true, fimDaFaixa: false });
    expect(porDia['2026-08-14']).toMatchObject({ inicioDaFaixa: false, fimDaFaixa: true });
    expect(porDia['2026-08-08'].fimDaFaixa).toBe(true);
    expect(porDia['2026-08-05']).toMatchObject({ inicioDaFaixa: false, fimDaFaixa: false });
  });

  it('so o dia exato de inicio e fim ganha o traco da sprint', () => {
    const porDia = Object.fromEntries(grade().map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03']).toMatchObject({ inicioDaSprint: true, fimDaSprint: false });
    expect(porDia['2026-08-14']).toMatchObject({ inicioDaSprint: false, fimDaSprint: true });
    expect(porDia['2026-08-08']).toMatchObject({ inicioDaSprint: false, fimDaSprint: false });
  });

  it('pinta o periodo do marco por baixo da faixa', () => {
    const porDia = Object.fromEntries(grade().map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03']).toMatchObject({ marcoId: 5, inicioDoMarco: true });
    expect(porDia['2026-08-20']).toMatchObject({ marcoId: 5, fimDoMarco: true });
    expect(porDia['2026-08-21'].marcoId).toBeNull();
  });

  it('aponta o dia com prazo de marco e o marco dono do ponto', () => {
    const comPrazo = grade().filter((celula) => celula.temPrazoDeMarco);
    expect(comPrazo.map((celula) => [celula.iso, celula.prazoDoMarcoId])).toEqual([
      ['2026-08-20', 5]
    ]);
    expect(comPrazo[0].prazoAgrupado).toBe(true);
  });

  it('com barra estendida o ponto continua no prazo e o fim ganha o canto', () => {
    const periodos = periodosDe({ milestones: [marco({ dueDate: '2026-08-10T00:00:00' })] });
    const porDia = Object.fromEntries(grade({ periodos }).map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-10']).toMatchObject({
      marcoId: 5,
      temPrazoDeMarco: true,
      fimDoMarco: false
    });
    expect(porDia['2026-08-14']).toMatchObject({
      marcoId: 5,
      fimDoMarco: true,
      temPrazoDeMarco: false
    });
    expect(porDia['2026-08-15'].marcoId).toBeNull();
  });

  it('dia que e prazo e inicio ao mesmo tempo anuncia o prazo', () => {
    const periodos = periodosDe({ milestones: [marco({ dueDate: '2026-08-03T00:00:00' })] });
    const porDia = Object.fromEntries(grade({ periodos }).map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03'].descricao).toBe(
      'segunda-feira, 3 de agosto — início de Sprint 1 — prazo do marco Fundação'
    );
  });

  it('marco sem sprint marca so o prazo, sem pintar periodo', () => {
    const celulas = grade({ sprints: [], periodos: periodosDe({ sprints: [] }) });
    const porDia = Object.fromEntries(celulas.map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-20']).toMatchObject({
      marcoId: null,
      temPrazoDeMarco: true,
      prazoAgrupado: false,
      descricao: 'quinta-feira, 20 de agosto — prazo do marco Fundação'
    });
    expect(celulas.some((celula) => celula.marcoId !== null)).toBe(false);
  });

  it('descreve o dia com sprint e marco no acessivel', () => {
    const porDia = Object.fromEntries(grade().map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03'].descricao).toBe(
      'segunda-feira, 3 de agosto — início de Sprint 1 — início do marco Fundação (agrupa 1 sprint)'
    );
    expect(porDia['2026-08-20'].descricao).toBe(
      'quinta-feira, 20 de agosto — prazo do marco Fundação'
    );
  });

  it('distingue hoje, selecionado e dias de fora do mes', () => {
    const celulas = grade({ selecionadoIso: '2026-08-12' });
    expect(celulas.find((celula) => celula.iso === '2026-08-10').hoje).toBe(true);
    expect(celulas.find((celula) => celula.iso === '2026-08-12').selecionado).toBe(true);
    expect(celulas.find((celula) => celula.iso === '2026-07-31').noMes).toBe(false);
  });

  it('hoje so marca a celula do mes exibido, nunca a repetida do mes vizinho', () => {
    const agosto = grade({ hojeIso: '2026-08-30' });
    expect(agosto.find((celula) => celula.iso === '2026-08-30').hoje).toBe(true);

    const setembro = grade({
      ano: 2026,
      mes: 8,
      hojeIso: '2026-08-30',
      selecionadoIso: '2026-08-30'
    });
    const repetida = setembro.find((celula) => celula.iso === '2026-08-30');
    expect(repetida.noMes).toBe(false);
    expect(repetida.hoje).toBe(false);
    expect(repetida.selecionado).toBe(true);
  });
});

describe('trilhas de marco por semana', () => {
  const semanasDe = (opcoes = {}) => {
    const periodos = opcoes.periodos ?? periodosDe();
    const celulas = calendario.buildMonthGrid({
      ano: 2026,
      mes: 7,
      sprints: opcoes.sprints ?? [sprint()],
      periodos,
      hojeIso: '2026-08-10',
      selecionadoIso: '2026-08-10'
    });
    return calendario.milestoneWeekLayout({ celulas, periodos });
  };

  it('recorta o segmento em cada semana coberta', () => {
    const semanas = semanasDe();
    expect(semanas[0].segmentos).toHaveLength(0);
    expect(semanas[1].segmentos[0]).toMatchObject({ c0: 1, c1: 6, arredondaEsquerda: true });
    expect(semanas[2].segmentos[0]).toMatchObject({ c0: 0, c1: 6 });
    expect(semanas[3].segmentos[0]).toMatchObject({ c1: 4, arredondaDireita: true });
    expect(semanas[4].segmentos).toHaveLength(0);
  });

  it('poe o marcador do marco apenas na primeira semana em que aparece', () => {
    const semanas = semanasDe();
    expect(semanas[1].marcadores).toHaveLength(1);
    expect(semanas[1].marcadores[0].texto).toBe('Fundação · marco · 03/08 – 20/08');
    expect(semanas[1].marcadores[0].topo).toBe(semanas[1].segmentos[0].topo - 5);
    expect(semanas[2].marcadores).toHaveLength(0);
  });

  it('empilha marcos que se sobrepoem na mesma semana', () => {
    const periodos = calendario.milestonePeriods({
      milestones: [marco(), marco({ id: 6, title: 'Paralelo', dueDate: '2026-08-25T00:00:00' })],
      sprints: [sprint(), sprint({ id: 2, milestoneId: 6 })]
    });
    const semanas = semanasDe({ periodos });
    const linhas = semanas[2].segmentos.map((segmento) => segmento.linha).sort();
    expect(linhas).toEqual([0, 1]);
    expect(semanas[2].segmentos[1].topo).toBeGreaterThan(semanas[2].segmentos[0].topo);
  });

  it('marcadores que estreiam na mesma semana acompanham a propria linha', () => {
    const periodos = calendario.milestonePeriods({
      milestones: [marco(), marco({ id: 6, title: 'Paralelo', dueDate: '2026-08-25T00:00:00' })],
      sprints: [sprint(), sprint({ id: 2, milestoneId: 6 })]
    });
    const semanas = semanasDe({ periodos });
    const estreia = semanas.find((semana) => semana.marcadores.length > 0);
    expect(estreia.marcadores).toHaveLength(2);
    const topos = estreia.marcadores.map((marcador) => marcador.topo);
    expect(new Set(topos).size).toBe(2);
    expect(Math.abs(topos[1] - topos[0])).toBeGreaterThanOrEqual(12);
    expect(estreia.alturaTopo).toBeGreaterThan(semanas[3].alturaTopo);
  });

  it('o titulo do segmento ganha o prazo quando a barra passa dele', () => {
    const periodos = periodosDe({ milestones: [marco({ dueDate: '2026-08-10T00:00:00' })] });
    const semanas = semanasDe({ periodos });
    expect(semanas[1].segmentos[0].titulo).toBe(
      'Marco Fundação · 03/08 – 14/08 · prazo 10/08 · agrupa 1 sprint'
    );
    expect(semanas[1].marcadores[0].texto).toBe('Fundação · marco · 03/08 – 14/08');
  });

  it('marco sem sprint nao ganha segmento nem marcador', () => {
    const semanas = semanasDe({ sprints: [], periodos: periodosDe({ sprints: [] }) });
    expect(semanas.every((semana) => semana.segmentos.length === 0)).toBe(true);
    expect(semanas.every((semana) => semana.marcadores.length === 0)).toBe(true);
    expect(semanas.every((semana) => semana.alturaTopo === 4)).toBe(true);
  });
});

describe('limites do calendario', () => {
  it('vao do primeiro ao ultimo dia pintado, entre sprints e marcos', () => {
    expect(
      calendario.calendarBounds({
        sprints: [sprint()],
        milestones: [marco({ dueDate: '2026-10-05T00:00:00' })]
      })
    ).toEqual({ min: { ano: 2026, mes: 7 }, max: { ano: 2026, mes: 9 } });
  });

  it('sem nada pintado devolvem null', () => {
    expect(calendario.calendarBounds({ sprints: [], milestones: [] })).toBeNull();
  });

  it('usam a janela pintada da sprint, nao a data crua do fim', () => {
    expect(
      calendario.calendarBounds({
        sprints: [sprint({ endDate: '2026-09-01T00:00:00' })],
        milestones: []
      })
    ).toEqual({ min: { ano: 2026, mes: 7 }, max: { ano: 2026, mes: 7 } });
  });

  it('clampMonth prende abaixo, prende acima e deixa passar por dentro', () => {
    const limites = { min: { ano: 2026, mes: 7 }, max: { ano: 2026, mes: 9 } };
    expect(calendario.clampMonth(limites, { ano: 2026, mes: 5 })).toEqual({ ano: 2026, mes: 7 });
    expect(calendario.clampMonth(limites, { ano: 2027, mes: 0 })).toEqual({ ano: 2026, mes: 9 });
    expect(calendario.clampMonth(limites, { ano: 2026, mes: 8 })).toEqual({ ano: 2026, mes: 8 });
    expect(calendario.clampMonth(null, { ano: 2030, mes: 3 })).toEqual({ ano: 2030, mes: 3 });
  });

  it('comparam ano e mes juntos na virada de ano', () => {
    const limites = { min: { ano: 2026, mes: 11 }, max: { ano: 2027, mes: 1 } };
    expect(calendario.clampMonth(limites, { ano: 2027, mes: 0 })).toEqual({ ano: 2027, mes: 0 });
    expect(calendario.clampMonth(limites, { ano: 2026, mes: 10 })).toEqual({
      ano: 2026,
      mes: 11
    });
  });
});

describe('tarefas com deadline', () => {
  it('reune tarefas da sprint e sem sprint em ordem de deadline', () => {
    const tarefas = calendario.deadlineTasks({
      sprints: [sprint({ tasks: [tarefa({ id: 62, deadline: '2026-08-30T00:00:00' })] })],
      unassignedTasks: [tarefa({ id: 44, deadline: '2026-08-10T00:00:00' })]
    });
    expect(tarefas.map((item) => [item.id, item.dia, item.sprintNome])).toEqual([
      [44, '2026-08-10', null],
      [62, '2026-08-30', 'Sprint 1']
    ]);
  });

  it('descarta tarefa sem deadline', () => {
    const tarefas = calendario.deadlineTasks({
      sprints: [sprint({ tasks: [tarefa({ deadline: null })] })],
      unassignedTasks: []
    });
    expect(tarefas).toHaveLength(0);
  });

  it('desempata o mesmo dia pelo id da tarefa', () => {
    const tarefas = calendario.deadlineTasks({
      sprints: [sprint({ tasks: [tarefa({ id: 20 }), tarefa({ id: 7 })] })],
      unassignedTasks: [tarefa({ id: 12 })]
    });
    expect(tarefas.map((item) => item.id)).toEqual([7, 12, 20]);
  });
});

describe('eventos', () => {
  const eventos = (opcoes = {}) =>
    calendario.buildEvents({
      sprints: [sprint()],
      periodos: periodosDe(),
      milestoneNames: { 5: 'Fundação' },
      tarefas: [],
      hojeIso: '2026-08-10',
      ...opcoes
    });

  it('gera sprint, marco e prazo em ordem de dia', () => {
    expect(eventos().map((evento) => [evento.dia, evento.titulo])).toEqual([
      ['2026-08-03', 'Início — Sprint 1'],
      ['2026-08-03', 'Início — Fundação'],
      ['2026-08-14', 'Fim — Sprint 1'],
      ['2026-08-20', 'Fundação']
    ]);
  });

  it('nomeia o marco da sprint no evento', () => {
    expect(eventos()[0].meta).toBe('Fundação · Em andamento');
  });

  it('explica que o marco comeca com a primeira sprint', () => {
    const inicioDoMarco = eventos().find((evento) => evento.titulo === 'Início — Fundação');
    expect(inicioDoMarco.meta).toBe('Agrupa 1 sprint · começa com a primeira delas');
  });

  it('marco sem sprint gera apenas o prazo', () => {
    const soPrazo = eventos({ periodos: periodosDe({ sprints: [] }), sprints: [] });
    expect(soPrazo.map((evento) => evento.titulo)).toEqual(['Fundação']);
  });

  it('prazo no dia do inicio ainda anuncia o comeco da barra estendida', () => {
    const inicioDoMarco = eventos({
      periodos: periodosDe({ milestones: [marco({ dueDate: '2026-08-03T00:00:00' })] })
    }).find((evento) => evento.titulo === 'Início — Fundação');
    expect(inicioDoMarco).toMatchObject({
      dia: '2026-08-03',
      meta: 'Agrupa 1 sprint · começa com a primeira delas'
    });
  });

  it('gera deadline de tarefa com status, prioridade e sprint', () => {
    const [deadline] = eventos({
      sprints: [],
      periodos: [],
      tarefas: calendario.deadlineTasks({
        sprints: [sprint({ tasks: [tarefa({ id: 62, title: 'Burndown da sprint' })] })],
        unassignedTasks: []
      })
    });
    expect(deadline).toMatchObject({
      dia: '2026-08-12',
      kind: 'Tarefa',
      titulo: '#62 Burndown da sprint',
      meta: 'Deadline · A fazer · Alta · Sprint 1'
    });
  });

  it('empates de dia preservam a ordem de emissao mesmo em volume', () => {
    const muitas = Array.from({ length: 30 }, (_, indice) =>
      sprint({ id: indice + 1, name: `S${indice + 1}`, milestoneId: null })
    );
    const volume = calendario.buildEvents({
      sprints: muitas,
      periodos: [],
      milestoneNames: {},
      tarefas: [],
      hojeIso: '2026-08-10'
    });
    expect(volume.slice(0, 30).map((evento) => evento.titulo)).toEqual(
      muitas.map((item) => `Início — ${item.name}`)
    );
  });

  it('avisa sobre sprint vencida sem conclusao', () => {
    const [, fim] = calendario.buildEvents({
      sprints: [sprint()],
      periodos: [],
      milestoneNames: {},
      tarefas: [],
      hojeIso: '2026-09-01'
    });
    expect(fim.meta).toContain('Atrasada');
    expect(fim.aviso).toMatch(/conclua para liberar a próxima/i);
  });

  it('proximos eventos descartam o passado', () => {
    const proximos = calendario.upcomingEvents(eventos(), '2026-08-15');
    expect(proximos.map((evento) => evento.dia)).toEqual(['2026-08-20']);
  });
});

describe('blocos do mes exibido', () => {
  const blocos = (opcoes = {}) =>
    calendario.monthBlocks({
      ano: 2026,
      mes: 7,
      sprints: [sprint()],
      periodos: periodosDe(),
      milestoneNames: { 5: 'Fundação' },
      tarefas: [],
      ...opcoes
    });

  it('agrupa marcos, sprints e tarefas do mes com contagem', () => {
    const { blocos: grupos, resumo } = blocos({
      tarefas: calendario.deadlineTasks({
        sprints: [sprint({ tasks: [tarefa()] })],
        unassignedTasks: []
      })
    });
    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(['Marcos', 'Sprints', 'Tarefas']);
    expect(grupos.map((grupo) => grupo.itens.length)).toEqual([1, 1, 1]);
    expect(grupos[2].descricao).toBe('Somente tarefas com deadline dentro do mês exibido.');
    expect(grupos[0].itens[0].meta).toBe('03/08 – 20/08 · Pendente · agrupa 1 sprint');
    expect(grupos[1].itens[0].meta).toBe('03/08 – 14/08 · Em andamento · marco Fundação');
    expect(grupos[2].itens[0]).toMatchObject({
      nome: '#10 Finalizar login',
      meta: '12/08 · A fazer · Alta · Sprint 1'
    });
    expect(resumo).toBe('1 marco · 1 sprint · 1 tarefa');
  });

  it('fora do mes exibido nada entra nos blocos', () => {
    const { blocos: grupos, resumo } = blocos({ ano: 2026, mes: 10 });
    expect(grupos[0].itens).toHaveLength(0);
    expect(grupos[0].vazio).toBe('Nenhum marco neste mês.');
    expect(grupos[1].vazio).toBe('Nenhuma sprint neste mês.');
    expect(grupos[2].vazio).toBe('Nenhuma tarefa com deadline neste mês.');
    expect(resumo).toBe('nada no calendário');
  });

  it('marco sem sprint entra no bloco pelo prazo', () => {
    const { blocos: grupos } = blocos({ sprints: [], periodos: periodosDe({ sprints: [] }) });
    expect(grupos[0].itens[0].meta).toBe('Prazo 20/08 · Pendente · agrupa 0 sprints');
  });

  it('meta do marco ganha o prazo quando a barra passa dele', () => {
    const { blocos: grupos } = blocos({
      periodos: periodosDe({ milestones: [marco({ dueDate: '2026-08-10T00:00:00' })] })
    });
    expect(grupos[0].itens[0].meta).toBe('03/08 – 14/08 · prazo 10/08 · Pendente · agrupa 1 sprint');
  });

  it('sprint sem marco e tarefa sem sprint sao nomeadas assim', () => {
    const { blocos: grupos } = blocos({
      sprints: [sprint({ milestoneId: null })],
      periodos: [],
      tarefas: calendario.deadlineTasks({
        sprints: [],
        unassignedTasks: [tarefa({ id: 44 })]
      })
    });
    expect(grupos[1].itens[0].meta).toContain('sem marco');
    expect(grupos[2].itens[0].meta).toContain('Sem sprint');
  });
});

describe('legenda do mes', () => {
  it('filtra sprints e marcos pelo mes exibido', () => {
    const legenda = calendario.monthLegend({
      ano: 2026,
      mes: 7,
      sprints: [
        sprint(),
        sprint({ id: 2, startDate: '2026-09-01T00:00:00', endDate: '2026-09-10T00:00:00' })
      ],
      periodos: periodosDe()
    });
    expect(legenda.sprints.map((item) => item.sprint.id)).toEqual([1]);
    expect(legenda.marcos.map((item) => item.id)).toEqual([5]);
    expect(legenda.temPrazoNoMes).toBe(true);
  });

  it('so oferece o ponto de prazo quando ha prazo no mes', () => {
    const legenda = calendario.monthLegend({
      ano: 2026,
      mes: 7,
      sprints: [sprint()],
      periodos: periodosDe({ milestones: [marco({ dueDate: '2026-09-20T00:00:00' })] })
    });
    expect(legenda.marcos).toHaveLength(1);
    expect(legenda.temPrazoNoMes).toBe(false);
  });

  it('marco sem sprint sai das entradas de marco, mas conta como prazo', () => {
    const legenda = calendario.monthLegend({
      ano: 2026,
      mes: 7,
      sprints: [],
      periodos: periodosDe({ sprints: [] })
    });
    expect(legenda.marcos).toHaveLength(0);
    expect(legenda.temPrazoNoMes).toBe(true);
  });
});

describe('cartoes de agora', () => {
  const tarefasDaSprint = [
    tarefa({
      id: 10,
      title: 'Planejada',
      status: 'CONCLUIDO',
      deadline: '2026-08-11T00:00:00'
    }),
    tarefa({ id: 11, title: 'Entrou depois', status: 'A_FAZER', deadline: '2026-08-12T00:00:00' })
  ];
  const tiles = (opcoes = {}) => {
    const sprints = opcoes.sprints ?? [sprint({ tasks: tarefasDaSprint })];
    return calendario.nowTiles({
      sprints,
      periodos: calendario.milestonePeriods({
        milestones: opcoes.milestones ?? [marco()],
        sprints
      }),
      tarefas: calendario.deadlineTasks({ sprints, unassignedTasks: [] }),
      hojeIso: opcoes.hojeIso ?? '2026-08-10'
    });
  };

  it('nomeia a sprint atual com periodo e progresso de tarefas', () => {
    const [atual] = tiles();
    expect(atual).toMatchObject({
      label: 'Sprint atual',
      value: 'Sprint 1',
      note: '03/08 – 14/08 · 1 de 2 tarefas concluídas'
    });
  });

  it('nomeia o marco atual com prazo, agrupamento e concluidas', () => {
    const [, marcoAtual] = tiles();
    expect(marcoAtual).toMatchObject({
      label: 'Marco atual',
      value: 'Fundação',
      note: 'Prazo 20/08 · agrupa 1 sprint · 0 concluídas'
    });
  });

  it('lista as tarefas em aberto da sprint atual', () => {
    const [, , emAberto] = tiles();
    expect(emAberto).toMatchObject({
      label: 'Tarefas em aberto na sprint atual',
      value: '1 de 2 em aberto',
      note: '#11 Entrou depois'
    });
  });

  it('sem sprint ativa o cartao de tarefas em aberto sai da tela', () => {
    const cartoes = tiles({ sprints: [sprint({ status: 'PLANEJADA', tasks: [] })] });
    expect(cartoes.map((cartao) => cartao.label)).toEqual([
      'Sprint atual',
      'Marco atual',
      'Atenção'
    ]);
    expect(cartoes[0]).toMatchObject({ value: 'Nenhuma', note: 'Inicie uma sprint planejada' });
  });

  it('aponta o proximo deadline quando nada esta atrasado', () => {
    const atencao = tiles().at(-1);
    expect(atencao).toMatchObject({
      value: 'Nada atrasado',
      note: 'Próximo deadline: 12/08 · #11 Entrou depois'
    });
  });

  it('sem deadline futuro diz que esta tudo no prazo', () => {
    const atencao = tiles({ sprints: [sprint({ tasks: [] })] }).at(-1);
    expect(atencao).toMatchObject({ value: 'Nada atrasado', note: 'Tudo dentro do prazo' });
  });

  it('conta as sprints atrasadas', () => {
    const atencao = tiles({ hojeIso: '2026-09-01' }).at(-1);
    expect(atencao).toMatchObject({
      value: '1 sprint atrasada',
      note: 'Conclua para liberar a próxima'
    });
  });

  it('todos os marcos concluidos e nenhum marco sao ditos por extenso', () => {
    const [, concluidos] = tiles({ milestones: [marco({ status: 'CONCLUIDO' })] });
    expect(concluidos).toMatchObject({ value: '—', note: 'Todos os marcos concluídos' });
    const [, nenhum] = tiles({ milestones: [] });
    expect(nenhum).toMatchObject({ value: '—', note: 'Nenhum marco cadastrado' });
  });

  it('com todos os marcos vencidos o atual e o ultimo prazo', () => {
    const [, vencido] = tiles({
      milestones: [
        marco({ id: 5, title: 'Antigo', dueDate: '2026-07-10T00:00:00' }),
        marco({ id: 6, title: 'Recente', dueDate: '2026-07-25T00:00:00' })
      ],
      hojeIso: '2026-09-15'
    });
    expect(vencido.value).toBe('Recente');
    expect(vencido.note).toContain('Prazo 25/07');
  });
});

describe('interacao do calendario', () => {
  it('navega entre meses dentro do intervalo do cronograma', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint()],
        milestones: [marco({ dueDate: '2026-09-20T00:00:00' })]
      }
    });
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();

    const anterior = screen.getByRole('button', { name: 'Mês anterior' });
    const proximo = screen.getByRole('button', { name: 'Próximo mês' });
    expect(anterior).toHaveAttribute('aria-disabled', 'true');
    expect(proximo).toHaveAttribute('aria-disabled', 'false');

    await user.click(proximo);
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument();
    expect(proximo).toHaveAttribute('aria-disabled', 'true');

    await user.click(proximo);
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument();

    await user.click(anterior);
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    await user.click(anterior);
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
  });

  it('agregado vazio trava a navegacao no mes corrente', () => {
    renderCalendar();
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('sprint cancelada nao estende o intervalo navegavel', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [
          sprint(),
          sprint({
            id: 2,
            name: 'Cancelada',
            startDate: '2026-12-01T00:00:00',
            endDate: '2026-12-10T00:00:00',
            status: 'CANCELADA'
          })
        ]
      }
    });
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('fim a meia-noite nao desbloqueia o mes seguinte', () => {
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint({ endDate: '2026-09-01T00:00:00' })] }
    });
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('sprint cancelada nao estende a barra do marco', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [
          sprint(),
          sprint({
            id: 2,
            name: 'Cancelada',
            startDate: '2026-08-05T00:00:00',
            endDate: '2026-08-29T00:00:00',
            status: 'CANCELADA'
          })
        ],
        milestones: [marco({ dueDate: '2026-08-10T00:00:00' })]
      }
    });
    const legenda = screen.getByRole('list', { name: 'Legenda do mês exibido' });
    expect(
      within(legenda).getByText('Marco · agrupa 1 sprint · 03/08 – 14/08 · prazo 10/08')
    ).toBeInTheDocument();
  });

  it('a extensao da barra nao desbloqueia mes novo na navegacao', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ endDate: '2026-09-01T00:00:00' })],
        milestones: [marco({ dueDate: '2026-08-20T00:00:00' })]
      }
    });
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('hoje fora do intervalo abre no limite mais proximo', () => {
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()] },
      hoje: new Date(2027, 0, 15, 12)
    });
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    expect(screen.getByText('Agenda de sexta-feira, 15 de janeiro')).toBeInTheDocument();
  });

  it('nomeia cada dia por extenso, com sprint e marco', () => {
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] } });
    expect(
      screen.getByRole('button', {
        name: 'segunda-feira, 3 de agosto — início de Sprint 1 — início do marco Fundação (agrupa 1 sprint)'
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /quinta-feira, 20 de agosto — prazo do marco Fundação/ })
    ).toBeInTheDocument();
  });

  it('clicar num dia abre a agenda dele', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] } });

    await user.click(screen.getByRole('button', { name: /segunda-feira, 3 de agosto/ }));
    expect(screen.getByText('Agenda de segunda-feira, 3 de agosto')).toBeInTheDocument();
    expect(screen.getByText('Início — Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('Início — Fundação')).toBeInTheDocument();
  });

  it('a agenda contextualiza o dia dentro da sprint', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] } });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 5 de agosto/ }));
    expect(
      screen.getByText('Dentro de Sprint 1 (03/08 – 14/08) · marco Fundação')
    ).toBeInTheDocument();
  });

  it('dia sem evento diz o que apareceria ali', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()] } });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 5 de agosto/ }));
    expect(screen.getByText('Nenhum evento neste dia.')).toBeInTheDocument();
    expect(
      screen.getByText(/Inícios e fins de sprint e de marco, prazos e deadlines de tarefa/)
    ).toBeInTheDocument();
  });

  it('lista as tarefas da sprint do dia num expansor com teto', () => {
    const muitas = Array.from({ length: 8 }, (_, indice) =>
      tarefa({ id: indice + 1, title: `Tarefa ${indice + 1}`, deadline: null })
    );
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint({ tasks: muitas })] }
    });

    const expansor = screen.getByText('Tarefas de Sprint 1 neste dia (8)').closest('details');
    expect(within(expansor).getByText(/#1 Tarefa 1 — A fazer · Alta/)).toBeInTheDocument();
    expect(
      within(expansor).getByText('… e mais 2 tarefas no Kanban da sprint')
    ).toBeInTheDocument();
    expect(within(expansor).queryByText(/#7 Tarefa 7/)).toBeNull();
  });

  it('selecionar dia de outro mes navega para o mes dele dentro do intervalo', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint()],
        milestones: [marco({ dueDate: '2026-09-20T00:00:00' })]
      }
    });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 2 de setembro/ }));
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument();
  });

  it('dia cinza alem do limite seleciona sem mover a vista', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()] } });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 2 de setembro/ }));
    expect(screen.getByText('Agenda de quarta-feira, 2 de setembro')).toBeInTheDocument();
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
  });

  it('prazo de marco fora das sprints estende o intervalo', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint()],
        milestones: [marco({ dueDate: '2026-10-05T00:00:00' })]
      }
    });

    const proximo = screen.getByRole('button', { name: 'Próximo mês' });
    await user.click(proximo);
    await user.click(proximo);
    expect(screen.getByText('outubro de 2026')).toBeInTheDocument();
    expect(proximo).toHaveAttribute('aria-disabled', 'true');
  });

  it('desenha a trilha do marco com um marcador que abre o nome ao clicar', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] }
    });
    expect(container.querySelectorAll('.calendar-week-seg').length).toBeGreaterThan(1);

    const marcador = screen.getByRole('button', {
      name: 'Marco Fundação · 03/08 – 20/08 · agrupa 1 sprint'
    });
    expect(marcador).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Fundação · marco · 03/08 – 20/08')).toBeNull();

    await user.click(marcador);
    expect(marcador).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Fundação · marco · 03/08 – 20/08')).toBeInTheDocument();

    await user.click(marcador);
    expect(marcador).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Fundação · marco · 03/08 – 20/08')).toBeNull();
  });

  it('escape fecha o marcador mantendo o foco no botao', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] }
    });

    const marcador = screen.getByRole('button', { name: /^Marco Fundação/ });
    await user.click(marcador);
    expect(screen.getByText('Fundação · marco · 03/08 – 20/08')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Fundação · marco · 03/08 – 20/08')).toBeNull();
    expect(marcador).toHaveFocus();
  });

  it('dez marcos so de prazo mantem a grade limpa em escala', () => {
    const muitos = Array.from({ length: 10 }, (_, indice) =>
      marco({
        id: indice + 1,
        title: `Entrega ${indice + 1}`,
        dueDate: `2026-08-${String(indice + 3).padStart(2, '0')}T00:00:00`
      })
    );
    const { container } = renderCalendar({
      schedule: { ...emptySchedule, milestones: muitos }
    });
    expect(container.querySelectorAll('.calendar-week-seg')).toHaveLength(0);
    expect(container.querySelectorAll('.calendar-week-marker')).toHaveLength(0);
    expect(container.querySelectorAll('.calendar-day-dot')).toHaveLength(10);
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(within(painel).getByRole('tab', { name: 'Marcos 10' })).toBeInTheDocument();
  });

  it('abrir um marcador fecha o que estava aberto', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint(), sprint({ id: 2, milestoneId: 6 })],
        milestones: [marco(), marco({ id: 6, title: 'Paralelo', dueDate: '2026-08-25T00:00:00' })]
      }
    });

    await user.click(screen.getByRole('button', { name: /^Marco Fundação/ }));
    expect(screen.getByText('Fundação · marco · 03/08 – 20/08')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Marco Paralelo/ }));
    expect(screen.getByText('Paralelo · marco · 03/08 – 25/08')).toBeInTheDocument();
    expect(screen.queryByText('Fundação · marco · 03/08 – 20/08')).toBeNull();
  });

  it('marcos so de prazo nao viram trilha nem entrada de legenda', () => {
    const { container } = renderCalendar({
      schedule: {
        ...emptySchedule,
        milestones: [marco(), marco({ id: 6, title: 'Outro', dueDate: '2026-08-25T00:00:00' })]
      }
    });
    expect(container.querySelectorAll('.calendar-week-seg')).toHaveLength(0);
    expect(container.querySelectorAll('.calendar-week-marker')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'quinta-feira, 20 de agosto — prazo do marco Fundação' })
    ).toBeInTheDocument();
    const legenda = screen.getByRole('list', { name: 'Legenda do mês exibido' });
    expect(within(legenda).queryByText('Fundação')).toBeNull();
    expect(within(legenda).getByText('Prazo de marco')).toBeInTheDocument();
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(within(painel).getByRole('tab', { name: 'Marcos 2' })).toBeInTheDocument();
    expect(
      within(painel).getByText('Prazo 20/08 · Pendente · agrupa 0 sprints')
    ).toBeInTheDocument();
  });

  it('a legenda nomeia sprint e marco do mes exibido', () => {
    const legenda = () => screen.getByRole('list', { name: 'Legenda do mês exibido' });
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] }
    });
    expect(within(legenda()).getByText('Sprint 1')).toBeInTheDocument();
    expect(within(legenda()).getByText('Sprint · 03/08 – 14/08')).toBeInTheDocument();
    expect(within(legenda()).getByText('Fundação')).toBeInTheDocument();
    expect(
      within(legenda()).getByText('Marco · agrupa 1 sprint · 03/08 – 20/08')
    ).toBeInTheDocument();
    expect(within(legenda()).getByText('Prazo de marco')).toBeInTheDocument();
  });

  it('a legenda acompanha o mes ao navegar', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [
          sprint(),
          sprint({
            id: 2,
            name: 'Sprint 2',
            startDate: '2026-09-01T00:00:00',
            endDate: '2026-09-10T00:00:00'
          })
        ]
      }
    });
    const legenda = () => screen.getByRole('list', { name: 'Legenda do mês exibido' });
    expect(within(legenda()).getByText('Sprint 1')).toBeInTheDocument();
    expect(within(legenda()).queryByText('Sprint 2')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(within(legenda()).getByText('Sprint 2')).toBeInTheDocument();
    expect(within(legenda()).queryByText('Sprint 1')).toBeNull();
  });

  it('sem prazo de marco no mes o ponto sai da legenda', () => {
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()] }
    });
    const legenda = screen.getByRole('list', { name: 'Legenda do mês exibido' });
    expect(within(legenda).queryByText('Prazo de marco')).toBeNull();
  });

  it('projeto vazio esconde a legenda e mostra a grade', () => {
    renderCalendar();
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Legenda do mês exibido' })).toBeNull();
    expect(screen.getByText('Nenhum evento futuro no cronograma.')).toBeInTheDocument();
  });

  it('sprint cancelada sai da faixa, da legenda e dos eventos', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ status: 'CANCELADA' })]
      }
    });
    expect(screen.queryByRole('list', { name: 'Legenda do mês exibido' })).toBeNull();
    expect(screen.queryByText('Início — Sprint 1')).toBeNull();
    expect(screen.queryByText('Fim — Sprint 1')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sprint 1/ })).toBeNull();
  });

  it('o painel do mes exibido resume marcos, sprints e tarefas em abas', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ tasks: [tarefa()] })],
        milestones: [marco()]
      }
    });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(
      within(painel).getByText('agosto de 2026 · 1 marco · 1 sprint · 1 tarefa')
    ).toBeInTheDocument();
    expect(within(painel).getByRole('tab', { name: 'Marcos 1' })).toBeInTheDocument();
    expect(within(painel).getByRole('tab', { name: 'Sprints 1' })).toBeInTheDocument();
    expect(within(painel).getByRole('tab', { name: 'Tarefas 1' })).toBeInTheDocument();
    await user.click(within(painel).getByRole('tab', { name: 'Tarefas 1' }));
    expect(within(painel).getByText('#10 Finalizar login')).toBeInTheDocument();
  });

  it('o painel do mes e um tablist com marcos ativos por padrao', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ tasks: [tarefa()] })],
        milestones: [marco()]
      }
    });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(within(painel).getAllByRole('tab')).toHaveLength(3);
    expect(within(painel).getByRole('tab', { selected: true })).toHaveAccessibleName('Marcos 1');
    expect(within(painel).getByRole('tabpanel')).toHaveAccessibleName('Marcos 1');
  });

  it('trocar de aba filtra o conteudo do painel', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ tasks: [tarefa()] })],
        milestones: [marco()]
      }
    });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(within(painel).getByText('Fundação')).toBeInTheDocument();
    await user.click(within(painel).getByRole('tab', { name: 'Tarefas 1' }));
    expect(within(painel).getByText('#10 Finalizar login')).toBeInTheDocument();
    expect(within(painel).queryByText('Fundação')).toBeNull();
  });

  it('setas movem e ativam as abas do painel', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ tasks: [tarefa()] })],
        milestones: [marco()]
      }
    });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    const abaMarcos = within(painel).getByRole('tab', { name: 'Marcos 1' });
    abaMarcos.focus();
    await user.keyboard('{ArrowRight}');
    const abaSprints = within(painel).getByRole('tab', { name: 'Sprints 1' });
    expect(abaSprints).toHaveFocus();
    expect(abaSprints).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(within(painel).getByRole('tab', { name: 'Tarefas 1' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(abaMarcos).toHaveFocus();
    expect(abaMarcos).toHaveAttribute('aria-selected', 'true');
  });

  it('o painel do mes diz quando a aba esta vazia', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()] } });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    expect(within(painel).getByText('Nenhum marco neste mês.')).toBeInTheDocument();
    await user.click(within(painel).getByRole('tab', { name: 'Tarefas 0' }));
    expect(within(painel).getByText('Nenhuma tarefa com deadline neste mês.')).toBeInTheDocument();
  });

  it('a aba ativa sobrevive a navegacao de mes', async () => {
    const user = userEvent.setup();
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [
          sprint(),
          sprint({
            id: 2,
            name: 'Sprint 2',
            startDate: '2026-09-01T00:00:00',
            endDate: '2026-09-10T00:00:00'
          })
        ]
      }
    });
    const painel = screen.getByRole('heading', { name: 'No mês exibido' }).closest('section');
    await user.click(within(painel).getByRole('tab', { name: 'Sprints 1' }));
    expect(within(painel).getByText('Sprint 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(within(painel).getByRole('tab', { selected: true })).toHaveAccessibleName('Sprints 1');
    expect(within(painel).getByText('Sprint 2')).toBeInTheDocument();
    expect(within(painel).queryByText('Sprint 1')).toBeNull();
  });

  it('proximos eventos misturam sprint, marco e tarefa em cartoes', () => {
    renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ tasks: [tarefa({ id: 62, title: 'Burndown da sprint' })] })],
        milestones: [marco()]
      }
    });
    const secao = screen.getByRole('heading', { name: 'Próximos eventos' }).closest('section');
    expect(within(secao).getByText('Fim — Sprint 1')).toBeInTheDocument();
    expect(within(secao).getByText('Fundação')).toBeInTheDocument();
    expect(within(secao).getByText('#62 Burndown da sprint')).toBeInTheDocument();
    expect(within(secao).getByText(/qua, 12\/08 · Deadline · A fazer · Alta/)).toBeInTheDocument();
  });
});

describe('tela do cronograma', () => {
  it('exibe carregamento antes dos dados', () => {
    mocks.projects.get.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Carregando cronograma...')).toBeInTheDocument();
  });

  it('exibe acesso negado em 403', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 403, data: {} } });
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('exibe erro recuperavel em falha generica', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('nao oferece mais o filtro de periodo — o mes exibido faz o recorte', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'No mês exibido' });
    expect(screen.queryByRole('heading', { name: 'Período exibido' })).toBeNull();
    expect(screen.queryByLabelText('Data inicial')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filtrar' })).toBeNull();
  });

  it('anuncia tarefas e marcos na descricao da pagina', async () => {
    renderScreen();
    expect(
      await screen.findByText(/inícios e fins de sprint e de marco, prazos e tarefas/)
    ).toBeInTheDocument();
  });

  it('o nome do marco chega ao evento pela sprint', async () => {
    const emDias = (dias) => {
      const data = new Date();
      data.setDate(data.getDate() + dias);
      const pad = (valor) => String(valor).padStart(2, '0');
      return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T00:00:00`;
    };
    const futura = sprint({ startDate: emDias(10), endDate: emDias(24) });
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [futura],
        milestones: [marco({ dueDate: emDias(30) })]
      }
    });
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco({ dueDate: emDias(30) })] }
    });
    renderScreen();

    const proximos = await screen.findByRole('heading', { name: 'Próximos eventos' });
    const cartao = proximos.closest('section');
    expect(within(cartao).getAllByText(/Fundação/).length).toBeGreaterThan(0);
  });
});
