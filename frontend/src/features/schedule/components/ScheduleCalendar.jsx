import { useMemo, useState } from 'react';
import {
  INICIAIS_SEMANA,
  buildEvents,
  buildMonthGrid,
  calendarBounds,
  clampMonth,
  eventsForDay,
  longDayLabel,
  monthLabel,
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

export function ScheduleCalendar({ schedule, milestoneNames = {}, hoje = new Date() }) {
  const hojeIso = todayIsoDay(hoje);
  const [selecionado, setSelecionado] = useState(hojeIso);
  const [{ ano, mes }, setMesVisivel] = useState(() => ({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth()
  }));

  const sprints = useMemo(
    () => (schedule?.sprints || []).filter((sprint) => sprint.status !== 'CANCELADA'),
    [schedule]
  );
  const milestones = useMemo(() => schedule?.milestones || [], [schedule]);

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
  const celulas = useMemo(
    () =>
      buildMonthGrid({
        ano: mesExibido.ano,
        mes: mesExibido.mes,
        sprints,
        milestones,
        hojeIso,
        selecionadoIso: selecionado
      }),
    [mesExibido.ano, mesExibido.mes, sprints, milestones, hojeIso, selecionado]
  );
  const eventos = useMemo(
    () => buildEvents({ sprints, milestones, milestoneNames, hojeIso }),
    [sprints, milestones, milestoneNames, hojeIso]
  );
  const doDia = useMemo(() => eventsForDay(eventos, selecionado), [eventos, selecionado]);
  const proximos = useMemo(() => upcomingEvents(eventos, hojeIso), [eventos, hojeIso]);
  const tiles = useMemo(
    () => nowTiles({ sprints, milestones, hojeIso }),
    [sprints, milestones, hojeIso]
  );

  const escolherDia = (iso) => {
    const [novoAno, novoMes] = iso.split('-').map(Number);
    setSelecionado(iso);
    setMesVisivel(clampMonth(limites, { ano: novoAno, mes: novoMes - 1 }));
  };

  return (
    <div className="schedule-columns">
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
          {celulas.map((celula) => {
            const cor = celula.sprintId ? cores[celula.sprintId] : null;
            const canto = celula.sprintId
              ? `${celula.inicioDaFaixa ? '999px' : '0'} ${celula.fimDaFaixa ? '999px' : '0'} ${celula.fimDaFaixa ? '999px' : '0'} ${celula.inicioDaFaixa ? '999px' : '0'}`
              : '999px';
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
                aria-label={[
                  longDayLabel(celula.iso),
                  celula.sprintNome,
                  celula.temPrazoDeMarco ? 'prazo de marco' : ''
                ]
                  .filter(Boolean)
                  .join(' — ')}
                style={{
                  '--calendar-day-bg': cor ? cor.bg : 'transparent',
                  '--calendar-day-fg': cor ? cor.fg : undefined,
                  '--calendar-day-radius': canto
                }}
                onClick={() => escolherDia(celula.iso)}
              >
                <span className="calendar-day-inner">{celula.numero}</span>
                {celula.temPrazoDeMarco && <span className="calendar-day-dot" />}
              </button>
            );
          })}
        </div>

        <ul className="calendar-legend">
          {sprints.map((sprint) => {
            const { inicio, fim } = sprintDayRange(sprint);
            return (
              <li className="calendar-legend-item" key={sprint.id}>
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
                    {shortDate(inicio)} – {shortDate(fim)}
                  </span>
                </span>
              </li>
            );
          })}
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
        </ul>

        <div style={{ marginTop: '1.15rem' }}>
          <h3 className="agenda-now-title">Agenda de {longDayLabel(selecionado)}</h3>
          {doDia.length === 0 ? (
            <div className="agenda-empty">
              <p>Nenhum evento neste dia.</p>
              <p className="agenda-outside">
                Inícios e fins de sprint e prazos de marco aparecem aqui.
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
        </div>
      </section>

      <div style={{ display: 'grid', gap: '1.5rem', alignContent: 'start' }}>
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

        <section className="card">
          <h2>Próximos eventos</h2>
          {proximos.length === 0 ? (
            <p className="empty-state">Nenhum evento futuro no cronograma.</p>
          ) : (
            <ul className="agenda-entries">
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
      </div>
    </div>
  );
}
