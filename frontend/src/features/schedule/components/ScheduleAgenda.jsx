import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '../../../shared/index.js';
import { buildAgenda } from './schedule-agenda.js';
import { formatCalendarDate } from './schedule-display.js';

// O tile de atencao existe para ser varrido em segundos: acima disso, resume.
const LIMITE_ATENCAO_VISIVEL = 3;

function listaAtencao(atencao) {
  const visiveis = atencao.itens.slice(0, LIMITE_ATENCAO_VISIVEL).join(', ');
  const restantes = atencao.total - LIMITE_ATENCAO_VISIVEL;
  return restantes > 0 ? `${visiveis} e mais ${restantes}` : visiveis;
}

// Faixa de situacao: responde "e agora?" acima da lista, em formato de varredura.
function AgendaSituacao({ situacao, hojeIso }) {
  const { emCurso, proximo, atencao } = situacao;

  // Caso minimo: dois tiles dizendo "nada" ocupariam mais area que a propria
  // agenda. Uma linha responde o mesmo sem moldura.
  if (emCurso.length === 0 && !proximo) {
    return (
      <p className="agenda-now-line">
        Hoje, {formatCalendarDate(hojeIso)} · nada em curso · nada à frente ·{' '}
        {atencao.total === 0
          ? 'nada atrasado'
          : `${atencao.total} ${atencao.total === 1 ? 'item atrasado' : 'itens atrasados'}: ${listaAtencao(atencao)}`}
      </p>
    );
  }

  return (
    <section className="agenda-now" aria-labelledby="agenda-now-title">
      <h3 id="agenda-now-title" className="agenda-now-title">
        Situação em {formatCalendarDate(hojeIso)} (hoje)
      </h3>
      <ul className="agenda-now-tiles">
        <li className="agenda-now-tile">
          <span className="agenda-now-label">Sprint em curso</span>
          {emCurso.length === 0 ? (
            <strong className="agenda-now-value">Nenhuma</strong>
          ) : (
            emCurso.map((sprint) => (
              <span key={sprint.name} className="agenda-now-group">
                <strong className="agenda-now-value">{sprint.name}</strong>
                {sprint.nota && <span className="agenda-now-note">{sprint.nota}</span>}
                <span className={`status-badge ${sprint.statusClass}`}>{sprint.statusLabel}</span>
              </span>
            ))
          )}
        </li>

        <li className="agenda-now-tile">
          <span className="agenda-now-label">Próximo evento</span>
          {proximo ? (
            <>
              <strong className="agenda-now-value">
                {proximo.relativo} · {formatCalendarDate(proximo.dia)}
              </strong>
              <span className="agenda-now-note">
                {proximo.tipo}: {proximo.titulo}
              </span>
            </>
          ) : (
            <strong className="agenda-now-value">Nada à frente</strong>
          )}
        </li>

        <li className={`agenda-now-tile ${atencao.total ? 'agenda-now-tile--atencao' : ''}`}>
          <span className="agenda-now-label">Atenção</span>
          <strong className="agenda-now-value">
            {atencao.total === 0
              ? 'Nada atrasado'
              : `${atencao.total} ${atencao.total === 1 ? 'item atrasado' : 'itens atrasados'}`}
          </strong>
          {atencao.total > 0 && <span className="agenda-now-note">{listaAtencao(atencao)}</span>}
        </li>
      </ul>
    </section>
  );
}

