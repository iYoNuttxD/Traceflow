import { Fragment, useMemo, useState } from 'react';
import { taskPriorityLabels, taskStatusLabels } from './schedule-display.js';
import {
  INICIAIS_SEMANA,
  buildEvents,
  buildMonthGrid,
  calendarBounds,
  clampMonth,
  deadlineTasks,
  eventsForDay,
  longDayLabel,
  milestoneColors,
  milestonePeriods,
  milestoneWeekLayout,
  monthBlocks,
  monthLabel,
  monthLegend,
  nextMonth,
  nowTiles,
  previousMonth,
  shortDate,
  shortDayLabel,
  sprintColors,
  sprintDayRange,
  todayIsoDay,
  upcomingEvents
} from './schedule-calendar.js';

const DIAS_SEMANA_LONGOS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado'
];

const LIMITE_TAREFAS_DO_DIA = 6;

export function ScheduleCalendar({ schedule, milestoneNames = {}, hoje = new Date() }) {
  const hojeIso = todayIsoDay(hoje);
  const [selecionado, setSelecionado] = useState(hojeIso);
  const [marcoAberto, setMarcoAberto] = useState(null);
  const [{ ano, mes }, setMesVisivel] = useState(() => ({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth()
  }));

  const sprints = useMemo(
    () => (schedule?.sprints || []).filter((sprint) => sprint.status !== 'CANCELADA'),
    [schedule]
  );
  const milestones = useMemo(() => schedule?.milestones || [], [schedule]);
  const periodos = useMemo(() => milestonePeriods({ milestones, sprints }), [milestones, sprints]);
  const tarefas = useMemo(
    () => deadlineTasks({ sprints, unassignedTasks: schedule?.unassignedTasks || [] }),
    [sprints, schedule]
  );

  const limites = useMemo(() => {
    const pintado = calendarBounds({ sprints, milestones });
    if (pintado) return pintado;
    const [anoDeHoje, mesDeHoje] = hojeIso.split('-').map(Number);
    const mesCorrente = { ano: anoDeHoje, mes: mesDeHoje - 1 };
    return { min: mesCorrente, max: mesCorrente };
  }, [sprints, milestones, hojeIso]);

  const mesExibido = clampMonth(limites, { ano, mes });
  const noInicio = mesExibido.ano === limites.min.ano && mesExibido.mes === limites.min.mes;
  const noFim = mesExibido.ano === limites.max.ano && mesExibido.mes === limites.max.mes;

  const cores = useMemo(() => sprintColors(sprints), [sprints]);
  const coresMarco = useMemo(() => milestoneColors(milestones), [milestones]);
  const celulas = useMemo(
    () =>
      buildMonthGrid({
        ano: mesExibido.ano,
        mes: mesExibido.mes,
        sprints,
        periodos,
        hojeIso,
        selecionadoIso: selecionado
      }),
    [mesExibido.ano, mesExibido.mes, sprints, periodos, hojeIso, selecionado]
  );
  const semanas = useMemo(() => milestoneWeekLayout({ celulas, periodos }), [celulas, periodos]);
  const eventos = useMemo(
    () => buildEvents({ sprints, periodos, milestoneNames, tarefas, hojeIso }),
    [sprints, periodos, milestoneNames, tarefas, hojeIso]
  );
  const doDia = useMemo(() => eventsForDay(eventos, selecionado), [eventos, selecionado]);
  const proximos = useMemo(() => upcomingEvents(eventos, hojeIso), [eventos, hojeIso]);
  const tiles = useMemo(
    () => nowTiles({ sprints, periodos, tarefas, hojeIso }),
    [sprints, periodos, tarefas, hojeIso]
  );
  const legenda = useMemo(
    () => monthLegend({ ano: mesExibido.ano, mes: mesExibido.mes, sprints, periodos }),
    [mesExibido.ano, mesExibido.mes, sprints, periodos]
  );
  const noMes = useMemo(
    () =>
      monthBlocks({
        ano: mesExibido.ano,
        mes: mesExibido.mes,
        sprints,
        periodos,
        milestoneNames,
        tarefas
      }),
    [mesExibido.ano, mesExibido.mes, sprints, periodos, milestoneNames, tarefas]
  );

  const sprintDoDia = useMemo(
    () =>
      sprints.find((sprint) => {
        const { inicio, fim } = sprintDayRange(sprint);
        return inicio && selecionado >= inicio && selecionado <= fim;
      }) || null,
    [sprints, selecionado]
  );

  const legendaVisivel =
    legenda.sprints.length > 0 || legenda.marcos.length > 0 || legenda.temPrazoNoMes;

  const escolherDia = (iso) => {
    const [novoAno, novoMes] = iso.split('-').map(Number);
    setSelecionado(iso);
    setMesVisivel(clampMonth(limites, { ano: novoAno, mes: novoMes - 1 }));
  };

  const corDoItem = (item) => {
    if (item.marcoId) return coresMarco[item.marcoId]?.cor || '#315bce';
    if (item.sprintId) return cores[item.sprintId]?.fg || '#315bce';
    return '#315bce';
  };

  return (
    <>
      <section className="card">
        <h2>Agora</h2>
        <ul className="agenda-now-tiles">
          {tiles.map((tile) => (
            <li className="agenda-now-tile" key={tile.label}>
              <span className="agenda-now-label">{tile.label}</span>
              <span className="agenda-now-value">{tile.value}</span>
              <span className="agenda-now-note">{tile.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="schedule-columns schedule-columns--cronograma">
        <section className="card">
          <div className="calendar-toolbar">
            <strong className="calendar-selected-day">{longDayLabel(selecionado)}</strong>
          </div>

          <div className="calendar-month">
            <strong>{monthLabel(mesExibido.ano, mesExibido.mes)}</strong>
            <div className="calendar-nav">
              <button
                type="button"
                className="calendar-nav-button"
                aria-label="Mês anterior"
                aria-disabled={noInicio}
                title={noInicio ? 'O cronograma exibido começa neste mês.' : undefined}
                onClick={() => {
                  if (noInicio) return;
                  setMesVisivel(previousMonth(mesExibido.ano, mesExibido.mes));
                }}
              >
                ▲
              </button>
              <button
                type="button"
                className="calendar-nav-button"
                aria-label="Próximo mês"
                aria-disabled={noFim}
                title={noFim ? 'O cronograma exibido termina neste mês.' : undefined}
                onClick={() => {
                  if (noFim) return;
                  setMesVisivel(nextMonth(mesExibido.ano, mesExibido.mes));
                }}
              >
                ▼
              </button>
            </div>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {INICIAIS_SEMANA.map((inicial, indice) => (
              <span key={DIAS_SEMANA_LONGOS[indice]} title={DIAS_SEMANA_LONGOS[indice]}>
                {inicial}
              </span>
            ))}
          </div>

          <div
            className="calendar-grid"
            role="group"
            aria-label={`Dias de ${monthLabel(mesExibido.ano, mesExibido.mes)}`}
          >
            {semanas.map((semana) => (
              <div
                className="calendar-week"
                key={semana.dias[0].iso}
                style={{ paddingTop: `${semana.alturaTopo}px` }}
              >
                {semana.segmentos.map((segmento) => (
                  <span
                    className="calendar-week-seg"
                    key={`seg-${segmento.marcoId}`}
                    title={segmento.titulo}
                    style={{
                      left: `${segmento.esquerda}%`,
                      width: `${segmento.largura}%`,
                      top: `${segmento.topo}px`,
                      borderRadius: `${segmento.arredondaEsquerda ? '3px' : '0'} ${segmento.arredondaDireita ? '3px' : '0'} ${segmento.arredondaDireita ? '3px' : '0'} ${segmento.arredondaEsquerda ? '3px' : '0'}`,
                      background: coresMarco[segmento.marcoId]?.cor
                    }}
                  />
                ))}
                {semana.marcadores.map((marcador) => (
                  <Fragment key={`marcador-${marcador.marcoId}`}>
                    <button
                      type="button"
                      className="calendar-week-marker"
                      aria-expanded={marcoAberto === marcador.marcoId}
                      aria-label={marcador.titulo}
                      title={marcador.titulo}
                      style={{
                        top: `${marcador.topo}px`,
                        left: `${marcador.esquerda}%`,
                        background: coresMarco[marcador.marcoId]?.cor
                      }}
                      onClick={() =>
                        setMarcoAberto(marcoAberto === marcador.marcoId ? null : marcador.marcoId)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setMarcoAberto(null);
                      }}
                    />
                    {marcoAberto === marcador.marcoId && (
                      <span
                        className="calendar-week-marker-chip"
                        style={{
                          top: `${marcador.topo - 6}px`,
                          left: `calc(${marcador.esquerda}% + 18px)`,
                          maxWidth: `calc(${marcador.largura}% - 22px)`,
                          color: coresMarco[marcador.marcoId]?.cor
                        }}
                      >
                        {marcador.texto}
                      </span>
                    )}
                  </Fragment>
                ))}
                <div className="calendar-week-days">
                  {semana.dias.map((celula) => {
                    const cor = celula.sprintId ? cores[celula.sprintId] : null;
                    const tinta = celula.marcoId ? coresMarco[celula.marcoId]?.tinta : null;
                    const canto = celula.sprintId
                      ? `${celula.inicioDaFaixa ? '999px' : '0'} ${celula.fimDaFaixa ? '999px' : '0'} ${celula.fimDaFaixa ? '999px' : '0'} ${celula.inicioDaFaixa ? '999px' : '0'}`
                      : '999px';
                    const cantoMarco = celula.marcoId
                      ? `${celula.inicioDoMarco ? '10px' : '0'} ${celula.fimDoMarco ? '10px' : '0'} ${celula.fimDoMarco ? '10px' : '0'} ${celula.inicioDoMarco ? '10px' : '0'}`
                      : '0';
                    const classes = [
                      'calendar-day',
                      celula.noMes ? '' : 'calendar-day--fora',
                      celula.selecionado ? 'calendar-day--selecionado' : '',
                      celula.hoje ? 'calendar-day--hoje' : ''
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        type="button"
                        key={celula.iso}
                        className={classes}
                        aria-pressed={celula.selecionado}
                        aria-label={celula.descricao}
                        title={celula.descricao}
                        style={{
                          '--calendar-day-bg': cor ? cor.bg : 'transparent',
                          '--calendar-day-fg': cor ? cor.fg : undefined,
                          '--calendar-day-radius': canto,
                          '--calendar-day-marco-bg': tinta || 'transparent',
                          '--calendar-day-marco-radius': cantoMarco
                        }}
                        onClick={() => escolherDia(celula.iso)}
                      >
                        <span className="calendar-day-marco" aria-hidden="true" />
                        <span className="calendar-day-faixa" aria-hidden="true" />
                        {celula.inicioDaSprint && (
                          <span
                            className="calendar-day-tick calendar-day-tick--inicio"
                            aria-hidden="true"
                          />
                        )}
                        {celula.fimDaSprint && (
                          <span
                            className="calendar-day-tick calendar-day-tick--fim"
                            aria-hidden="true"
                          />
                        )}
                        <span className="calendar-day-inner">{celula.numero}</span>
                        {celula.temPrazoDeMarco && (
                          <span
                            className="calendar-day-dot"
                            style={{
                              background: celula.prazoAgrupado
                                ? coresMarco[celula.prazoDoMarcoId]?.cor
                                : undefined
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {legendaVisivel && (
            <ul className="calendar-legend" aria-label="Legenda do mês exibido">
              {legenda.sprints.map(({ sprint, inicio, fim }) => (
                <li className="calendar-legend-item" key={`sprint-${sprint.id}`}>
                  <span
                    className="calendar-legend-swatch"
                    style={{
                      background: cores[sprint.id].bg,
                      boxShadow: `inset 0 0 0 1.5px ${cores[sprint.id].fg}`
                    }}
                  />
                  <span className="calendar-legend-text">
                    <span className="calendar-legend-name">{sprint.name}</span>
                    <span className="calendar-legend-period">
                      Sprint · {shortDate(inicio)} – {shortDate(fim)}
                    </span>
                  </span>
                </li>
              ))}
              {legenda.marcos.map((periodo) => (
                <li className="calendar-legend-item" key={`marco-${periodo.id}`}>
                  <span
                    className="calendar-legend-swatch calendar-legend-swatch--marco"
                    style={{ background: coresMarco[periodo.id]?.cor }}
                  />
                  <span className="calendar-legend-text">
                    <span className="calendar-legend-name">{periodo.title}</span>
                    <span className="calendar-legend-period">
                      Marco · agrupa {periodo.nSprints}{' '}
                      {periodo.nSprints === 1 ? 'sprint' : 'sprints'} · {shortDate(periodo.inicio)}{' '}
                      – {shortDate(periodo.fim)}
                      {periodo.fim !== periodo.prazo ? ` · prazo ${shortDate(periodo.prazo)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
              {legenda.temPrazoNoMes && (
                <li className="calendar-legend-item">
                  <span
                    className="calendar-legend-swatch"
                    style={{ background: '#fff', boxShadow: 'inset 0 0 0 1.5px #cfd6e4' }}
                  />
                  <span className="calendar-legend-text">
                    <span className="calendar-legend-name">Prazo de marco</span>
                    <span className="calendar-legend-period">Ponto sob o dia</span>
                  </span>
                </li>
              )}
            </ul>
          )}

          <div style={{ marginTop: '1.15rem' }}>
            <h3 className="agenda-now-title">Agenda de {longDayLabel(selecionado)}</h3>
            {sprintDoDia && (
              <p className="agenda-day-context">
                Dentro de {sprintDoDia.name} ({shortDate(sprintDayRange(sprintDoDia).inicio)} –{' '}
                {shortDate(sprintDayRange(sprintDoDia).fim)})
                {milestoneNames[sprintDoDia.milestoneId]
                  ? ` · marco ${milestoneNames[sprintDoDia.milestoneId]}`
                  : ''}
              </p>
            )}
            {doDia.length === 0 ? (
              <div className="agenda-empty">
                <p>Nenhum evento neste dia.</p>
                <p className="agenda-outside">
                  Inícios e fins de sprint e de marco, prazos e deadlines de tarefa aparecem aqui.
                </p>
              </div>
            ) : (
              <ul className="agenda-entries">
                {doDia.map((evento) => (
                  <li
                    className={`agenda-entry ${
                      evento.aviso
                        ? 'agenda-entry--atrasada'
                        : selecionado < hojeIso
                          ? 'agenda-entry--atenuada'
                          : ''
                    }`}
                    key={`${evento.dia}-${evento.titulo}`}
                  >
                    <p className="agenda-entry-head">
                      <span className="agenda-kind">{evento.kind.toUpperCase()}</span>
                      <span className="agenda-entry-title">{evento.titulo}</span>
                    </p>
                    <p className="agenda-entry-meta">{evento.meta}</p>
                    {evento.aviso && <p className="agenda-entry-warning">{evento.aviso}</p>}
                  </li>
                ))}
              </ul>
            )}
            {sprintDoDia && (sprintDoDia.tasks || []).length > 0 && (
              <details className="agenda-tasks">
                <summary>
                  Tarefas de {sprintDoDia.name} neste dia ({sprintDoDia.tasks.length})
                </summary>
                <ul>
                  {sprintDoDia.tasks.slice(0, LIMITE_TAREFAS_DO_DIA).map((task) => (
                    <li key={task.id}>
                      #{task.id} {task.title} — {taskStatusLabels[task.status] || task.status} ·{' '}
                      {taskPriorityLabels[task.priority] || task.priority}
                    </li>
                  ))}
                  {sprintDoDia.tasks.length > LIMITE_TAREFAS_DO_DIA && (
                    <li>
                      … e mais {sprintDoDia.tasks.length - LIMITE_TAREFAS_DO_DIA} tarefas no Kanban
                      da sprint
                    </li>
                  )}
                </ul>
              </details>
            )}
          </div>
        </section>

        <section className="card calendar-month-card">
          <h2>No mês exibido</h2>
          <p className="calendar-month-summary">
            {monthLabel(mesExibido.ano, mesExibido.mes)} · {noMes.resumo}
          </p>
          <div className="calendar-month-panel">
            {noMes.blocos.map((bloco) => (
              <div className="calendar-month-block" key={bloco.chave}>
                <h3>{bloco.titulo}</h3>
                {bloco.itens.length === 0 ? (
                  <p className="calendar-month-empty">{bloco.vazio}</p>
                ) : (
                  <ul className="calendar-month-items">
                    {bloco.itens.map((item) => (
                      <li
                        className="calendar-month-item"
                        key={item.chave}
                        style={{ borderLeftColor: corDoItem(item) }}
                      >
                        <span className="calendar-month-item-name">{item.nome}</span>
                        <span className="calendar-month-item-meta">{item.meta}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Próximos eventos</h2>
        {proximos.length === 0 ? (
          <p className="empty-state">Nenhum evento futuro no cronograma.</p>
        ) : (
          <ul className="agenda-upcoming">
            {proximos.map((evento) => (
              <li className="agenda-entry" key={`${evento.dia}-${evento.titulo}`}>
                <p className="agenda-entry-head">
                  <span className="agenda-kind">{evento.kind.toUpperCase()}</span>
                  <span className="agenda-entry-title">{evento.titulo}</span>
                </p>
                <p className="agenda-entry-meta">
                  {shortDayLabel(evento.dia)} · {evento.meta}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
