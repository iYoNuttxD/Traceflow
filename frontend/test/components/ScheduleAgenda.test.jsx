// RF10: a agenda substitui o grafico de barras. Nada aqui depende de geometria:
// o teste verifica agrupamento por data, invariantes e comunicacao por palavra.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ScheduleAgenda } from '../../src/features/schedule/components/ScheduleAgenda.jsx';
import {
  LIMITE_AGENDA_ABERTA,
  buildAgenda,
  calcularMesFocal,
  diffEmDias,
  lacunaEntreMeses,
  relativeDayLabel,
  sprintEntries,
  toIsoDay,
  weekdayLabel
} from '../../src/features/schedule/components/schedule-agenda.js';

const HOJE = new Date('2026-08-08T12:00:00.000Z');

const sprint1 = {
  id: 1,
  name: 'Sprint 1',
  objective: null,
  startDate: '2026-08-08',
  endDate: '2026-08-10',
  status: 'EM_ANDAMENTO',
  durationInDays: 3,
  taskCount: 1,
  tasks: [
    {
      id: 10,
      title: 'Teste tarefa 1',
      status: 'A_FAZER',
      priority: 'MEDIA',
      deadline: '2026-08-07',
      responsibleUserId: null,
      deadlineOutsideWindow: true
    }
  ]
};

const sprintUmDia = {
  id: 2,
  name: 'dfdfdf',
  objective: null,
  startDate: '2026-08-09',
  endDate: '2026-08-09',
  status: 'CONCLUIDA',
  durationInDays: 1,
  taskCount: 0,
  tasks: []
};

function agenda(overrides = {}) {
  return {
    projectId: 1,
    range: { from: null, to: null },
    generatedAt: '2026-08-08T12:00:00.000Z',
    sprints: [sprint1, sprintUmDia],
    milestones: [],
    unassignedTasks: [],
    ...overrides
  };
}

describe('helpers de data', () => {
  it('normaliza string e Date para dia UTC', () => {
    expect(toIsoDay('2026-08-08T23:00:00.000Z')).toBe('2026-08-08');
    expect(toIsoDay(new Date('2026-08-08T12:00:00.000Z'))).toBe('2026-08-08');
    expect(toIsoDay(null)).toBeNull();
    expect(toIsoDay('nao-e-data')).toBeNull();
  });

  it('conta dias entre datas', () => {
    expect(diffEmDias('2026-08-08', '2026-08-10')).toBe(2);
    expect(diffEmDias('2026-08-10', '2026-08-08')).toBe(-2);
    expect(diffEmDias('2026-08-31', '2026-09-01')).toBe(1);
  });

  // Tabela fixa em vez de Intl: o dia nao pode escorregar pelo fuso local
  // nem depender de ICU completo no ambiente de CI.
  it('resolve o dia da semana em UTC', () => {
    // Nome por extenso: "dom" solto numa coluna estreita lia-se como fragmento.
    expect(weekdayLabel('2026-08-08')).toBe('sábado');
    expect(weekdayLabel('2026-08-09')).toBe('domingo');
    expect(weekdayLabel('2026-08-10')).toBe('segunda');
    expect(weekdayLabel('invalido')).toBe('');
  });

  it('descreve a distancia em palavras', () => {
    expect(relativeDayLabel('2026-08-08', '2026-08-08')).toBe('Hoje');
    expect(relativeDayLabel('2026-08-09', '2026-08-08')).toBe('Amanhã');
    expect(relativeDayLabel('2026-08-07', '2026-08-08')).toBe('Ontem');
    expect(relativeDayLabel('2026-08-12', '2026-08-08')).toBe('em 4 dias');
    expect(relativeDayLabel('2026-08-01', '2026-08-08')).toBe('há 7 dias');
  });
});