function AgendaEntrada({ entrada }) {
  // Remate de sprint: referencia, nao cartao. Sem badge, sem borda — a sprint
  // ja tem um unico cartao canonico no dia em que comeca.
  if (entrada.subordinada) {
    return (
      <li className="agenda-entry agenda-entry--nota">
        <span className="agenda-kind">{entrada.kindLabel}</span> {entrada.texto}
      </li>
    );
  }

  const classes = [
    'agenda-entry',
    entrada.atrasada ? 'agenda-entry--atrasada' : '',
    entrada.atenuada ? 'agenda-entry--atenuada' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes}>
      <p className="agenda-entry-head">
        {/* Tipo inline, na mesma linha do titulo: o token menos util nao pode
            ser o primeiro que o olho pega. */}
        <span className="agenda-kind">{entrada.kindLabel}</span>
        <strong className="agenda-entry-title">{entrada.title}</strong>
        {entrada.statusLabel && (
          <span className={`status-badge ${entrada.statusClass}`}>{entrada.statusLabel}</span>
        )}
        {/* Atraso e palavra, nunca so cor. */}
        {entrada.atrasada && <span className="status-badge status-cancelado">Atrasado</span>}
      </p>

      {entrada.meta?.length > 0 && <p className="agenda-entry-meta">{entrada.meta.join(' · ')}</p>}
      {entrada.objetivo && <p className="agenda-entry-meta">Objetivo: {entrada.objetivo}</p>}

      {entrada.avisos?.map((aviso) => (
        <p className="agenda-entry-warning" key={aviso}>
          {aviso}
        </p>
      ))}

      {entrada.tarefas?.length > 0 && (
        <details className="agenda-tasks">
          {/* O nome da sprint entra no summary: varios "Ver N tarefas" identicos
              seriam indistinguiveis na lista de controles do leitor de tela. */}
          <summary>
            Ver {entrada.tarefas.length} {entrada.tarefas.length === 1 ? 'tarefa' : 'tarefas'} de{' '}
            {entrada.title}
          </summary>
          <ul>
            {entrada.tarefas.map((tarefa) => (
              <li key={tarefa.id}>{tarefa.texto}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function AgendaDia({ dia }) {
  return (
    <li
      id={`agenda-dia-${dia.iso}`}
      className={`agenda-day ${dia.isHoje ? 'agenda-day--today' : ''}`}
    >
      {/* Lacuna temporal escrita, dentro do dia seguinte — nunca um item solto. */}
      {dia.gapAnterior > 1 && (
        <p className="agenda-gap">
          {dia.gapAnterior - 1} {dia.gapAnterior - 1 === 1 ? 'dia sem' : 'dias sem'} eventos
        </p>
      )}

      {/* A data vem primeiro e em destaque; dia da semana e distancia ficam
          juntos numa linha de apoio, para se lerem como descricao dela e nao
          como tres fragmentos empilhados. */}
      <h4 className="agenda-date">
        <time className="agenda-daynum" dateTime={dia.iso}>
          {formatCalendarDate(dia.iso).slice(0, 5)}
        </time>
        <span className="agenda-date-sub">
          {dia.weekday}
          {dia.relativo ? ` · ${dia.relativo}` : ''}
        </span>
      </h4>

      <div className="agenda-day-body">
        {dia.emCurso.length > 0 && (
          <p className="agenda-day-context">Em curso neste dia: {dia.emCurso.join(', ')}</p>
        )}
        <ul className="agenda-entries">
          {dia.entradas.map((entrada) => (
            <AgendaEntrada entrada={entrada} key={entrada.key} />
          ))}
        </ul>
      </div>
    </li>
  );
}

// Resumo do summary de mes: mesmas categorias da linha de recorte, para a soma
// dos meses bater com o topo. So um encerramento no mes? E o que ele diz.
function resumoDoMes(resumo, contemHoje) {
  const partes = [];
  const inclui = (n, singular, plural) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? singular : plural}`);
  };
  inclui(resumo.sprints, 'sprint', 'sprints');
  inclui(resumo.marcos, 'marco', 'marcos');
  inclui(resumo.prazos, 'prazo', 'prazos');
  if (!partes.length) {
    inclui(resumo.encerramentos, 'encerramento de sprint', 'encerramentos de sprint');
  }
  inclui(resumo.atrasados, 'atrasado', 'atrasados');
  if (contemHoje) partes.push('hoje');
  return partes.join(' · ');
}

export function ScheduleAgenda({ schedule, today, onClearPeriod }) {
  const agenda = useMemo(() => buildAgenda(schedule, today), [schedule, today]);

  // Focal congelado na montagem: recalcular a cada refetch fecharia e abriria
  // meses sob o usuario, ja que generatedAt muda em toda mutacao.
  const [focalInicial] = useState(() => agenda.mesFocal);
  // Toques do usuario tem precedencia sobre qualquer valor derivado.
  const [aberturas, setAberturas] = useState({});
  const scrollRef = useRef(null);

  const { contagem, janela, situacao, meses, semPrazo, vazio, modo } = agenda;
  const colapsada = modo === 'MESES_COLAPSADOS';

  // Se o filtro removeu o mes focal congelado, cai no recalculo puro — sem isso
  // um filtro deixaria todos os meses fechados.
  const focalEfetivo = meses.some((mes) => mes.chave === focalInicial)
    ? focalInicial
    : agenda.mesFocal;

  if (vazio === 'SEM_DADOS') {
    return (
      <EmptyState
        title="Cronograma vazio."
        description="Cadastre sprints, marcos ou tarefas com prazo para montar a agenda do projeto."
      />
    );
  }

  const segmentos = [];
  // Sem filtro, zeros sao ruido ("0 marcos" gritando no projeto novo). Com
  // filtro, zeros sao auditoria: "meu marco sumiu porque filtrei".
  const inclui = (n, singular, plural) => {
    if (janela.filtrada || n > 0) segmentos.push(`${n} ${n === 1 ? singular : plural}`);
  };
  inclui(contagem.sprints, 'sprint', 'sprints');
  inclui(contagem.marcos, 'marco', 'marcos');
  inclui(contagem.prazos, 'prazo de tarefa', 'prazos de tarefa');
  inclui(contagem.dias, 'data com eventos', 'datas com eventos');

  const irParaAgora = () => {
    if (!agenda.diaAgora) return;
    setAberturas((atual) => ({ ...atual, [agenda.diaAgora.slice(0, 7)]: true }));
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const alvo = document.getElementById(`agenda-dia-${agenda.diaAgora}`);
      if (!container || !alvo) return;
      // Rola o CONTAINER, nao a pagina: scrollIntoView arrastaria a janela toda
      // e tiraria os formularios de cadastro do campo de visao.
      container.scrollTop = alvo.offsetTop - container.offsetTop;
    });
  };

  return (
    <div className={`agenda ${colapsada ? 'agenda--colapsada' : ''}`}>
      {/* Recorte auditavel: conta COISAS, nao linhas. */}
      <p className="agenda-window">
        {[
          janela.filtrada
            ? `Exibindo ${formatCalendarDate(janela.from) || 'início'} a ${formatCalendarDate(janela.to) || 'fim'}`
            : 'Exibindo todo o período do projeto',
          ...segmentos
        ].join(' · ')}
      </p>

      {contagem.ocultosForaDoPeriodo > 0 && (
        <p className="agenda-outside">
          {contagem.ocultosForaDoPeriodo}{' '}
          {contagem.ocultosForaDoPeriodo === 1 ? 'prazo fora' : 'prazos fora'} do período — não
          exibidos na agenda, mas visíveis nas tarefas da sprint.
        </p>
      )}

      {janela.hojeForaDaJanela && (
        <p className="agenda-outside">
          Hoje ({formatCalendarDate(agenda.hojeIso)}) está fora do período filtrado.
        </p>
      )}

      {/* Com o filtro zerado, tres tiles de "nada" so emoldurariam o aviso. */}
      {!janela.hojeForaDaJanela && vazio !== 'FILTRO_VAZIO' && (
        <AgendaSituacao situacao={situacao} hojeIso={agenda.hojeIso} />
      )}

      {colapsada && agenda.diaAgora && (
        <p className="agenda-jump">
          <button type="button" className="button button-secondary" onClick={irParaAgora}>
            Ir para agora
          </button>
        </p>
      )}

      {vazio === 'FILTRO_VAZIO' ? (
        // Estado vazio que nomeia a CAUSA, em vez do generico "cadastre algo".
        <div className="agenda-empty">
          <p>
            Nenhuma sprint, marco ou prazo entre {formatCalendarDate(janela.from) || 'o início'} e{' '}
            {formatCalendarDate(janela.to) || 'o fim'}.
          </p>
          {onClearPeriod && (
            <button type="button" className="button button-secondary" onClick={onClearPeriod}>
              Limpar período
            </button>
          )}
        </div>
      ) : (
        // Area rolavel: a agenda deixa de empurrar os formularios de cadastro
        // para fora da tela. tabIndex + role/aria-label porque um container que
        // rola precisa ser alcancavel e nomeado para quem navega por teclado.
        <div
          className="agenda-scroll"
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Linha do tempo do cronograma"
        >
          {meses.map((mes) => {
            const listaDias = (
              <ol className="agenda-days">
                {mes.dias.map((dia) => (
                  <AgendaDia dia={dia} key={dia.iso} />
                ))}
              </ol>
            );
            return (
              <section key={mes.chave} className="agenda-month-section">
                {mes.lacunaAntes && <p className="agenda-month-gap">{mes.lacunaAntes}</p>}
                {/* O h3 fica FORA do summary: o outline de headings e identico nos
                    dois modos, e summary nao achata um heading interno.
                    Dentro do scroller ele gruda no topo, para o mes nunca se perder. */}
                <h3 className="agenda-month">{mes.titulo}</h3>
                {colapsada ? (
                  <details
                    className="agenda-month-group"
                    open={aberturas[mes.chave] ?? mes.chave === focalEfetivo}
                    onToggle={(event) => {
                      // details aninhados (tarefas da sprint) tambem emitem toggle.
                      if (event.target !== event.currentTarget) return;
                      const aberto = event.currentTarget.open;
                      setAberturas((atual) =>
                        atual[mes.chave] === aberto ? atual : { ...atual, [mes.chave]: aberto }
                      );
                    }}
                  >
                    <summary className="agenda-month-summary">
                      {resumoDoMes(mes.resumo, mes.contemHoje)}
                    </summary>
                    {listaDias}
                  </details>
                ) : (
                  listaDias
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* O rodape so existe para o que nao aparece em nenhum outro lugar. */}
      {semPrazo.length > 0 && (
        <footer className="agenda-footer">
          <h3>Fora da linha do tempo</h3>
          <p className="agenda-footer-line">
            <strong>Tarefas sem prazo</strong> — {semPrazo.length} não{' '}
            {semPrazo.length === 1 ? 'entra' : 'entram'} na agenda por não ter data.
          </p>
          <ul className="agenda-footer-list">
            {semPrazo.map((tarefa) => (
              <li key={`${tarefa.origem}-${tarefa.id}`}>
                {tarefa.title} — {tarefa.statusLabel} · {tarefa.origem}
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
