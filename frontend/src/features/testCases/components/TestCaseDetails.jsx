import { EntityRow } from '../../../shared/index.js';
import { DefectBadge } from '../../defects/index.js';
import { GithubExternalAction, TaskTraceabilityGrid, ArtifactCategory } from '../../tasks/index.js';
import { PersistedEvidence } from './PersistedEvidence.jsx';
import { environments, referenceLabel } from '../model/test-cases.js';
import { Badge, Latest } from './Parts.jsx';

function Information({ items }) {
  return (
    <dl className="tc-info">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Surface({ title, count, children }) {
  return (
    <section className={`tc-surface${count !== undefined ? ' tc-traceability-card' : ''}`}>
      <h3>
        {title}
        {count !== undefined && <span className="tc-count">({count})</span>}
      </h3>
      {children}
    </section>
  );
}
function Steps({ version, execution, onPreview, canWrite, onCreateDefect, onOpenDefect }) {
  return (
    <ol className="tc-definition">
      {version.steps.map((step, index) => {
        const result = execution?.steps.find((item) => item.position === step.position);
        return (
          <li className="tc-step-result" key={step.position}>
            <header className="tc-step-heading">
              <h4>Passo {index + 1}</h4>
              {result && <Badge value={result.result} raw />}
            </header>
            <div className={result ? 'tc-step-result-content' : undefined}>
              <div className="tc-step-definition">
                <div>
                  <small>Ação</small>
                  <p className="tc-step-action">{result ? result.actionSnapshot : step.action}</p>
                </div>
                <div>
                  <small>Resultado esperado</small>
                  <p>{result ? result.expectedResultSnapshot : step.expectedResult}</p>
                </div>
              </div>
              {result && (
                <div className="tc-step-observed">
                  <small>Resultado observado</small>
                  <p>{result.observedResult || 'Não informado'}</p>
                </div>
              )}
            </div>
            {result?.result === 'FAIL' && true && (
              <section className="tc-step-defects">
                {!!result.detectedDefects?.length && (
                  <>
                    <h4>Defeitos registrados</h4>
                    {result.detectedDefects.map((d) => (
                      <EntityRow
                        key={d.id}
                        identity={`DEF-${d.id}`}
                        title={d.title}
                        onClick={() => onOpenDefect?.(d.id)}
                      >
                        <DefectBadge value={d.severity} />
                        <DefectBadge value={d.status} />
                      </EntityRow>
                    ))}
                  </>
                )}
                {!result.detectedDefects?.length && <p>Nenhum defeito registrado nesta falha.</p>}
                {canWrite && onCreateDefect && (
                  <button
                    className="button button-secondary"
                    onClick={() => onCreateDefect(execution, result)}
                  >
                    {result.detectedDefects?.length
                      ? 'Registrar outro defeito'
                      : 'Registrar defeito'}
                  </button>
                )}
              </section>
            )}
            {result && execution.evidence.some((file) => file.executionStepId === result.id) && (
              <div className="tc-step-evidence">
                <h4>Evidências do passo</h4>
                <PersistedEvidence
                  evidence={execution.evidence.filter((file) => file.executionStepId === result.id)}
                  onPreview={onPreview}
                  source={`Passo ${index + 1} · ${result.actionSnapshot}`}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
export function TestCaseDetails({ testCase, projectId, onView, onCancel }) {
  const latest = testCase.latestExecution;
  const version = testCase;
  return (
    <div className="tc-stack">
      <Surface title="Descrição">
        <p>{testCase.description || 'Sem descrição.'}</p>
      </Surface>
      <section className="tc-section">
        <h3>Informações</h3>
        <Information
          items={[
            ['Status', <Badge key="status" value={testCase.status} />],
            ['Responsável', testCase.responsible.name],
            ['Versão atual', `v${testCase.currentVersion}`],
            ['Criado em', new Date(testCase.createdAt).toLocaleDateString('pt-BR')]
          ]}
        />
      </section>
      <div className="tc-traceability">
        <TaskTraceabilityGrid>
          <ArtifactCategory label="Requisito" count={testCase.requirement ? 1 : 0}>
            {testCase.requirement ? (
              <EntityRow
                identity={`REQ-${testCase.requirement.id}`}
                title={testCase.requirement.title}
                to={`/projects/${projectId}/requirements?requirement=${testCase.requirement.id}`}
                onClick={onCancel}
              />
            ) : (
              <p>Nenhum vínculo</p>
            )}
          </ArtifactCategory>
          <ArtifactCategory label="Tarefas" count={testCase.tasks.length}>
            <div className="task-detail-artifact-list">
              {testCase.tasks.map((task) => (
                <div key={task.id}>
                  <EntityRow
                    identity={`TASK-${task.id}`}
                    title={task.title}
                    to={`/projects/${projectId}/kanban?task=${task.id}`}
                    onClick={onCancel}
                  />
                </div>
              ))}
            </div>
            {!testCase.tasks.length && <p>Nenhum vínculo</p>}
          </ArtifactCategory>
        </TaskTraceabilityGrid>
      </div>
      <Surface title="Pré-condições">
        <p className="tc-preformatted">{version.preconditions}</p>
      </Surface>
      <section className="tc-section">
        <h3>Passos</h3>
        <Steps version={version} />
      </section>
      <Surface title="Resultado esperado">
        <p>{version.expectedResult}</p>
      </Surface>
      <Surface title="Última execução">
        <Latest execution={latest} />
        {latest && (
          <p>
            {latest.displayId} · {new Date(latest.executedAt).toLocaleString('pt-BR')} ·{' '}
            {latest.executedByDisplayNameSnapshot} · Caso v{latest.testCaseVersion}
          </p>
        )}
        <button className="button button-secondary" onClick={() => onView('history')}>
          Ver histórico
        </button>
      </Surface>
    </div>
  );
}
export function TestExecutionHistory({ executions, onSelect }) {
  return (
    <>
      <p className="field-help">Registros das execuções realizadas para este caso.</p>
      {!executions.length && <p role="status">Este caso nunca foi executado.</p>}
      {executions.map((execution) => (
        <article className="tc-history-row" key={execution.displayId}>
          <div>
            <strong>{execution.displayId}</strong> <Badge value={execution.result} raw />
            <p>
              {new Date(execution.executedAt).toLocaleString('pt-BR')} ·{' '}
              {execution.executedByDisplayNameSnapshot}
            </p>
            <p>
              {environments[execution.environment]} · {referenceLabel(execution.testedReference)} ·
              Caso v{execution.testCaseVersion}
            </p>
          </div>
          <button
            className="button button-secondary"
            aria-label={`Ver execução ${execution.displayId}`}
            onClick={() => onSelect(execution.id)}
          >
            Ver execução
          </button>
        </article>
      ))}
    </>
  );
}
export function ExecutionDetails({ execution, onPreview, canWrite, onCreateDefect, onOpenDefect }) {
  const version = execution.caseVersionSnapshot;
  return (
    <div className="tc-stack">
      <section className="tc-section">
        <h3>Informações da execução</h3>
        <Information
          items={[
            ['Resultado', <Badge key="result" value={execution.result} raw />],
            ['Executor', execution.executedByDisplayNameSnapshot],
            ['Ambiente', environments[execution.environment]],
            ['Executado em', new Date(execution.executedAt).toLocaleString('pt-BR')],
            ['Versão do caso', `Caso v${execution.testCaseVersion}`]
          ]}
        />
      </section>
      <Surface title="Versão testada">
        <div className="tc-tested-reference">
          <strong>
            {execution.testedReferenceSnapshot.type === 'PULL_REQUEST'
              ? `Pull Request #${execution.testedReferenceSnapshot.number}`
              : execution.testedReferenceSnapshot.shortHash ||
                execution.testedReferenceSnapshot.hash?.slice(0, 7)}
          </strong>
          <p>
            {execution.testedReferenceSnapshot.title || execution.testedReferenceSnapshot.message}
          </p>
          {execution.testedReferenceSnapshot.githubUrl && (
            <GithubExternalAction href={execution.testedReferenceSnapshot.githubUrl} />
          )}
        </div>
      </Surface>
      <Surface title="Pré-condições da versão executada">
        <p className="tc-preformatted">{version.preconditions}</p>
      </Surface>
      <section className="tc-section">
        <h3>Resultados dos passos</h3>
        <Steps
          version={version}
          execution={execution}
          onPreview={onPreview}
          canWrite={canWrite}
          onCreateDefect={onCreateDefect}
          onOpenDefect={onOpenDefect}
        />
      </section>
      <Surface title="Resultado esperado do caso">
        <p>{version.expectedResult}</p>
      </Surface>
      <Surface title="Evidências da execução">
        {!execution.evidence.some((file) => file.executionStepId === null) && (
          <p>Nenhuma evidência anexada.</p>
        )}
        <PersistedEvidence
          evidence={execution.evidence.filter((file) => file.executionStepId === null)}
          onPreview={onPreview}
          source="Evidência geral da execução"
        />
      </Surface>
    </div>
  );
}
