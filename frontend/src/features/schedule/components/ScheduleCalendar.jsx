import { useEffect, useMemo, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import {
  milestoneStatusLabels,
  sprintStatusLabels,
  summarizeSprintTasks,
  taskPriorityLabels,
  taskStatusLabels
} from './schedule-display.js';
import {
  INICIAIS_SEMANA,
  buildMonthGrid,
  diffDaysIso,
  fullDate,
  getCurrentScheduleSummary,
  getDayContext,
  getDayEvents,
  getMonthEntities,
  getScheduleTasks,
  getUpcomingDeadlines,
  longDayLabel,
  monthLabel,
  nextMonth,
  previousMonth,
  relativeDayLabel,
  shortDate,
  sprintDayRange,
  todayIsoDay,
  toIsoDay
} from './schedule-calendar.js';
import {
  SCHEDULE_COLOR_SLOT_COUNT,
  assignScheduleEntitySlots,
  scheduleEntityKey,
  scheduleEntityStyle
} from './schedule-palette.js';

const MONTH_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'milestones', label: 'Marcos' },
  { key: 'sprints', label: 'Sprints' },
  { key: 'tasks', label: 'Tarefas' }
];

function plural(total, singular, pluralLabel) {
  return `${total} ${total === 1 ? singular : pluralLabel}`;
}

function scheduleStatusClass(status) {
  return `schedule-status--${String(status || '').toLowerCase()}`;
}

function NowSummary({ summary, todayDay }) {
  const current = summary.currentSprint;
  const currentRange = current ? sprintDayRange(current) : null;
  const currentTasks = current ? summarizeSprintTasks(current) : null;
  const nextMilestone = summary.nextMilestone;
  const deadlines = summary.deadlines;

  return (
    <section className="schedule-now" aria-labelledby="schedule-now-title">
      <div className="schedule-surface-heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2 id="schedule-now-title">Situação atual</h2>
        </div>
        <p>Panorama do planejamento na data de hoje.</p>
      </div>
      <div className="schedule-now__metrics">
        <article className="schedule-now__metric">
          <span>Sprint atual</span>
          <strong>{current?.name || 'Nenhuma em andamento'}</strong>
          {current ? (
            <>
              <small>
                {shortDate(currentRange.inicio)} – {shortDate(currentRange.fim)}
              </small>
              <small>
                {plural(currentTasks.done, 'tarefa concluída', 'tarefas concluídas')} de{' '}
                {currentTasks.total}
                {currentTasks.points > 0
                  ? ` · ${currentTasks.donePoints}/${currentTasks.points} pts`
                  : ''}
              </small>
            </>
          ) : null}
        </article>

        <article
          className={`schedule-now__metric${nextMilestone?.overdue ? ' schedule-now__metric--danger' : ''}`}
        >
          <span>Próximo marco</span>
          <strong>{nextMilestone?.milestone.title || 'Nenhum'}</strong>
          {nextMilestone ? (
            <>
              <small>Prazo {fullDate(nextMilestone.day)}</small>
              <small>
                {nextMilestone.overdue
                  ? `Atrasado há ${diffDaysIso(nextMilestone.day, todayDay)} dia(s)`
                  : relativeDayLabel(nextMilestone.day, todayDay)}
              </small>
              {nextMilestone.progress.total > 0 && (
                <small>
                  {nextMilestone.progress.done} de {nextMilestone.progress.total}{' '}
                  {nextMilestone.progress.total === 1 ? 'Sprint concluída' : 'Sprints concluídas'}
                </small>
              )}
            </>
          ) : (
            <small>Nenhum Marco pendente.</small>
          )}
        </article>

        <article
          className={`schedule-now__metric${deadlines.total ? ' schedule-now__metric--warning' : ''}`}
        >
          <span>Prazos</span>
          <strong>
            {deadlines.total
              ? plural(deadlines.total, 'item atrasado', 'itens atrasados')
              : 'Nenhum atraso'}
          </strong>
          <small>
            {deadlines.total
              ? [
                  deadlines.milestoneCount
                    ? plural(deadlines.milestoneCount, 'Marco', 'Marcos')
                    : null,
                  deadlines.taskCount ? plural(deadlines.taskCount, 'tarefa', 'tarefas') : null
                ]
                  .filter(Boolean)
                  .join(' · ')
              : summary.nextDeadline
                ? `Próximo: ${shortDate(summary.nextDeadline.day)} · ${summary.nextDeadline.title}`
                : 'Nenhum prazo futuro.'}
          </small>
          {deadlines.items[0] && (
            <small className="schedule-now__attention-item">
              {deadlines.items[0].type}: {deadlines.items[0].title}
            </small>
          )}
        </article>
      </div>
    </section>
  );
}

