import { Link } from 'react-router';
import { PersistedEvidence, environments, referenceLabel } from '../../testCases/index.js';
import {
  statuses,
  severities,
  statusReason,
  taskLabel,
  requirementLabel,
  taskStatuses,
  dateLabel,
  executionLabel
} from '../model/defects.js';
export function DefectBadge({ value }) {
  return (
    <span className={`tc-badge defect-badge defect-badge--${value?.toLowerCase()}`}>
      {statuses[value] || severities[value] || value}
    </span>
  );
}
function TaskLinks({ tasks, projectId, onNavigate }) {
  return (
    <ul className="defect-related-list">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link onClick={onNavigate} to={`/projects/${projectId}/kanban?task=${t.id}`}>
            {taskLabel(t)}
          </Link>
          {t.status && <small>{taskStatuses[t.status]}</small>}
          {t.pullRequestId && (
            <small>
              PR vinculada{t.commitLinks?.length ? ` · ${t.commitLinks.length} commits` : ''}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}
export function DefectDetails({ defect: d, canWrite, onView, onPreview, onNavigate, onExecution }) {
  const detection = d.detection,
    current = d.correctionCycles.find((c) => c.cycle === d.currentCorrectionCycle),
    ref = detection.execution.testedReference;
  const retests = (cycle) => d.retests.filter((r) => r.correctionCycle === cycle);
  const executionLink = (r) => (
    <button
      className="button button-outline button-compact"
      onClick={() => onExecution(r.testExecutionId)}
    >
      {executionLabel(r.testExecutionId)} · {r.execution.result}
    </button>
  );
  const cycleContent = (c) => (
    <>
      <TaskLinks tasks={c.tasks} projectId={d.projectId} onNavigate={onNavigate} />
      {retests(c.cycle).map((r) => (
        <p key={r.id}>
          Reteste: {executionLink(r)} · {dateLabel(r.execution.executedAt)}
          {r.execution.result === 'FAIL' && ' · Correção não confirmada.'}
        </p>
      ))}
      {!retests(c.cycle).length && <p className="field-help">Reteste ainda não realizado.</p>}
    </>
  );
  return (
    <div className="tc-stack defect-details">
      {d.description && <p className="task-detail-description tc-preformatted">{d.description}</p>}
      <section className="tc-surface">
        <h3>Informações</h3>
        <dl className="tc-info">
          <div>
            <dt>Severidade</dt>
            <dd>
              <DefectBadge value={d.severity} />
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd className="tc-card-responsible">
              <span className="tc-avatar" aria-hidden="true">
                {d.responsibleUser.name.slice(0, 1)}
              </span>
              {d.responsibleUser.name}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <DefectBadge value={d.status} />
            </dd>
          </div>
          <div>
            <dt>Aberto em</dt>
            <dd>{dateLabel(d.createdAt)}</dd>
          </div>
        </dl>
        <p className="field-help">{statusReason(d)}</p>
      </section>
      <section className="tc-surface">
        <h3>Detecção</h3>
        <Link
          className="tc-link"
          onClick={onNavigate}
          to={`/projects/${d.projectId}/test-cases?case=${detection.testCase.id}`}
        >
          {detection.testCase.displayId} · {detection.testCase.title}
        </Link>
        <p>
          <button
            className="button button-outline button-compact"
            onClick={() => onExecution(detection.execution.id)}
          >
            {detection.execution.displayId} · Falhou
          </button>{' '}
          · Caso v{detection.testCase.version}
        </p>
        <p>
          {environments[detection.execution.environment]} ·{' '}
          {dateLabel(detection.execution.executedAt)}
        </p>
        {ref && (
          <p>
            Versão testada:{' '}
            {ref.githubUrl ? (
              <a className="tc-link" href={ref.githubUrl} target="_blank" rel="noreferrer">
                {referenceLabel(ref)}
              </a>
            ) : (
              referenceLabel(ref)
            )}
          </p>
        )}
        <section className="tc-step-result tc-step-result--fail">
          <h4>Passo {detection.failedStep.position} · Falhou</h4>
          <div className="tc-step-definition">
            <div>
              <small>Ação</small>
              <p className="tc-preformatted">{detection.failedStep.action}</p>
            </div>
            <div>
              <small>Resultado esperado</small>
              <p className="tc-preformatted">{detection.failedStep.expectedResult}</p>
            </div>
          </div>
          <div className="tc-step-observed">
            <small>Resultado observado</small>
            <p className="tc-preformatted">{detection.failedStep.observedResult}</p>
          </div>
          <PersistedEvidence
            evidence={detection.failedStep.evidence}
            onPreview={onPreview}
            source={`Detecção · Passo ${detection.failedStep.position}`}
          />
        </section>
        {!!detection.executionEvidence.length && (
          <section>
            <h4>Evidências gerais da execução</h4>
            <PersistedEvidence
              evidence={detection.executionEvidence}
              onPreview={onPreview}
              source="Detecção · Evidência geral"
            />
          </section>
        )}
      </section>
      <section>
        <h3>Rastreabilidade</h3>
        <div className="tc-columns">
          <section className="tc-surface">
            <h4>Requisito ({d.requirement ? 1 : 0})</h4>
            {d.requirement ? (
              <Link
                className="tc-link"
                onClick={onNavigate}
                to={`/projects/${d.projectId}/requirements?requirement=${d.requirement.id}`}
              >
                {requirementLabel(d.requirement)}
              </Link>
            ) : (
              <p>Nenhum requisito vinculado.</p>
            )}
          </section>
          <section className="tc-surface">
            <h4>Tarefas de origem ({d.originTasks.length})</h4>
            <TaskLinks tasks={d.originTasks} projectId={d.projectId} onNavigate={onNavigate} />
            {!d.originTasks.length && <p>Nenhuma tarefa de origem.</p>}
          </section>
        </div>
      </section>
      <section className="tc-surface">
        <h3>Correção</h3>
        <h4>Ciclo atual · {d.currentCorrectionCycle}</h4>
        {!current?.tasks.length && <p>Nenhuma tarefa de correção vinculada.</p>}
        {current && cycleContent(current)}
        {canWrite && d.status !== 'VALIDADO' && (
          <button className="button button-secondary" onClick={() => onView('correction')}>
            Gerenciar correção
          </button>
        )}
        {d.correctionCycles.some((c) => c.cycle !== d.currentCorrectionCycle) && (
          <section>
            <h4>Tentativas anteriores</h4>
            {d.correctionCycles
              .filter((c) => c.cycle !== d.currentCorrectionCycle)
              .map((c) => (
                <details key={c.cycle}>
                  <summary>Ciclo {c.cycle}</summary>
                  {cycleContent(c)}
                </details>
              ))}
          </section>
        )}
      </section>
      <section className="tc-surface">
        <h3>Validação</h3>
        <DefectBadge value={d.status} />
        <p>
          {d.status === 'VALIDADO'
            ? statusReason(d)
            : d.status === 'AGUARDANDO_RETESTE'
              ? 'Todas as tarefas de correção do ciclo atual foram concluídas.'
              : 'Reteste disponível após a conclusão das tarefas de correção do ciclo atual.'}
        </p>
        {d.statusReason.validatedByExecutionId && (
          <button
            className="button button-outline button-compact"
            onClick={() => onExecution(d.statusReason.validatedByExecutionId)}
          >
            Ver {executionLabel(d.statusReason.validatedByExecutionId)}
          </button>
        )}
        {canWrite && d.status === 'AGUARDANDO_RETESTE' && (
          <button className="button button-primary" onClick={() => onView('retest')}>
            Retestar
          </button>
        )}
      </section>
      <button className="button button-secondary" onClick={() => onView('history')}>
        Histórico
      </button>
    </div>
  );
}
