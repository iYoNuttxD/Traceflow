import { CollapsibleFilterPanel, SprintActionsMenu } from '../../schedule/index.js';
import { SearchCombobox, TraceFlowIcon } from '../../../shared/index.js';
import { requirementLabel, taskLabel } from '../model/test-cases.js';
import { Badge, Latest, SelectControl } from './Parts.jsx';

export function TestCaseSummary({ summary }) {
  const metrics = [
    ['Total', summary?.total],
    ['Ativos', summary?.active],
    ['Sem rastreabilidade', summary?.withoutTraceability],
    ['Nunca executados', summary?.neverExecuted],
    ['Com falha', summary?.withFailure]
  ];
  return (
    <section className="sprints-summary" aria-label="Resumo dos casos de teste">
      <div className="sprints-summary__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2>Visão geral dos casos de teste</h2>
        </div>
      </div>
      <dl className="tc-metrics">
        {metrics.map(([label, value]) => (
          <div className="sprints-summary__metric" key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function TestCaseFilters({
  filters,
  onChange,
  onClear,
  count,
  total,
  members,
  searchRequirements,
  searchTasks,
  selected,
  onSelect
}) {
  const activeCount = Object.values(filters).filter((value) => Boolean(value)).length;
  const select = (key, label, options) => (
    <label className="sprint-filter" key={key}>
      <span>{label}</span>
      <SelectControl value={filters[key]} onChange={(event) => onChange(key, event.target.value)}>
        <option value="">Todos</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </SelectControl>
    </label>
  );
  return (
    <CollapsibleFilterPanel
      className="sprint-filters"
      resultLabel={activeCount ? `${count} de ${total} casos` : `${total} casos`}
      activeCount={activeCount}
    >
      {activeCount > 0 && (
        <div className="planning-filter-panel__actions">
          <button type="button" className="sprint-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}
      <div className="tc-filter-grid">
        <label className="sprint-filter sprint-filter--search tc-filter-search">
          <span>Pesquisar</span>
          <span className="sprint-search-input">
            <TraceFlowIcon name="search" />
            <input
              type="search"
              placeholder="Pesquisar caso de teste..."
              value={filters.search}
              onChange={(event) => onChange('search', event.target.value)}
            />
          </span>
        </label>
        {select('status', 'Status', [
          ['ATIVO', 'Ativo'],
          ['INATIVO', 'Inativo']
        ])}
        {select(
          'responsibleUserId',
          'Responsável',
          members.map((member) => [
            member.user.id,
            `${member.user.name}${member.isActive ? '' : ' (inativo)'}`
          ])
        )}
        <SearchCombobox
          label="Requisito"
          placeholder="Pesquisar requisito..."
          onSearch={searchRequirements}
          getOptionLabel={requirementLabel}
          selectedOption={selected.requirement}
          onSelect={(item) => onSelect('requirement', item)}
          onClear={() => onSelect('requirement', null)}
        />
        <div className="tc-filter-wide">
          <SearchCombobox
            label="Tarefa relacionada"
            placeholder="Pesquisar tarefa..."
            onSearch={searchTasks}
            getOptionLabel={taskLabel}
            selectedOption={selected.task}
            onSelect={(item) => onSelect('task', item)}
            onClear={() => onSelect('task', null)}
          />
        </div>
        {select('latestResult', 'Resultado da última execução', [
          ['PASS', 'Aprovado'],
          ['FAIL', 'Falhou'],
          ['BLOCKED', 'Bloqueado'],
          ['NEVER_EXECUTED', 'Nunca executado']
        ])}
      </div>
    </CollapsibleFilterPanel>
  );
}
export function TestCaseCard({ testCase, onOpen, canWrite }) {
  const openDetails = (event) => {
    if (event.target.closest('button, a, input, [role="menu"]')) return;
    onOpen('details', testCase, event.currentTarget);
  };
  return (
    <article
      className="sprint-card tc-card"
      tabIndex={0}
      aria-label={`${testCase.displayId} · ${testCase.title}`}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          onOpen('details', testCase, event.currentTarget);
        }
      }}
    >
      <header className="tc-card-heading">
        <small>{testCase.displayId}</small>
        <Badge value={testCase.status} />
      </header>
      <div className="tc-card-body">
        <h3 title={testCase.title}>{testCase.title}</h3>
        <div className="tc-card-responsible" title={`Responsável: ${testCase.responsible.name}`}>
          <span className="tc-avatar" aria-hidden="true">
            {testCase.responsible.name.trim().charAt(0).toLocaleUpperCase('pt-BR')}
          </span>
          <span>{testCase.responsible.name}</span>
        </div>
        <p
          className="tc-card-metadata"
          title={
            testCase.requirement
              ? requirementLabel(testCase.requirement)
              : 'Sem requisito vinculado'
          }
        >
          <TraceFlowIcon name="branch" />
          <span>
            {testCase.requirement
              ? requirementLabel(testCase.requirement)
              : 'Sem requisito vinculado'}
          </span>
        </p>
        <p className="tc-card-metadata">
          <TraceFlowIcon name="code" />
          <span>
            {testCase.taskCount}{' '}
            {testCase.taskCount === 1 ? 'tarefa relacionada' : 'tarefas relacionadas'}
          </span>
        </p>
        <Latest execution={testCase.latestExecution} />
      </div>
      <footer className="sprint-card__actions">
        {canWrite && (
          <button
            className="button button-primary"
            disabled={testCase.status === 'INATIVO'}
            title={
              testCase.status === 'INATIVO'
                ? 'Caso inativo; ative na edição para executar.'
                : undefined
            }
            onClick={(event) => onOpen('execute', testCase, event.currentTarget)}
          >
            Executar
          </button>
        )}
        <button
          className="button button-secondary"
          onClick={(event) => onOpen('history', testCase, event.currentTarget)}
        >
          Histórico
        </button>
        {canWrite && (
          <SprintActionsMenu
            entityName={testCase.displayId}
            entityDescriptor="do caso"
            items={[
              {
                key: 'edit',
                label: 'Editar',
                onSelect: (trigger) => onOpen('edit', testCase, trigger)
              },
              {
                key: 'delete',
                label: 'Excluir caso',
                danger: true,
                onSelect: (trigger) => onOpen('delete', testCase, trigger)
              }
            ]}
          />
        )}
      </footer>
    </article>
  );
}
export function NewCaseCard({ onOpen }) {
  return (
    <button
      className="new-milestone-card tc-new-card"
      onClick={(event) => onOpen('create', null, event.currentTarget)}
    >
      <span className="new-milestone-card__icon">
        <TraceFlowIcon name="plus" />
      </span>
      <strong>Novo caso de teste</strong>
      <small>Defina um novo cenário de validação.</small>
    </button>
  );
}
