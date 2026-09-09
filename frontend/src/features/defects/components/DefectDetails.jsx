import { useEffect, useRef } from 'react';
import { EntityRow } from '../../../shared/index.js';
import { ArtifactCategory, TaskTraceabilityGrid, GithubExternalAction } from '../../tasks/index.js';
import { PersistedEvidence, environments, referenceLabel } from '../../testCases/index.js';
import {
  statuses,
  severities,
  statusReason,
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
export function CorrectionTaskRows({ tasks, projectId, onNavigate }) {
  return (
    <div className="defect-entity-list">
      {tasks.map((t) => (
        <EntityRow
          key={t.id}
          identity={`TASK-${t.id}`}
          title={t.title}
          to={`/projects/${projectId}/kanban?task=${t.id}`}
          onClick={onNavigate}
        >
          {t.status && <span>{taskStatuses[t.status]}</span>}
          {(t.responsibleUser?.name || t.responsible) && (
            <span>{t.responsibleUser?.name || t.responsible}</span>
          )}
          {(t.pullRequestId || t.pullRequest) && (
            <span>
              {t.pullRequest?.number ? `PR #${t.pullRequest.number}` : 'PR vinculada'}
              {t.commitLinks?.length ? ` · ${t.commitLinks.length} commits` : ''}
            </span>
          )}
        </EntityRow>
      ))}
    </div>
  );
}
export function DefectDetails({
  defect: d,
  canWrite,
  onView,
  onPreview,
  onNavigate,
  onExecution,
  focusCorrection = false
}) {
  const correctionRef = useRef(null);
  useEffect(() => {
    if (focusCorrection) {
      correctionRef.current?.scrollIntoView?.({ block: 'start' });
      correctionRef.current?.focus({ preventScroll: true });
    }
  }, [focusCorrection]);
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
      <CorrectionTaskRows tasks={c.tasks} projectId={d.projectId} onNavigate={onNavigate} />
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
    <div className="defect-details">
      {d.description && <p className="task-detail-description tc-preformatted">{d.description}</p>}
      <section className="task-detail-section">
        <h3>Informações</h3>
        <dl className="task-detail-grid">
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
      <section className="task-detail-section">
        <h3>Detecção</h3>
        <EntityRow
          identity={detection.testCase.displayId}
          title={detection.testCase.title}
          onClick={onNavigate}
          to={`/projects/${d.projectId}/test-cases?case=${detection.testCase.id}`}
        >
          Caso v{detection.testCase.version}
        </EntityRow>
        <EntityRow
          identity={detection.execution.displayId}
          onClick={() => onExecution(detection.execution.id)}
        >
          <span>Falhou · Caso v{detection.testCase.version}</span>
          <span>
            {environments[detection.execution.environment]} ·{' '}
            {dateLabel(detection.execution.executedAt)}
          </span>
        </EntityRow>
        {ref && (
          <div className="defect-reference">
            <span>Versão testada: {referenceLabel(ref)}</span>
            {ref.githubUrl && <GithubExternalAction href={ref.githubUrl} />}
          </div>
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
      <TaskTraceabilityGrid>
        <ArtifactCategory label="Requisito" count={d.requirement ? 1 : 0}>
          {d.requirement ? (
            <EntityRow
              identity={`REQ-${d.requirement.id}`}
              title={d.requirement.title}
              onClick={onNavigate}
              to={`/projects/${d.projectId}/requirements?requirement=${d.requirement.id}`}
            >
              {d.requirement.status}
            </EntityRow>
          ) : (
            <p>Nenhum requisito vinculado.</p>
          )}
        </ArtifactCategory>
        <ArtifactCategory label="Tarefas de origem" count={d.originTasks.length}>
          <CorrectionTaskRows
            tasks={d.originTasks}
            projectId={d.projectId}
            onNavigate={onNavigate}
          />
          {!d.originTasks.length && <p>Nenhuma tarefa de origem.</p>}
        </ArtifactCategory>
      </TaskTraceabilityGrid>
      <section
        className="task-detail-section"
        ref={correctionRef}
        tabIndex={-1}
        aria-label="Correção"
      >
        <div className="task-detail-section-heading">
          <h3>Correção</h3>
          {canWrite && d.status !== 'VALIDADO' && (
            <button
              className="button button-secondary button-compact"
              onClick={() => onView('correction')}
            >
              Gerenciar correção
            </button>
          )}
        </div>

        <h4>Ciclo atual · {d.currentCorrectionCycle}</h4>
        {!current?.tasks.length && <p>Nenhuma tarefa de correção vinculada.</p>}
        {current && cycleContent(current)}
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
      <section className="task-detail-section">
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
      </section>
      <button className="button button-secondary button-compact" onClick={() => onView('history')}>
        Histórico
      </button>
    </div>
  );
}