describe('sprintEntries — invariante de nunca sumir', () => {
  const janelaAberta = { from: null, to: null, filtrada: false };

  it('sprint de um dia gera UMA entrada, nao duas', () => {
    const entradas = sprintEntries(sprintUmDia, janelaAberta, '2026-08-08');
    expect(entradas).toHaveLength(1);
    expect(entradas[0].kind).toBe('SPRINT_DIA_UNICO');
    expect(entradas[0].meta[0]).toContain('começa e encerra em 09/08/2026');
  });

  it('sprint de varios dias gera cartao no inicio e remate no fim', () => {
    const entradas = sprintEntries(sprint1, janelaAberta, '2026-08-08');
    expect(entradas.map((e) => e.kind)).toEqual(['SPRINT', 'SPRINT_FIM']);
    expect(entradas[0].dia).toBe('2026-08-08');
    expect(entradas[1].dia).toBe('2026-08-10');
    // O remate e subordinado: sem badge proprio, para nao contar como 2 sprints.
    expect(entradas[1].subordinada).toBe(true);
    expect(entradas[1].statusLabel).toBeUndefined();
  });

  it('sprint que comeca antes da janela nao desaparece', () => {
    const janela = { from: '2026-08-09', to: '2026-08-09', filtrada: true };
    const entradas = sprintEntries(sprint1, janela, '2026-08-09');
    expect(entradas).toHaveLength(1);
    expect(entradas[0].kind).toBe('SPRINT_EM_CURSO');
    // Ancorada no primeiro dia da janela, com a data real escrita.
    expect(entradas[0].dia).toBe('2026-08-09');
    expect(entradas[0].meta[0]).toContain('começou em 08/08/2026, antes do período');
    expect(entradas[0].meta.join(' ')).toContain('termina em 10/08/2026, depois do período');
  });

  it('calcula o progresso em palavras', () => {
    const [cartao] = sprintEntries(sprint1, janelaAberta, '2026-08-09');
    expect(cartao.meta.join(' · ')).toContain('dia 2 de 3');
  });
});