function CalendarLegend() {
  return (
    <ul className="schedule-legend" aria-label="Legenda do cronograma">
      <li>
        <span className="schedule-legend__range" aria-hidden="true" />
        Sprint
      </li>
      <li>
        <span className="schedule-legend__diamond" aria-hidden="true" />
        Prazo de Marco
      </li>
      <li>
        <span className="schedule-legend__dot" aria-hidden="true" />
        Prazo de tarefa
      </li>
      <li>
        <span className="schedule-legend__today" aria-hidden="true" />
        Hoje
      </li>
    </ul>
  );
}

function CalendarCell({ cell, colorSlots, onSelect }) {
  const milestoneEvent = cell.events.find((event) => event.type === 'MILESTONE_DUE');
  const taskEvent = cell.events.find((event) => event.type === 'TASK_DEADLINE');
  return (
    <button
      type="button"
      className={[
        'schedule-day',
        !cell.inMonth && 'schedule-day--outside',
        cell.today && 'schedule-day--today',
        cell.selected && 'schedule-day--selected'
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={cell.description}
      aria-pressed={cell.selected}
      onClick={() => onSelect(cell.day)}
    >
      <span className="schedule-day__sprint-lanes">
        {cell.sprintSegments.map((segment) => (
          <span
            aria-label={`Sprint: ${segment.sprint.name}. Status: ${sprintStatusLabels[segment.sprint.status] || segment.sprint.status}`}
            data-schedule-entity={scheduleEntityKey('sprint', segment.sprint.id)}
            role="img"
            style={scheduleEntityStyle(colorSlots, 'sprint', segment.sprint.id)}
            className={[
              'schedule-day__sprint-range',
              `schedule-day__sprint-range--lane-${segment.lane}`,
              scheduleStatusClass(segment.sprint.status),
              segment.beginsSegment && 'schedule-day__sprint-range--start',
              segment.endsSegment && 'schedule-day__sprint-range--end'
            ]
              .filter(Boolean)
              .join(' ')}
            key={`range-${segment.sprint.id}-${cell.day}`}
          >
            {segment.beginsSegment && (
              <span className="schedule-day__sprint-label">{segment.sprint.name}</span>
            )}
          </span>
        ))}
        {cell.sprintOverflowCount > 0 && (
          <span className="schedule-day__sprint-overflow">+{cell.sprintOverflowCount} Sprints</span>
        )}
      </span>
      <span className="schedule-day__number-lane">
        <span className="schedule-day__number">{cell.number}</span>
      </span>
      <span className="schedule-day__markers" aria-hidden="true">
        {cell.milestoneCount > 0 && (
          <span
            className="schedule-day__milestone-marker"
            style={scheduleEntityStyle(colorSlots, 'milestone', milestoneEvent.milestone.id)}
          >
            {cell.milestoneCount > 1 && <b>{cell.milestoneCount}</b>}
          </span>
        )}
        {cell.taskCount > 0 && (
          <span
            className="schedule-day__task-marker"
            style={scheduleEntityStyle(colorSlots, 'task', taskEvent.task.id)}
          >
            <i />
            {cell.taskCount > 1 && <b>{cell.taskCount}</b>}
          </span>
        )}
      </span>
    </button>
  );
}

function MonthItem({ item, colorSlots, onSelect }) {
  if (item.type === 'milestones') {
    const { milestone, day } = item.value;
    return (
      <li>
        <button type="button" onClick={() => onSelect(day)}>
          <span
            className="schedule-month-item__marker schedule-month-item__marker--milestone"
            style={scheduleEntityStyle(colorSlots, 'milestone', milestone.id)}
          />
          <span>
            <strong>{milestone.title}</strong>
            <small>Prazo {fullDate(day)}</small>
            <small>{milestoneStatusLabels[milestone.status] || milestone.status}</small>
          </span>
        </button>
      </li>
    );
  }

  if (item.type === 'sprints') {
    const { sprint, milestone, inicio, fim } = item.value;
    return (
      <li>
        <button type="button" onClick={() => onSelect(inicio)}>
          <span
            className="schedule-month-item__marker schedule-month-item__marker--sprint"
            style={scheduleEntityStyle(colorSlots, 'sprint', sprint.id)}
          />
          <span>
            <strong>{sprint.name}</strong>
            <small>
              {shortDate(inicio)} – {shortDate(fim)}
            </small>
            <small>{sprintStatusLabels[sprint.status] || sprint.status}</small>
            <small>{milestone ? `Marco ${milestone.title}` : 'Sem marco'}</small>
          </span>
        </button>
      </li>
    );
  }

  const task = item.value;
  return (
    <li>
      <button type="button" onClick={() => onSelect(task.day)}>
        <span
          className="schedule-month-item__marker schedule-month-item__marker--task"
          style={scheduleEntityStyle(colorSlots, 'task', task.id)}
        />
        <span>
          <strong>
            #{task.id} {task.title}
          </strong>
          <small>{fullDate(task.day)}</small>
          <small>
            {taskStatusLabels[task.status] || task.status} ·{' '}
            {taskPriorityLabels[task.priority] || task.priority} · {task.sprintName || 'Sem sprint'}
          </small>
        </span>
      </button>
    </li>
  );
}

function MonthContextView({
  visibleMonth,
  entities,
  filter,
  colorSlots,
  hidden,
  onFilter,
  onSelect
}) {
  const allItems = useMemo(
    () =>
      [
        ...entities.milestones.map((value) => ({
          key: `month-milestone-${value.milestone.id}`,
          type: 'milestones',
          day: value.day,
          value
        })),
        ...entities.sprints.map((value) => ({
          key: `month-sprint-${value.sprint.id}`,
          type: 'sprints',
          day: value.inicio,
          value
        })),
        ...entities.tasks.map((value) => ({
          key: `month-task-${value.id}`,
          type: 'tasks',
          day: value.day,
          value
        }))
      ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.key.localeCompare(b.key))),
    [entities]
  );
  const visible = filter === 'all' ? allItems : allItems.filter((item) => item.type === filter);
  const total = allItems.length;
  const counts = { all: total, ...entities.counts };
  const selectedLabel = MONTH_FILTERS.find((item) => item.key === filter)?.label || 'Itens';

  return (
    <section
      id="schedule-context-month"
      className="schedule-context-view schedule-month-panel"
      aria-labelledby="month-panel-title"
      hidden={hidden}
    >
      <div className="schedule-context-view__heading">
        <div>
          <span className="eyebrow">No mês exibido</span>
          <h3 id="month-panel-title">{monthLabel(visibleMonth.ano, visibleMonth.mes)}</h3>
        </div>
        <p>
          {plural(entities.counts.milestones, 'Marco', 'Marcos')} ·{' '}
          {plural(entities.counts.sprints, 'Sprint', 'Sprints')} ·{' '}
          {plural(entities.counts.tasks, 'tarefa', 'tarefas')}
        </p>
      </div>
      <div className="schedule-type-filters" aria-label="Filtrar resumo do mês por tipo">
        {MONTH_FILTERS.map((item) => (
          <button
            type="button"
            aria-pressed={filter === item.key}
            key={item.key}
            onClick={() => onFilter(item.key)}
          >
            {item.label} <span>{counts[item.key]}</span>
          </button>
        ))}
      </div>
      <div className="schedule-month-panel__body" tabIndex="0">
        {visible.length ? (
          <ul className="schedule-month-items" aria-label={`${selectedLabel} no mês exibido`}>
            {visible.map((item) => (
              <MonthItem item={item} colorSlots={colorSlots} key={item.key} onSelect={onSelect} />
            ))}
          </ul>
        ) : (
          <p className="schedule-compact-empty" role="status">
            {filter === 'all' && 'Nenhum item com data neste mês.'}
            {filter === 'milestones' && 'Nenhum Marco com prazo neste mês.'}
            {filter === 'sprints' && 'Nenhuma Sprint neste mês.'}
            {filter === 'tasks' && 'Nenhuma Tarefa com prazo neste mês.'}
          </p>
        )}
      </div>
    </section>
  );
}

function itemEntity(item) {
  if (item.sprint) return { type: 'sprint', id: item.sprint.id };
  if (item.milestone) return { type: 'milestone', id: item.milestone.id };
  return { type: 'task', id: item.task.id };
}

function EventMarker({ item, colorSlots }) {
  const entity = itemEntity(item);
  return (
    <span
      className={`schedule-event-marker schedule-event-marker--${item.type.toLowerCase()}`}
      style={scheduleEntityStyle(colorSlots, entity.type, entity.id)}
    />
  );
}

function DayContextView({ day, events, context, colorSlots, hidden }) {
  return (
    <section
      id="schedule-context-day"
      className="schedule-context-view schedule-selected-day"
      aria-labelledby="selected-day-title"
      aria-live="polite"
      hidden={hidden}
    >
      <div className="schedule-context-view__heading">
        <div>
          <span className="eyebrow">Dia selecionado</span>
          <h3 id="selected-day-title">{longDayLabel(day)}</h3>
        </div>
      </div>

      <div className="schedule-selected-day__body" tabIndex="0">
        <div className="schedule-day-section">
          <h3>Eventos do dia</h3>
          {events.length ? (
            <ul className="schedule-event-list">
              {events.map((event) => (
                <li
                  className={event.overdue ? 'schedule-event--overdue' : undefined}
                  key={event.key}
                >
                  <EventMarker item={event} colorSlots={colorSlots} />
                  <span>
                    <small>{event.kind}</small>
                    <strong>{event.title}</strong>
                    <span>{event.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="schedule-compact-empty">Nenhum evento com data neste dia.</p>
          )}
        </div>

        <div className="schedule-day-section">
          <h3>Contexto do dia</h3>
          {context.activeSprints.length ? (
            <ul className="schedule-context-list">
              {context.activeSprints.map(({ sprint, startDay, endDay, milestone }) => (
                <li
                  key={`context-${sprint.id}-${day}`}
                  style={scheduleEntityStyle(colorSlots, 'sprint', sprint.id)}
                >
                  <span>Sprint ativa neste dia</span>
                  <strong>{sprint.name}</strong>
                  <small>
                    {shortDate(startDay)} – {shortDate(endDay)} ·{' '}
                    {sprintStatusLabels[sprint.status] || sprint.status}
                  </small>
                  {milestone && (
                    <small>
                      Marco {milestone.title} · prazo {shortDate(toIsoDay(milestone.dueDate))}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="schedule-compact-empty">Nenhuma Sprint ativa neste dia.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ContextPanel({
  mode,
  visibleMonth,
  monthEntities,
  monthFilter,
  selectedDay,
  selectedEvents,
  selectedContext,
  colorSlots,
  onModeChange,
  onMonthFilter,
  onSelectDay
}) {
  return (
    <aside className="schedule-context" aria-labelledby="schedule-context-title">
      <div className="schedule-context__heading">
        <div>
          <span className="eyebrow">Contexto</span>
          <h2 id="schedule-context-title">Explore o cronograma</h2>
        </div>
        <div
          className="schedule-context__switch"
          role="group"
          aria-label="Visualização do contexto"
        >
          <button
            type="button"
            aria-controls="schedule-context-month"
            aria-pressed={mode === 'month'}
            onClick={() => onModeChange('month')}
          >
            Mês
          </button>
          <button
            type="button"
            aria-controls="schedule-context-day"
            aria-pressed={mode === 'day'}
            onClick={() => onModeChange('day')}
          >
            Dia
          </button>
        </div>
      </div>

      <MonthContextView
        colorSlots={colorSlots}
        entities={monthEntities}
        filter={monthFilter}
        hidden={mode !== 'month'}
        onFilter={onMonthFilter}
        onSelect={onSelectDay}
        visibleMonth={visibleMonth}
      />
      <DayContextView
        colorSlots={colorSlots}
        context={selectedContext}
        day={selectedDay}
        events={selectedEvents}
        hidden={mode !== 'day'}
      />
    </aside>
  );
}

function UpcomingDeadlines({ items, todayDay, colorSlots }) {
  return (
    <section className="schedule-upcoming" aria-labelledby="schedule-upcoming-title">
      <div className="schedule-surface-heading">
        <div>
          <span className="eyebrow">Planejamento futuro</span>
          <h2 id="schedule-upcoming-title">Próximos prazos</h2>
        </div>
        <p>Deadlines de tarefas, prazos de Marcos e encerramentos de Sprints.</p>
      </div>
      {items.length ? (
        <ol className="schedule-upcoming__list" tabIndex="0">
          {items.map((item) => (
            <li key={item.key}>
              <time dateTime={item.day}>
                <strong>{shortDate(item.day)}</strong>
                <span>{relativeDayLabel(item.day, todayDay)}</span>
              </time>
              <EventMarker item={item} colorSlots={colorSlots} />
              <span>
                <small>{item.kind}</small>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="schedule-compact-empty">Nenhum prazo futuro.</p>
      )}
    </section>
  );
}

export function ScheduleCalendar({ schedule, hoje = new Date() }) {
  const todayDay = todayIsoDay(hoje);
  const [selectedDay, setSelectedDay] = useState(todayDay);
  const [visibleMonth, setVisibleMonth] = useState(() => ({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth()
  }));
  const [monthFilter, setMonthFilter] = useState('all');
  const [contextMode, setContextMode] = useState('month');
  const colorHistoryRef = useRef({ slots: new Map(), visibleKeys: new Set() });
  const sprints = useMemo(() => schedule?.sprints || [], [schedule]);
  const milestones = useMemo(() => schedule?.milestones || [], [schedule]);
  const tasks = useMemo(
    () =>
      getScheduleTasks({
        sprints,
        unassignedTasks: schedule?.unassignedTasks || []
      }),
    [schedule, sprints]
  );
  const summary = useMemo(
    () => getCurrentScheduleSummary({ sprints, milestones, tasks, todayDay, now: hoje }),
    [hoje, milestones, sprints, tasks, todayDay]
  );
  const monthEntities = useMemo(
    () =>
      getMonthEntities({
        ano: visibleMonth.ano,
        mes: visibleMonth.mes,
        sprints,
        milestones,
        tasks
      }),
    [milestones, sprints, tasks, visibleMonth]
  );
  const selectedEvents = useMemo(
    () => getDayEvents({ day: selectedDay, sprints, milestones, tasks, todayDay, now: hoje }),
    [hoje, milestones, selectedDay, sprints, tasks, todayDay]
  );
  const selectedContext = useMemo(
    () => getDayContext({ day: selectedDay, sprints, milestones }),
    [milestones, selectedDay, sprints]
  );
  const upcoming = useMemo(
    () => getUpcomingDeadlines({ sprints, milestones, tasks, todayDay, now: hoje }),
    [hoje, milestones, sprints, tasks, todayDay]
  );
  const colorPlan = useMemo(() => {
    const visible = [
      ...monthEntities.sprints.map(({ sprint }) => ({ type: 'sprint', id: sprint.id })),
      ...monthEntities.milestones.map(({ milestone }) => ({
        type: 'milestone',
        id: milestone.id
      })),
      ...monthEntities.tasks.map((task) => ({ type: 'task', id: task.id })),
      ...selectedEvents.map(itemEntity),
      ...selectedContext.activeSprints.map(({ sprint }) => ({ type: 'sprint', id: sprint.id })),
      ...upcoming.map(itemEntity)
    ];
    const remaining = [
      ...sprints.map((sprint) => ({ type: 'sprint', id: sprint.id })),
      ...milestones.map((milestone) => ({ type: 'milestone', id: milestone.id })),
      ...tasks.map((task) => ({ type: 'task', id: task.id }))
    ];
    return {
      slots: assignScheduleEntitySlots({
        visible,
        remaining,
        previousSlots: colorHistoryRef.current.slots,
        previousVisibleKeys: colorHistoryRef.current.visibleKeys,
        slotCount: SCHEDULE_COLOR_SLOT_COUNT
      }),
      visibleKeys: new Set(visible.map((entity) => scheduleEntityKey(entity.type, entity.id)))
    };
  }, [milestones, monthEntities, selectedContext, selectedEvents, sprints, tasks, upcoming]);
  const colorSlots = colorPlan.slots;
  const cells = useMemo(
    () =>
      buildMonthGrid({
        ano: visibleMonth.ano,
        mes: visibleMonth.mes,
        sprints,
        milestones,
        tasks,
        todayDay,
        selectedDay,
        now: hoje
      }),
    [hoje, milestones, selectedDay, sprints, tasks, todayDay, visibleMonth]
  );
  useEffect(() => {
    colorHistoryRef.current = colorPlan;
  }, [colorPlan]);

  const selectDay = (day) => {
    const [ano, mes] = day.split('-').map(Number);
    setSelectedDay(day);
    setVisibleMonth({ ano, mes: mes - 1 });
    setContextMode('day');
  };

  const navigateMonth = (target) => {
    setVisibleMonth(target);
    setSelectedDay(toIsoDay(new Date(target.ano, target.mes, 1)));
    setContextMode('month');
  };

  const goToToday = () => {
    setSelectedDay(todayDay);
    setVisibleMonth({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
    setContextMode('day');
  };

  return (
    <div className="schedule-workspace">
      <NowSummary summary={summary} todayDay={todayDay} />

      <div className="schedule-layout">
        <section className="schedule-calendar" aria-labelledby="schedule-calendar-title">
          <div className="schedule-calendar__toolbar">
            <div>
              <span className="eyebrow">Calendário</span>
              <h2 id="schedule-calendar-title">{monthLabel(visibleMonth.ano, visibleMonth.mes)}</h2>
            </div>
            <div className="schedule-calendar__navigation" aria-label="Navegação do calendário">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => navigateMonth(previousMonth(visibleMonth.ano, visibleMonth.mes))}
              >
                <TraceFlowIcon name="arrowLeft" />
              </button>
              <button type="button" className="schedule-calendar__today" onClick={goToToday}>
                Hoje
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => navigateMonth(nextMonth(visibleMonth.ano, visibleMonth.mes))}
              >
                <TraceFlowIcon name="arrowRight" />
              </button>
            </div>
          </div>

          <div className="schedule-calendar__weekdays" aria-hidden="true">
            {INICIAIS_SEMANA.map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="schedule-calendar__days">
            {cells.map((cell) => (
              <CalendarCell
                cell={cell}
                colorSlots={colorSlots}
                key={cell.day}
                onSelect={selectDay}
              />
            ))}
          </div>
          <CalendarLegend />
        </section>

        <ContextPanel
          colorSlots={colorSlots}
          mode={contextMode}
          monthEntities={monthEntities}
          monthFilter={monthFilter}
          onModeChange={setContextMode}
          onMonthFilter={setMonthFilter}
          onSelectDay={selectDay}
          selectedContext={selectedContext}
          selectedDay={selectedDay}
          selectedEvents={selectedEvents}
          visibleMonth={visibleMonth}
        />
      </div>

      <UpcomingDeadlines items={upcoming} todayDay={todayDay} colorSlots={colorSlots} />
    </div>
  );
}
