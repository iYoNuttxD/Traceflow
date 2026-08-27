// RF10: cronograma em calendario. A grade mostra DURACAO, que a lista por data
// nao mostrava; o que a lista entregava continua no painel do dia e em
// "Proximos eventos".
import { render, screen, waitFor, within } from '@testing-library/react';
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

// Datas escritas sem `Z`: o calendario ancora no dia LOCAL, e usar UTC nos
// fixtures faria o teste passar ou falhar conforme o fuso da maquina.
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

// O componente recebe `hoje` por prop justamente para o teste nao depender do
// relogio do processo.
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
  // Janela semiaberta: o dia do fim as 00:00 ja pertence a sprint seguinte, e
  // pintar a faixa ate la sugeriria uma sobreposicao que nao existe.
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

  // Sprint degenerada nao pode recuar para antes do proprio inicio.
  it('nunca termina antes de comecar', () => {
    const faixa = calendario.sprintDayRange(
      sprint({ startDate: '2026-08-03T00:00:00', endDate: '2026-08-03T00:00:00' })
    );
    expect(faixa).toEqual({ inicio: '2026-08-03', fim: '2026-08-03' });
  });
});

describe('grade do mes', () => {
  const grade = (opcoes = {}) =>
    calendario.buildMonthGrid({
      ano: 2026,
      mes: 7,
      sprints: [sprint()],
      milestones: [marco()],
      hojeIso: '2026-08-10',
      selecionadoIso: '2026-08-10',
      ...opcoes
    });

  // Seis semanas sempre: um mes de cinco linhas e outro de seis fariam o painel
  // abaixo pular de altura ao navegar.
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

  // A ponta arredondada so onde a faixa comeca ou acaba — e no limite da semana,
  // senao a faixa vazaria visualmente para a linha seguinte.
  it('arredonda so as pontas da faixa e as bordas da semana', () => {
    const celulas = grade();
    const porDia = Object.fromEntries(celulas.map((celula) => [celula.iso, celula]));
    expect(porDia['2026-08-03']).toMatchObject({ inicioDaFaixa: true, fimDaFaixa: false });
    expect(porDia['2026-08-14']).toMatchObject({ inicioDaFaixa: false, fimDaFaixa: true });
    // 08/08/2026 e sabado: fim de linha.
    expect(porDia['2026-08-08'].fimDaFaixa).toBe(true);
    expect(porDia['2026-08-05']).toMatchObject({ inicioDaFaixa: false, fimDaFaixa: false });
  });

  it('aponta o dia com prazo de marco', () => {
    const comPrazo = grade().filter((celula) => celula.temPrazoDeMarco);
    expect(comPrazo.map((celula) => celula.iso)).toEqual(['2026-08-20']);
  });

  it('distingue hoje, selecionado e dias de fora do mes', () => {
    const celulas = grade({ selecionadoIso: '2026-08-12' });
    expect(celulas.find((celula) => celula.iso === '2026-08-10').hoje).toBe(true);
    expect(celulas.find((celula) => celula.iso === '2026-08-12').selecionado).toBe(true);
    expect(celulas.find((celula) => celula.iso === '2026-07-31').noMes).toBe(false);
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

  // O limite usa a mesma janela da faixa: fim a meia-noite recua um dia, entao
  // uma sprint que termina em 01/09 00:00 nao poe setembro no intervalo.
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

  // Dezembro/2026 vem antes de janeiro/2027: a comparacao e por ano e mes
  // juntos, nao por mes solto.
  it('comparam ano e mes juntos na virada de ano', () => {
    const limites = { min: { ano: 2026, mes: 11 }, max: { ano: 2027, mes: 1 } };
    expect(calendario.clampMonth(limites, { ano: 2027, mes: 0 })).toEqual({ ano: 2027, mes: 0 });
    expect(calendario.clampMonth(limites, { ano: 2026, mes: 10 })).toEqual({
      ano: 2026,
      mes: 11
    });
  });
});

describe('eventos', () => {
  const eventos = () =>
    calendario.buildEvents({
      sprints: [sprint()],
      milestones: [marco()],
      milestoneNames: { 5: 'Fundação' },
      hojeIso: '2026-08-10'
    });

  it('gera inicio e fim de sprint e prazo de marco', () => {
    expect(eventos().map((evento) => [evento.dia, evento.titulo])).toEqual([
      ['2026-08-03', 'Início — Sprint 1'],
      ['2026-08-14', 'Fim — Sprint 1'],
      ['2026-08-20', 'Fundação']
    ]);
  });

  it('nomeia o marco da sprint no evento', () => {
    expect(eventos()[0].meta).toBe('Fundação · Em andamento');
  });

  // Atraso e derivado: sprint em andamento cuja janela ja passou.
  it('avisa sobre sprint vencida sem conclusao', () => {
    const [, fim] = calendario.buildEvents({
      sprints: [sprint()],
      milestones: [],
      milestoneNames: {},
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

describe('cartoes de agora', () => {
  const tiles = (opcoes) =>
    calendario.nowTiles({ sprints: [sprint()], milestones: [marco()], ...opcoes });

  it('nomeia a sprint ativa e quando ela termina', () => {
    const [ativa] = tiles({ hojeIso: '2026-08-10' });
    expect(ativa).toMatchObject({ value: 'Sprint 1', note: 'Termina 14/08' });
  });

  it('conta as sprints atrasadas', () => {
    const [, atencao] = tiles({ hojeIso: '2026-09-01' });
    expect(atencao.value).toBe('1 sprint atrasada');
  });

  it('sem nada atrasado diz isso por extenso', () => {
    const [, atencao] = tiles({ hojeIso: '2026-08-10' });
    expect(atencao).toMatchObject({ value: 'Nada atrasado', note: 'Tudo dentro do prazo' });
  });

  // Marco concluido nao e "o proximo", mesmo com prazo no futuro.
  it('ignora marco concluido ao apontar o proximo', () => {
    const [, , proximo] = calendario.nowTiles({
      sprints: [],
      milestones: [marco({ status: 'CONCLUIDO' })],
      hojeIso: '2026-08-10'
    });
    expect(proximo).toMatchObject({ value: '—', note: 'Todos os marcos concluídos' });
  });

  it('projeto sem sprint diz o que fazer', () => {
    const [ativa] = calendario.nowTiles({ sprints: [], milestones: [], hojeIso: '2026-08-10' });
    expect(ativa).toMatchObject({ value: 'Nenhuma', note: 'Inicie uma sprint planejada' });
  });
});

describe('interacao do calendario', () => {
  // Navegacao presa ao intervalo pintado (terceira iteracao do design,
  // docs/issues/RF10_PROMPT_UI_CALENDARIO_E_LAYOUT.md): dentro dele as setas
  // funcionam; nos extremos ficam aria-disabled e o clique e no-op. Antes este
  // teste navegava sobre agregado vazio — a grade vazia infinita que a mudanca
  // eliminou.
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

    // Clique na seta do limite e no-op: o mes nao muda.
    await user.click(proximo);
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument();

    await user.click(anterior);
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    await user.click(anterior);
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
  });

  // Sem nada pintado nao ha cronograma para navegar: o calendario descansa no
  // mes de hoje com as duas setas travadas.
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

  // Cancelada saiu do calendario inteiro — tambem nao estica o intervalo
  // navegavel ate um periodo que a grade nao pinta.
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

  // Janela semiaberta: fim a meia-noite do dia 1o pinta so ate 31/08, entao
  // setembro nao entra no intervalo.
  it('fim a meia-noite nao desbloqueia o mes seguinte', () => {
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint({ endDate: '2026-09-01T00:00:00' })] }
    });
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  // Projeto todo no passado (ou no futuro): abrir num mes corrente vazio
  // esconderia o cronograma. A vista gruda no limite mais proximo; o dia
  // selecionado continua sendo hoje e o painel do dia segue verdadeiro.
  it('hoje fora do intervalo abre no limite mais proximo', () => {
    renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()] },
      hoje: new Date(2027, 0, 15, 12)
    });
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    expect(screen.getByText('Agenda de sexta-feira, 15 de janeiro')).toBeInTheDocument();
  });

  // A grade e atalho visual, nao o unico caminho: cada dia e um botao nomeado
  // pela data por extenso, e o que ele cobre entra no rotulo.
  it('nomeia cada dia por extenso, com a sprint que o cobre', () => {
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] } });
    expect(
      screen.getByRole('button', { name: 'segunda-feira, 3 de agosto — Sprint 1' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /quinta-feira, 20 de agosto — prazo de marco/ })
    ).toBeInTheDocument();
  });

  it('clicar num dia abre a agenda dele', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()], milestones: [marco()] } });

    await user.click(screen.getByRole('button', { name: /segunda-feira, 3 de agosto/ }));
    expect(screen.getByText('Agenda de segunda-feira, 3 de agosto')).toBeInTheDocument();
    expect(screen.getByText('Início — Sprint 1')).toBeInTheDocument();
  });

  it('dia sem evento diz o que apareceria ali', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()] } });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 5 de agosto/ }));
    expect(screen.getByText('Nenhum evento neste dia.')).toBeInTheDocument();
    expect(screen.getByText(/Inícios e fins de sprint e prazos de marco/)).toBeInTheDocument();
  });

  // Clicar num dia de outro mes leva o calendario ate la: sem isso a selecao
  // sairia da vista e o painel falaria de um dia que a grade nao mostra.
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

  // Dia cinza na borda de um mes-limite: a selecao vale — o dia esta visivel
  // na grade —, mas a vista nao atravessa o limite atras dele.
  it('dia cinza alem do limite seleciona sem mover a vista', async () => {
    const user = userEvent.setup();
    renderCalendar({ schedule: { ...emptySchedule, sprints: [sprint()] } });

    await user.click(screen.getByRole('button', { name: /quarta-feira, 2 de setembro/ }));
    expect(screen.getByText('Agenda de quarta-feira, 2 de setembro')).toBeInTheDocument();
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
  });

  // O prazo de marco e livre (ADR-011 D03) e pode cair fora de toda janela de
  // sprint; o ponto pintado precisa ser alcancavel.
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

  // A cor sozinha nao identifica a sprint: a legenda nomeia cada faixa com o
  // periodo dela.
  it('a legenda nomeia cada sprint com o periodo', () => {
    const { container } = renderCalendar({
      schedule: { ...emptySchedule, sprints: [sprint()] }
    });
    // Escopo na legenda: "Sprint 1" tambem aparece no cartao "Sprint ativa", e
    // uma busca solta encontraria os dois.
    const legenda = within(container.querySelector('.calendar-legend'));
    expect(legenda.getByText('Sprint 1')).toBeInTheDocument();
    expect(legenda.getByText('03/08 – 14/08')).toBeInTheDocument();
    expect(legenda.getByText('Prazo de marco')).toBeInTheDocument();
  });

  // Extremo de dados: a paleta cicla a cada seis, e a legenda continua sendo
  // quem desfaz a ambiguidade.
  it('projeto com muitas sprints continua nomeando todas na legenda', () => {
    const muitas = Array.from({ length: 14 }, (_, indice) =>
      sprint({
        id: indice + 1,
        name: `Sprint ${indice + 1}`,
        startDate: `2026-0${(indice % 9) + 1}-01T00:00:00`,
        endDate: `2026-0${(indice % 9) + 1}-10T00:00:00`
      })
    );
    const { container } = renderCalendar({ schedule: { ...emptySchedule, sprints: muitas } });
    const legenda = within(container.querySelector('.calendar-legend'));
    for (const item of muitas) {
      expect(legenda.getByText(item.name)).toBeInTheDocument();
    }
  });

  it('projeto vazio mostra a grade e nenhum evento futuro', () => {
    renderCalendar();
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument();
    expect(screen.getByText('Nenhum evento futuro no cronograma.')).toBeInTheDocument();
  });

  // Sprint cancelada deixa de ocupar o cronograma: nada de faixa, legenda ou
  // eventos sobre um trabalho que nao vai acontecer. A lista de Sprints
  // continua a exibi-la — la ela e registro, aqui seria plano.
  it('sprint cancelada sai da faixa, da legenda e dos eventos', () => {
    const { container } = renderCalendar({
      schedule: {
        ...emptySchedule,
        sprints: [sprint({ status: 'CANCELADA' })]
      }
    });
    const legenda = within(container.querySelector('.calendar-legend'));
    expect(legenda.queryByText('Sprint 1')).toBeNull();
    expect(screen.queryByText('Início — Sprint 1')).toBeNull();
    expect(screen.queryByText('Fim — Sprint 1')).toBeNull();
    // Nenhum dia da grade recebe a faixa da sprint cancelada.
    expect(screen.queryByRole('button', { name: /Sprint 1/ })).toBeNull();
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

  // Bateria RF10/RF35: dos quatro estados do DoD (carregando, vazio, erro,
  // acesso negado), o erro recuperavel era o unico sem teste nesta tela.
  it('exibe erro recuperavel em falha generica', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('filtrar periodo rebusca somente o agregado', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Período exibido' });
    vi.clearAllMocks();
    mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });

    await user.type(screen.getByLabelText('Data inicial'), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.listSprints).not.toHaveBeenCalled();
    expect(mocks.schedule.listMilestones).not.toHaveBeenCalled();
    expect(mocks.projects.get).not.toHaveBeenCalled();
  });

  it('recusa periodo invertido sem chamar a API', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Período exibido' });
    vi.clearAllMocks();

    await user.type(screen.getByLabelText('Data inicial'), '2026-08-20');
    await user.type(screen.getByLabelText('Data final'), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(
      await screen.findByText('A data inicial não pode ser maior que a data final.')
    ).toBeInTheDocument();
    expect(mocks.schedule.getSchedule).not.toHaveBeenCalled();
  });

  // "Proximos eventos" so lista o futuro, entao o fixture e ancorado no relogio
  // do teste: datas fixas envelheceriam e o teste passaria a falhar sozinho.
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