describe('buildAgenda', () => {
  it('agrupa por data em ordem cronologica', () => {
    const resultado = buildAgenda(agenda(), HOJE);
    const dias = resultado.meses.flatMap((mes) => mes.dias).map((dia) => dia.iso);
    expect(dias).toEqual(['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']);
  });

  it('conta coisas, nao linhas', () => {
    const { contagem } = buildAgenda(agenda(), HOJE);
    expect(contagem.sprints).toBe(2);
    expect(contagem.marcos).toBe(0);
    expect(contagem.prazos).toBe(1);
    expect(contagem.dias).toBe(4);
  });

  // A anomalia que o grafico escondia: o prazo vence ANTES da sprint comecar.
  it('revela prazo anterior ao inicio da sprint, com aviso', () => {
    const resultado = buildAgenda(agenda(), HOJE);
    const dia = resultado.meses[0].dias[0];
    expect(dia.iso).toBe('2026-08-07');
    expect(dia.entradas[0].kind).toBe('PRAZO');
    expect(dia.entradas[0].atrasada).toBe(true);
    expect(dia.entradas[0].avisos[0]).toContain('Prazo fora da janela da sprint');
  });

  it('ordena dentro do dia: sprint, marco, prazo, remate', () => {
    const resultado = buildAgenda(
      agenda({
        milestones: [
          {
            id: 1,
            title: 'Entrega',
            description: null,
            dueDate: '2026-08-08',
            status: 'PENDENTE',
            overdue: false
          }
        ]
      }),
      HOJE
    );
    const hoje = resultado.meses[0].dias.find((dia) => dia.iso === '2026-08-08');
    expect(hoje.entradas.map((e) => e.kind)).toEqual(['SPRINT', 'MARCO']);
  });

  it('marca sprint em curso no dia sem cartao proprio', () => {
    const resultado = buildAgenda(agenda(), HOJE);
    const dia09 = resultado.meses[0].dias.find((dia) => dia.iso === '2026-08-09');
    // Sprint 1 cobre o dia 09 mas seu cartao esta no 08: vira metadado.
    expect(dia09.emCurso).toContain('Sprint 1 (dia 2 de 3)');
  });

  // Regressao: "em curso" era derivado so da janela de datas. Uma sprint
  // CANCELADA aparecia anunciada como em andamento nos dias que ela cobria.
  it('nao anuncia sprint CANCELADA como em curso em dia nenhum', () => {
    const cancelada = { ...sprint1, id: 99, name: 'Sprint cancelada', status: 'CANCELADA' };
    // sprintUmDia precisa continuar: e ele que cria o dia 09 na agenda.
    const resultado = buildAgenda(agenda({ sprints: [sprint1, sprintUmDia, cancelada] }), HOJE);
    const dia09 = resultado.meses[0].dias.find((dia) => dia.iso === '2026-08-09');

    expect(dia09.emCurso).toContain('Sprint 1 (dia 2 de 3)');
    expect(dia09.emCurso.join(' ')).not.toContain('Sprint cancelada');
    expect(resultado.situacao.emCurso.map((s) => s.name)).not.toContain('Sprint cancelada');
  });

  // "Agora" e mais estrito que a leitura historica dos dias.
  it('nao lista sprint CONCLUIDA como em curso hoje, mas preserva o passado', () => {
    const concluida = { ...sprint1, id: 98, name: 'Sprint concluida', status: 'CONCLUIDA' };
    const resultado = buildAgenda(agenda({ sprints: [concluida, sprintUmDia] }), HOJE);

    expect(resultado.situacao.emCurso.map((s) => s.name)).not.toContain('Sprint concluida');
    const dia09 = resultado.meses[0].dias.find((dia) => dia.iso === '2026-08-09');
    expect(dia09.emCurso).toContain('Sprint concluida (dia 2 de 3)');
  });

  it('nao repete a sprint como cartao em dias intermediarios', () => {
    const resultado = buildAgenda(agenda(), HOJE);
    const cartoes = resultado.meses
      .flatMap((mes) => mes.dias)
      .flatMap((dia) => dia.entradas)
      .filter((e) => e.kind === 'SPRINT');
    expect(cartoes).toHaveLength(1);
  });

  it('tarefa sem prazo vai para o rodape, nunca para o eixo', () => {
    const resultado = buildAgenda(
      agenda({
        unassignedTasks: [
          { id: 12, title: 'Ajustar CORS', status: 'A_FAZER', priority: 'MEDIA', deadline: null }
        ]
      }),
      HOJE
    );
    expect(resultado.semPrazo.map((t) => t.title)).toContain('Ajustar CORS');
    const titulos = resultado.meses
      .flatMap((m) => m.dias)
      .flatMap((d) => d.entradas)
      .map((e) => e.title);
    expect(titulos).not.toContain('Ajustar CORS');
  });

  it('conta prazos fora do periodo sem criar no de dia', () => {
    const resultado = buildAgenda(
      agenda({ range: { from: '2026-08-08', to: '2026-08-10' } }),
      HOJE
    );
    expect(resultado.contagem.ocultosForaDoPeriodo).toBe(1);
    const dias = resultado.meses.flatMap((m) => m.dias).map((d) => d.iso);
    expect(dias).not.toContain('2026-08-07');
  });

  it('mantém o gap de dias dentro do mesmo mês', () => {
    const resultado = buildAgenda(
      agenda({
        sprints: [sprint1],
        milestones: [
          {
            id: 1,
            title: 'Fim do mês',
            description: null,
            dueDate: '2026-08-25',
            status: 'PENDENTE',
            overdue: false
          }
        ]
      }),
      HOJE
    );
    const dia25 = resultado.meses[0].dias.find((dia) => dia.iso === '2026-08-25');
    expect(dia25.gapAnterior).toBe(15);
  });

  it('entre meses, o gap de dia é suprimido e vira lacuna de mês', () => {
    const resultado = buildAgenda(
      agenda({
        sprints: [sprint1],
        milestones: [
          {
            id: 1,
            title: 'Longe',
            description: null,
            dueDate: '2026-11-05',
            status: 'PENDENTE',
            overdue: false
          }
        ]
      }),
      HOJE
    );
    const novembro = resultado.meses.find((mes) => mes.chave === '2026-11');
    expect(novembro.dias[0].gapAnterior).toBeNull();
    expect(novembro.lacunaAntes).toBe('setembro e outubro de 2026 — sem eventos');
  });

  it('meses adjacentes não têm lacuna', () => {
    expect(lacunaEntreMeses('2026-08', '2026-09')).toBeNull();
    expect(lacunaEntreMeses('2026-09', '2026-10')).toBeNull();
    expect(lacunaEntreMeses('2026-12', '2027-01')).toBeNull();
    expect(lacunaEntreMeses('2026-09', '2027-02')).toBe(
      'outubro de 2026 a janeiro de 2027 — sem eventos'
    );
  });

  it('usa generatedAt como hoje quando today nao e passado', () => {
    expect(buildAgenda(agenda()).hojeIso).toBe('2026-08-08');
  });

  it('distingue vazio por falta de dado de vazio por filtro', () => {
    expect(buildAgenda(agenda({ sprints: [] })).vazio).toBe('SEM_DADOS');
    expect(
      buildAgenda(agenda({ sprints: [], range: { from: '2027-01-01', to: '2027-01-31' } })).vazio
    ).toBe('FILTRO_VAZIO');
  });

  it('resume a situacao atual', () => {
    const { situacao } = buildAgenda(agenda(), HOJE);
    expect(situacao.emCurso[0].name).toBe('Sprint 1');
    expect(situacao.emCurso[0].nota).toBe('dia 1 de 3');
    expect(situacao.proximo.titulo).toBe('dfdfdf');
    expect(situacao.atencao.total).toBe(1);
    expect(situacao.atencao.itens).toContain('Teste tarefa 1');
  });
});

describe('render da agenda', () => {
  it('exibe o recorte contando entidades, omitindo zeros sem filtro', () => {
    render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const recorte = screen.getByText(/Exibindo todo o período/);
    expect(recorte).toHaveTextContent('2 sprints');
    expect(recorte).toHaveTextContent('1 prazo de tarefa');
    // "0 marcos" gritando no projeto pequeno era ruído; sem filtro, some.
    expect(recorte).not.toHaveTextContent('0 marcos');
  });

  it('com filtro ativo, zeros aparecem para o recorte ser auditável', () => {
    render(
      <ScheduleAgenda
        schedule={agenda({ range: { from: '2026-08-01', to: '2026-08-31' } })}
        today={HOJE}
      />
    );
    expect(screen.getByText(/Exibindo 01\/08\/2026 a 31\/08\/2026/)).toHaveTextContent('0 marcos');
  });

  it('destaca o dia de hoje com palavra, nao so cor', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    // A distancia agora acompanha o dia da semana na linha de apoio da data.
    const hoje = container.querySelector('.agenda-day--today');
    expect(hoje).not.toBeNull();
    expect(hoje.querySelector('.agenda-date-sub')).toHaveTextContent('sábado · Hoje');
    // O dia anterior mostra a propria distancia, nao a de hoje.
    expect(container.querySelector('.agenda-date-sub')).toHaveTextContent('sexta · Ontem');
  });

  it('mostra a faixa de situacao', () => {
    render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    expect(screen.getByText('Sprint em curso')).toBeInTheDocument();
    expect(screen.getByText('Próximo evento')).toBeInTheDocument();
    expect(screen.getByText('1 item atrasado')).toBeInTheDocument();
  });

  it('a sprint aparece uma unica vez como cartao', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const titulos = [...container.querySelectorAll('.agenda-entry-title')].map(
      (n) => n.textContent
    );
    expect(titulos.filter((t) => t === 'Sprint 1')).toHaveLength(1);
  });

  it('o remate nao tem badge de status', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const nota = container.querySelector('.agenda-entry--nota');
    expect(nota).toHaveTextContent('último dia previsto');
    expect(within(nota).queryByText('Em andamento')).not.toBeInTheDocument();
  });

  it('esconde as tarefas atras de details fechado', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const details = container.querySelector('.agenda-tasks');
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('Ver 1 tarefa de Sprint 1');
  });

  it('nomeia a causa quando o filtro zera a agenda', () => {
    const onClearPeriod = () => {};
    render(
      <ScheduleAgenda
        schedule={agenda({ sprints: [], range: { from: '2027-01-01', to: '2027-01-31' } })}
        today={HOJE}
        onClearPeriod={onClearPeriod}
      />
    );
    expect(screen.getByText(/Nenhuma sprint, marco ou prazo entre/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar período' })).toBeInTheDocument();
  });

  it('omite o rodapé quando não há tarefa sem prazo', () => {
    render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    // A contagem do topo já cobre marcos; o rodapé só existe para o que não
    // aparece em nenhum outro lugar.
    expect(screen.queryByText('Fora da linha do tempo')).not.toBeInTheDocument();
  });

  it('o rodapé lista as tarefas sem prazo quando existem', () => {
    render(
      <ScheduleAgenda
        schedule={agenda({
          unassignedTasks: [
            { id: 12, title: 'Ajustar CORS', status: 'A_FAZER', priority: 'MEDIA', deadline: null }
          ]
        })}
        today={HOJE}
      />
    );
    expect(screen.getByText('Fora da linha do tempo')).toBeInTheDocument();
    expect(screen.getByText(/Ajustar CORS/)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum marco/)).not.toBeInTheDocument();
  });

  it('avisa quando hoje esta fora do periodo filtrado', () => {
    render(
      <ScheduleAgenda
        schedule={agenda({ range: { from: '2026-09-01', to: '2026-09-30' } })}
        today={HOJE}
      />
    );
    expect(screen.getByText(/está fora do período filtrado/)).toBeInTheDocument();
  });
});

// Correcoes da verificacao adversarial: escala, foco e integridade das contagens.
describe('modo colapsado — limite e meses', () => {
  const seq = (base, inicioIso, quantidade, prefixo = 'M') => {
    const [ano, mes, dia] = inicioIso.split('-').map(Number);
    return Array.from({ length: quantidade }, (_, i) => ({
      id: base + i,
      title: `${prefixo}${base + i}`,
      description: null,
      dueDate: new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10),
      status: 'PENDENTE',
      overdue: false
    }));
  };
  const tresMeses = [
    ...seq(100, '2026-09-01', 9, 'Set'),
    ...seq(200, '2026-10-01', 9, 'Out'),
    ...seq(300, '2026-11-01', 9, 'Nov')
  ];

  it('nao colapsa com muitas datas num mes so', () => {
    const r = buildAgenda(agenda({ sprints: [], milestones: seq(100, '2026-09-01', 25) }), HOJE);
    expect(r.contagem.dias).toBeGreaterThan(LIMITE_AGENDA_ABERTA);
    expect(r.modo).toBe('ABERTA');
  });

  it('colapsa acima do limite quando ha pelo menos tres meses', () => {
    const r = buildAgenda(agenda({ sprints: [], milestones: tresMeses }), HOJE);
    expect(r.contagem.dias).toBe(27);
    expect(r.modo).toBe('MESES_COLAPSADOS');
  });

  it('no limite exato, permanece aberta', () => {
    const vinteQuatro = [
      ...seq(100, '2026-09-01', 8),
      ...seq(200, '2026-10-01', 8),
      ...seq(300, '2026-11-01', 8)
    ];
    const r = buildAgenda(agenda({ sprints: [], milestones: vinteQuatro }), HOJE);
    expect(r.contagem.dias).toBe(LIMITE_AGENDA_ABERTA);
    expect(r.modo).toBe('ABERTA');
  });

  it('foca o mes de hoje quando ele ainda tem dias por vir', () => {
    expect(buildAgenda(agenda(), HOJE).mesFocal).toBe('2026-08');
  });

  it('pula para o proximo mes quando o de hoje so tem passado', () => {
    const r = buildAgenda(
      agenda({
        sprints: [],
        milestones: [...seq(100, '2026-08-01', 2), ...seq(200, '2026-09-10', 2)]
      }),
      HOJE
    );
    expect(r.mesFocal).toBe('2026-09');
  });

  it('com tudo no passado, foca o mes mais recente', () => {
    const meses = [
      { chave: '2026-05', dias: [{ iso: '2026-05-02' }] },
      { chave: '2026-06', dias: [{ iso: '2026-06-10' }] }
    ];
    expect(calcularMesFocal(meses, '2026-08-08')).toBe('2026-06');
  });

  it('a soma dos resumos dos meses bate com a contagem do topo', () => {
    const r = buildAgenda(
      agenda({
        milestones: seq(100, '2026-09-05', 2),
        unassignedTasks: [
          { id: 60, title: 'Solta', status: 'A_FAZER', priority: 'MEDIA', deadline: '2026-10-02' }
        ]
      }),
      HOJE
    );
    const soma = r.meses.reduce(
      (acc, mes) => ({
        sprints: acc.sprints + mes.resumo.sprints,
        marcos: acc.marcos + mes.resumo.marcos,
        prazos: acc.prazos + mes.resumo.prazos
      }),
      { sprints: 0, marcos: 0, prazos: 0 }
    );
    expect(soma.sprints).toBe(r.contagem.sprints);
    expect(soma.marcos).toBe(r.contagem.marcos);
    expect(soma.prazos).toBe(r.contagem.prazos);
  });

  it('a reconciliacao sobrevive a sprint ancorada pelo filtro', () => {
    const r = buildAgenda(agenda({ range: { from: '2026-08-09', to: '2026-08-10' } }), HOJE);
    const soma = r.meses.reduce((acc, mes) => acc + mes.resumo.sprints, 0);
    expect(soma).toBe(r.contagem.sprints);
  });

  it('diaAgora aponta para o primeiro dia por vir, ou o ultimo do passado', () => {
    expect(buildAgenda(agenda(), HOJE).diaAgora).toBe('2026-08-08');
    const passado = buildAgenda(
      agenda({ sprints: [], milestones: seq(100, '2026-06-01', 2) }),
      HOJE
    );
    expect(passado.diaAgora).toBe('2026-06-02');
  });
});

describe('remate sem dupla mencao', () => {
  it('no ultimo dia, o remate substitui a mencao de "em curso"', () => {
    const r = buildAgenda(agenda({ sprints: [sprint1] }), HOJE);
    const dia10 = r.meses[0].dias.find((dia) => dia.iso === '2026-08-10');
    expect(dia10.entradas[0].kind).toBe('SPRINT_FIM');
    expect(dia10.emCurso).toEqual([]);
  });
});

describe('situacao degradada e atencao resumida', () => {
  it('vira uma linha quando nada esta em curso nem a frente', () => {
    render(
      <ScheduleAgenda
        schedule={agenda({
          sprints: [],
          unassignedTasks: [
            {
              id: 70,
              title: 'Atrasada',
              status: 'A_FAZER',
              priority: 'MEDIA',
              deadline: '2026-08-07'
            }
          ]
        })}
        today={HOJE}
      />
    );
    expect(
      screen.getByText(/nada em curso · nada à frente · 1 item atrasado: Atrasada/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Sprint em curso')).not.toBeInTheDocument();
  });

  it('resume a lista de atrasados alem de tres', () => {
    const atrasadas = Array.from({ length: 5 }, (_, i) => ({
      id: 80 + i,
      title: `T${i + 1}`,
      status: 'A_FAZER',
      priority: 'MEDIA',
      deadline: '2026-08-01'
    }));
    render(<ScheduleAgenda schedule={agenda({ unassignedTasks: atrasadas })} today={HOJE} />);
    expect(screen.getByText(/e mais 3/)).toBeInTheDocument();
  });

  it('suprime a faixa de situacao quando o filtro zera a agenda', () => {
    render(
      <ScheduleAgenda
        schedule={agenda({ sprints: [], range: { from: '2027-01-01', to: '2027-01-31' } })}
        today={HOJE}
        onClearPeriod={() => {}}
      />
    );
    expect(screen.queryByText(/Situação em/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhuma sprint, marco ou prazo entre/)).toBeInTheDocument();
  });
});

describe('render em modo colapsado', () => {
  const seq = (base, inicioIso, quantidade, prefixo) => {
    const [ano, mes, dia] = inicioIso.split('-').map(Number);
    return Array.from({ length: quantidade }, (_, i) => ({
      id: base + i,
      title: `${prefixo}${i + 1}`,
      description: null,
      dueDate: new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10),
      status: 'PENDENTE',
      overdue: false
    }));
  };
  const tresMeses = [
    ...seq(100, '2026-09-01', 9, 'Set'),
    ...seq(200, '2026-10-01', 9, 'Out'),
    ...seq(300, '2026-11-01', 9, 'Nov')
  ];
  const dados = () => agenda({ sprints: [], milestones: tresMeses });

  it('agrupa em details com o titulo do mes como heading fora do summary', () => {
    const { container } = render(<ScheduleAgenda schedule={dados()} today={HOJE} />);
    const grupos = container.querySelectorAll('details.agenda-month-group');
    expect(grupos).toHaveLength(3);
    // hoje (agosto) nao tem eventos: o focal e o proximo mes com eventos.
    expect(grupos[0].open).toBe(true);
    expect(grupos[1].open).toBe(false);
    expect(grupos[2].open).toBe(false);
    expect(screen.getByRole('heading', { name: 'setembro de 2026' })).toBeInTheDocument();
    expect(grupos[1].querySelector('summary')).toHaveTextContent('9 marcos');
  });

  it('conteudo de mes fechado existe no DOM mas nao esta visivel', () => {
    render(<ScheduleAgenda schedule={dados()} today={HOJE} />);
    expect(screen.getByText('Set1')).toBeVisible();
    expect(screen.getByText('Out1')).not.toBeVisible();
  });

  it('o toggle do usuario sobrevive a um refetch', async () => {
    const user = userEvent.setup();
    const original = dados();
    const { container, rerender } = render(<ScheduleAgenda schedule={original} today={HOJE} />);
    const grupos = () => container.querySelectorAll('details.agenda-month-group');

    await user.click(grupos()[2].querySelector('summary'));
    expect(grupos()[2].open).toBe(true);

    // Refetch: objeto novo, generatedAt novo — o cenario que clobberia o toggle.
    rerender(
      <ScheduleAgenda
        schedule={{ ...original, generatedAt: '2026-08-08T18:00:00.000Z' }}
        today={HOJE}
      />
    );
    expect(grupos()[2].open).toBe(true);
    expect(grupos()[0].open).toBe(true);
  });

  it('"Ir para agora" reabre o mes alvo depois de fechado', async () => {
    const user = userEvent.setup();
    const { container } = render(<ScheduleAgenda schedule={dados()} today={HOJE} />);
    const grupos = () => container.querySelectorAll('details.agenda-month-group');

    await user.click(grupos()[0].querySelector('summary'));
    expect(grupos()[0].open).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Ir para agora' }));
    expect(grupos()[0].open).toBe(true);
  });

  it('modo aberto nao rende details de mes', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    expect(container.querySelector('details.agenda-month-group')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ir para agora' })).not.toBeInTheDocument();
  });
});

// A agenda deixou de empurrar os formularios de cadastro para fora da tela.
describe('area rolavel', () => {
  it('envolve os meses numa regiao rolavel, alcancavel por teclado', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const scroller = container.querySelector('.agenda-scroll');
    expect(scroller).not.toBeNull();
    // Container que rola precisa ser focavel, senao quem usa teclado nao rola.
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toHaveAttribute('role', 'region');
    expect(scroller).toHaveAccessibleName('Linha do tempo do cronograma');
  });

  it('mantem a faixa de situacao e o recorte FORA do scroller', () => {
    const { container } = render(<ScheduleAgenda schedule={agenda()} today={HOJE} />);
    const scroller = container.querySelector('.agenda-scroll');
    // O contexto de "e agora?" nao pode rolar para fora da vista.
    expect(scroller.querySelector('.agenda-now')).toBeNull();
    expect(scroller.querySelector('.agenda-window')).toBeNull();
    // Mas os meses estao dentro dele.
    expect(scroller.querySelectorAll('.agenda-month-section').length).toBeGreaterThan(0);
  });

  it('o estado vazio por filtro nao vira area rolavel', () => {
    const { container } = render(
      <ScheduleAgenda
        schedule={agenda({ sprints: [], range: { from: '2027-01-01', to: '2027-01-31' } })}
        today={HOJE}
        onClearPeriod={() => {}}
      />
    );
    expect(container.querySelector('.agenda-scroll')).toBeNull();
  });

  it('"Ir para agora" rola o container, nao a pagina', async () => {
    const user = userEvent.setup();
    const seq = (base, inicioIso, quantidade, prefixo) => {
      const [ano, mes, dia] = inicioIso.split('-').map(Number);
      return Array.from({ length: quantidade }, (_, i) => ({
        id: base + i,
        title: `${prefixo}${i + 1}`,
        description: null,
        dueDate: new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10),
        status: 'PENDENTE',
        overdue: false
      }));
    };
    const dados = agenda({
      sprints: [],
      milestones: [
        ...seq(100, '2026-09-01', 9, 'Set'),
        ...seq(200, '2026-10-01', 9, 'Out'),
        ...seq(300, '2026-11-01', 9, 'Nov')
      ]
    });

    const { container } = render(<ScheduleAgenda schedule={dados} today={HOJE} />);
    const scroller = container.querySelector('.agenda-scroll');
    const paginaAntes = window.scrollY;

    await user.click(screen.getByRole('button', { name: 'Ir para agora' }));

    // jsdom nao faz layout, entao offsetTop e 0 e scrollTop fica 0; o que este
    // teste garante e que a pagina NAO foi arrastada e o container existe.
    expect(scroller).not.toBeNull();
    expect(window.scrollY).toBe(paginaAntes);
  });
});
